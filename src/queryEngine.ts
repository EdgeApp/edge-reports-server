import { asArray, asMap, asObject, asString } from 'cleaners'
import nano from 'nano'

import config from '../config.json'
import { bitrefill } from './partners/bitrefill'
// Query Partner Functions
import { bitsofgold } from './partners/bitsofgold'
import { bity } from './partners/bity'
import { changelly } from './partners/changelly'
import { changenow } from './partners/changenow'
import { coinswitch } from './partners/coinswitch'
import { faast } from './partners/faast'
import { fox } from './partners/fox'
import { godex } from './partners/godex'
import { libertyx } from './partners/libertyx'
import { moonpay } from './partners/moonpay'
import { paytrie } from './partners/paytrie'
import { safello } from './partners/safello'
import { simplex } from './partners/simplex'
import { switchain } from './partners/switchain'
import { totle } from './partners/totle'
import { transak } from './partners/transak'
import { wyre } from './partners/wyre'
// Cleaners
import { asProgressSettings, DbTx, StandardTx } from './types'

const asApp = asObject({
  appId: asString,
  pluginIds: asMap(asMap(asString))
})
const asApps = asArray(asApp)

const datelog = function(...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}

const nanoDb = nano(config.couchDbFullpath)
const DB_NAMES = [
  { name: 'reports_apps' },
  { name: 'reports_transactions', options: { partitioned: true } },
  { name: 'reports_progresscache', options: { partitioned: true } }
]

const partners = [
  bitsofgold,
  bity,
  bitrefill,
  changelly,
  changenow,
  coinswitch,
  faast,
  fox,
  godex,
  libertyx,
  moonpay,
  paytrie,
  safello,
  switchain,
  totle,
  transak,
  simplex,
  wyre
]
const QUERY_FREQ_MS = 29 * 60 * 1000
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
  }
  const dbProgress = nanoDb.db.use('reports_progresscache')
  const dbApps = nanoDb.db.use('reports_apps')
  while (true) {
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
    // loop over every app
    for (const app of apps) {
      // loop over every pluginId that app uses
      for (const pluginId in app.pluginIds) {
        // obtains function that corresponds to current pluginId
        const pluginFunction = partners.find(func => func.pluginId === pluginId)
        // if current plugin is not within the list of partners skip to next
        if (pluginFunction === undefined) {
          datelog(`Plugin Name '${pluginId}' not found`)
          continue
        }

        // get progress cache to see where previous query ended
        datelog(`Starting with partner: ${pluginId}, app: ${app.appId}`)
        const progressCacheFileName = `${app.appId.toLowerCase()}:${pluginId}`
        const out = await dbProgress.get(progressCacheFileName).catch(e => {
          if (e.error != null && e.error === 'not_found') {
            datelog('Previous Progress Record Not Found')
            return {}
          } else {
            throw e
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
        const apiKeys =
          Object.keys(app.pluginIds[pluginId]).length !== 0
            ? app.pluginIds[pluginId]
            : {}
        const settings = progressSettings.progressCache
        datelog(`Querying partner: ${pluginId}, app: ${app.appId}`)
        try {
          // run the plugin function
          const result = await pluginFunction.queryFunc({
            apiKeys,
            settings
          })
          datelog(
            `Updating database with transactions and settings for partner: ${pluginId}, app: ${app.appId}`
          )
          await insertTransactions(
            result.transactions,
            `${app.appId}_${pluginId}`
          )
          progressSettings.progressCache = result.settings
          progressSettings._id = progressCacheFileName
          await dbProgress.insert(progressSettings)
          datelog(
            `Finished updating database with transactions and settings for partner: ${pluginId}, app: ${app.appId}`
          )
        } catch (e) {
          datelog(`Error updating partner: ${pluginId}, app: ${app.appId}`, e)
        }
      }
    }
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
    const key = (pluginId + ':' + transaction.orderId).toLowerCase()
    const result = await dbTransactions.get(key).catch(e => {
      if (e != null && e.error === 'not_found') {
        return {}
      } else {
        throw e
      }
    })
    const newObj = { _rev: undefined, ...result, ...transaction, _id: key }

    if (
      newObj.depositCurrency === 'USDT20' ||
      newObj.depositCurrency === 'USDTERC20'
    ) {
      newObj.depositCurrency = 'USDT'
    }
    if (newObj.depositCurrency === 'BCHABC') {
      newObj.depositCurrency = 'BCH'
    }
    if (newObj.depositCurrency === 'BCHSV') {
      newObj.depositCurrency = 'BSV'
    }

    if (
      newObj.payoutCurrency === 'USDT20' ||
      newObj.payoutCurrency === 'USDTERC20'
    ) {
      newObj.payoutCurrency = 'USDT'
    }
    if (newObj.payoutCurrency === 'BCHABC') {
      newObj.payoutCurrency = 'BCH'
    }
    if (newObj.payoutCurrency === 'BCHSV') {
      newObj.payoutCurrency = 'BSV'
    }

    datelog(`id: ${newObj._id}. revision: ${newObj._rev}`)
    transactionsArray.push(newObj)
  }
  try {
    const docs = await dbTransactions.bulk({ docs: transactionsArray })
    let numErrors = 0
    for (const doc of docs) {
      if (doc.error != null) {
        datelog(
          `There was an error in the batch ${doc.error}.  id: ${doc.id}. revision: ${doc.rev}`
        )
        numErrors++
        // throw new Error(`There was an error in the batch ${doc.error}`)
      }
    }
    datelog(`total errors: ${numErrors}`)
  } catch (e) {
    datelog('Error doing bulk transaction insert', e)
    throw e
  }
}
