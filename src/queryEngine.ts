import { asArray, asMap, asObject, asString } from 'cleaners'
import nano from 'nano'

import config from '../config.json'
import { cacheEngine } from './cacheEngine'
import { banxa } from './partners/banxa'
import { bitaccess } from './partners/bitaccess'
import { bitrefill } from './partners/bitrefill'
import { bitsofgold } from './partners/bitsofgold'
import { bity } from './partners/bity'
import { changelly } from './partners/changelly'
import { changenow } from './partners/changenow'
import { exolix } from './partners/exolix'
import { foxExchange } from './partners/foxExchange'
import { gebo } from './partners/gebo'
import { godex } from './partners/godex'
import { letsexchange } from './partners/letsexchange'
import { libertyx } from './partners/libertyx'
import { moonpay } from './partners/moonpay'
import { paytrie } from './partners/paytrie'
import { safello } from './partners/safello'
import { sideshift } from './partners/sideshift'
import { simplex } from './partners/simplex'
import { switchain } from './partners/switchain'
import { transak } from './partners/transak'
import { wyre } from './partners/wyre'
import { asProgressSettings, DbTx, StandardTx } from './types'
import { datelog, pagination, promiseTimeout, standardizeNames } from './util'

const asApp = asObject({
  appId: asString,
  pluginIds: asMap(asMap(asString))
})
const asApps = asArray(asApp)

const nanoDb = nano(config.couchDbFullpath)

const DB_NAMES = [
  { name: 'reports_apps' },
  { name: 'reports_settings' },
  {
    name: 'reports_transactions',
    options: { partitioned: true },
    indexes: [
      {
        index: { fields: ['timestamp'] },
        ddoc: 'timestamp-index',
        name: 'Timestamp',
        type: 'json' as 'json',
        partitioned: true
      }
    ]
  },
  { name: 'reports_progresscache', options: { partitioned: true } }
]

const partners = [
  banxa,
  bitaccess,
  bitsofgold,
  bity,
  bitrefill,
  changelly,
  changenow,
  exolix,
  foxExchange,
  gebo,
  godex,
  letsexchange,
  libertyx,
  moonpay,
  paytrie,
  safello,
  sideshift,
  switchain,
  transak,
  simplex,
  wyre
]
const QUERY_FREQ_MS = 60 * 1000
const MAX_CONCURRENT_QUERIES = 3
const snooze: Function = async (ms: number) =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))

export async function queryEngine(): Promise<void> {
  // get a list of all databases within couchdb
  const result = await nanoDb.db.list()
  datelog(result)
  // if database does not exist, create it
  for (const dbName of DB_NAMES) {
    if (!result.includes(dbName.name)) {
      await nanoDb.db.create(dbName.name, dbName.options)
    }
    if (dbName.indexes !== undefined) {
      const currentDb = nanoDb.db.use(dbName.name)
      for (const dbIndex of dbName.indexes) {
        try {
          await currentDb.get(`_design/${dbIndex.ddoc}`)
          datelog(`${dbName.name} already has '${dbIndex.name}' index.`)
        } catch {
          await currentDb.createIndex(dbIndex)
          datelog(`Created '${dbIndex.name}' index for ${dbName.name}.`)
        }
      }
    }
  }

  const dbProgress = nanoDb.db.use('reports_progresscache')
  const dbApps = nanoDb.db.use('reports_apps')

  while (true) {
    datelog('Starting query loop...')
    // get the contents of all reports_apps docs
    const query = {
      selector: {
        appId: { $exists: true }
      },
      fields: ['appId', 'pluginIds'],
      limit: 1000000
    }
    const rawApps = await dbApps.find(query)
    const apps = asApps(rawApps.docs)
    let promiseArray: Array<Promise<string>> = []
    let remainingPlugins: String[] = []
    // loop over every app
    for (const app of apps) {
      let partnerStatus: string[] = []
      // loop over every pluginId that app uses
      remainingPlugins = Object.keys(app.pluginIds)
      for (const pluginId in app.pluginIds) {
        remainingPlugins.push(pluginId)
        promiseArray.push(
          runPlugin(app, pluginId, dbProgress).finally(() => {
            remainingPlugins = remainingPlugins.filter(
              string => string !== pluginId
            )
            if (remainingPlugins.length > 0) {
              datelog('REMAINING PLUGINS:', remainingPlugins.join(', '))
            }
          })
        )
        if (promiseArray.length >= MAX_CONCURRENT_QUERIES) {
          const status = await Promise.all(promiseArray)
          // log how long every app + plugin took to run
          datelog(status)
          partnerStatus = [...partnerStatus, ...status]
          promiseArray = []
        }
      }
      datelog(partnerStatus)
    }
    const partnerStatus = await Promise.all(promiseArray)
    // log how long every app + plugin took to run
    datelog(partnerStatus)
    // run cache on new transactions
    await cacheEngine().catch(e => console.log(e))
    datelog(`Snoozing for ${QUERY_FREQ_MS} milliseconds`)
    await snooze(QUERY_FREQ_MS)
  }
}

async function insertTransactions(
  transactions: StandardTx[],
  pluginId: string
): Promise<any> {
  const dbTransactions: nano.DocumentScope<DbTx> = nanoDb.db.use(
    'reports_transactions'
  )
  const transactionsArray: StandardTx[] = []
  for (const transaction of transactions) {
    // TODO: Add batching for more than 500 transactions
    transaction.orderId = transaction.orderId.toLowerCase()
    const key = `${pluginId}:${transaction.orderId}`
    const result = await dbTransactions.get(key).catch(e => {
      if (e != null && e.error === 'not_found') {
        return {}
      } else {
        throw e
      }
    })
    // no duplicate transactions
    if (Object.keys(result).length > 0) {
      continue
    }
    const newObj = { _rev: undefined, ...result, ...transaction, _id: key }

    // replace all fields with non-standard names
    newObj.depositCurrency = standardizeNames(newObj.depositCurrency)
    newObj.payoutCurrency = standardizeNames(newObj.payoutCurrency)

    datelog(`id: ${newObj._id}. revision: ${newObj._rev}`)
    transactionsArray.push(newObj)
  }
  try {
    await promiseTimeout(
      'pagination',
      pagination(transactionsArray, dbTransactions)
    )
  } catch (e) {
    datelog('Error doing bulk transaction insert', e)
    throw e
  }
}

async function runPlugin(
  app: ReturnType<typeof asApp>,
  pluginId: string,
  dbProgress: nano.DocumentScope<unknown>
): Promise<string> {
  const start = Date.now()
  let errorText = ''
  try {
    // obtains function that corresponds to current pluginId
    const plugin = partners.find(partner => partner.pluginId === pluginId)
    // if current plugin is not within the list of partners skip to next
    if (plugin === undefined) {
      errorText = `Missing or disabled plugin ${app.appId.toLowerCase()}_${pluginId}`
      datelog(errorText)
      return errorText
    }

    // get progress cache to see where previous query ended
    datelog(`Starting with partner: ${pluginId}, app: ${app.appId}`)
    const progressCacheFileName = `${app.appId.toLowerCase()}:${pluginId}`
    const out = await dbProgress.get(progressCacheFileName).catch(e => {
      if (e.error != null && e.error === 'not_found') {
        datelog(
          `Previous Progress Record Not Found ${app.appId.toLowerCase()}_${pluginId}`
        )
        return {}
      } else {
        console.log(e)
      }
    })

    // initialize progress settings if unrecognized format
    let progressSettings: ReturnType<typeof asProgressSettings>
    try {
      progressSettings = asProgressSettings(out)
    } catch (e) {
      progressSettings = {
        progressCache: {},
        _id: undefined,
        _rev: undefined
      }
    }

    // set apiKeys and settings for use in partner's function
    const apiKeys = app.pluginIds[pluginId]
    const settings = progressSettings.progressCache
    datelog(`Querying ${app.appId.toLowerCase()}_${pluginId}`)
    // run the plugin function
    const result = await promiseTimeout(
      'queryFunc',
      plugin.queryFunc({
        apiKeys,
        settings
      })
    )
    datelog(`Successful query: ${app.appId.toLowerCase()}_${pluginId}`)

    await promiseTimeout(
      'insertTransactions',
      insertTransactions(result.transactions, `${app.appId}_${pluginId}`)
    )
    progressSettings.progressCache = result.settings
    progressSettings._id = progressCacheFileName
    await promiseTimeout(
      'dbProgress.insert',
      dbProgress.insert(progressSettings)
    )
    // Returning a successful completion message
    const completionTime = (Date.now() - start) / 1000
    const successfulCompletionMessage = `Successful update: ${app.appId.toLowerCase()}_${pluginId} in ${completionTime} seconds.`
    datelog(successfulCompletionMessage)
    return successfulCompletionMessage
  } catch (e) {
    errorText = `Error: ${app.appId.toLowerCase()}_${pluginId}. Error message: ${e}`
    datelog(errorText)
    return errorText
  }
}
