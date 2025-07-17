import nano from 'nano'

import { config } from './config'
import { pagination } from './dbutils'
import { banxa } from './partners/banxa'
import { bitaccess } from './partners/bitaccess'
import { bitrefill } from './partners/bitrefill'
import { bitsofgold } from './partners/bitsofgold'
import { bity } from './partners/bity'
import { changehero } from './partners/changehero'
import { changelly } from './partners/changelly'
import { changenow } from './partners/changenow'
import { exolix } from './partners/exolix'
import { foxExchange } from './partners/foxExchange'
import { gebo } from './partners/gebo'
import { godex } from './partners/godex'
import { ioniaGiftCards } from './partners/ioniagiftcard'
import { ioniaVisaRewards } from './partners/ioniavisarewards'
import { kado } from './partners/kado'
import { letsexchange } from './partners/letsexchange'
import { libertyx } from './partners/libertyx'
import { lifi } from './partners/lifi'
import { moonpay } from './partners/moonpay'
import { paybis } from './partners/paybis'
import { paytrie } from './partners/paytrie'
import { safello } from './partners/safello'
import { sideshift } from './partners/sideshift'
import { simplex } from './partners/simplex'
import { swapuz } from './partners/swapuz'
import { switchain } from './partners/switchain'
import { maya, thorchain } from './partners/thorchain'
import { transak } from './partners/transak'
import { wyre } from './partners/wyre'
import { xanpool } from './partners/xanpool'
import { asApp, asApps, asProgressSettings, DbTx, StandardTx } from './types'
import { datelog, promiseTimeout, standardizeNames } from './util'

const nanoDb = nano(config.couchDbFullpath)

const plugins = [
  banxa,
  bitaccess,
  bitsofgold,
  bity,
  bitrefill,
  changelly,
  changenow,
  changehero,
  exolix,
  foxExchange,
  gebo,
  godex,
  ioniaVisaRewards,
  ioniaGiftCards,
  kado,
  letsexchange,
  libertyx,
  lifi,
  maya,
  moonpay,
  paybis,
  paytrie,
  safello,
  sideshift,
  simplex,
  swapuz,
  switchain,
  thorchain,
  transak,
  wyre,
  xanpool
]
const QUERY_FREQ_MS = 60 * 1000
const MAX_CONCURRENT_QUERIES = 3
const BULK_FETCH_SIZE = 50
const snooze: Function = async (ms: number) =>
  await new Promise((resolve: Function) => setTimeout(resolve, ms))

export async function queryEngine(): Promise<void> {
  const dbProgress = nanoDb.db.use('reports_progresscache')
  const dbApps = nanoDb.db.use('reports_apps')

  while (true) {
    datelog('Starting query loop...')
    // get the contents of all reports_apps docs
    const query = {
      selector: {
        appId: { $exists: true }
      },
      limit: 1000000
    }
    const rawApps = await dbApps.find(query)
    const apps = asApps(rawApps.docs)
    let promiseArray: Array<Promise<string>> = []
    let remainingPartners: String[] = []
    // loop over every app
    for (const app of apps) {
      if (config.soloAppIds != null && !config.soloAppIds.includes(app.appId)) {
        continue
      }
      let partnerStatus: string[] = []
      // loop over every pluginId that app uses
      remainingPartners = Object.keys(app.partnerIds)
      for (const partnerId in app.partnerIds) {
        const pluginId = app.partnerIds[partnerId].pluginId ?? partnerId

        if (
          config.soloPartnerIds != null &&
          !config.soloPartnerIds.includes(partnerId)
        ) {
          continue
        }
        remainingPartners.push(partnerId)
        promiseArray.push(
          runPlugin(app, partnerId, pluginId, dbProgress).finally(() => {
            remainingPartners = remainingPartners.filter(
              string => string !== partnerId
            )
            if (remainingPartners.length > 0) {
              datelog(
                `REMAINING PLUGINS for ${app.appId}:`,
                remainingPartners.join(', ')
              )
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
    datelog(`Snoozing for ${QUERY_FREQ_MS} milliseconds`)
    await snooze(QUERY_FREQ_MS)
  }
}

const filterAddNewTxs = async (
  pluginId: string,
  dbTransactions: nano.DocumentScope<StandardTx>,
  docIds: string[],
  transactions: StandardTx[]
): Promise<void> => {
  if (docIds.length < 1 || transactions.length < 1) return
  const queryResults = await dbTransactions.fetch(
    { keys: docIds },
    { include_docs: true }
  )

  const newDocs: DbTx[] = []
  for (const docId of docIds) {
    const queryResult = queryResults.rows.find(
      doc => 'id' in doc && doc.id === docId && doc.doc != null
    )
    const orderId = docId.split(':')[1] ?? ''
    const tx = transactions.find(tx => tx.orderId === orderId)
    if (tx == null) {
      throw new Error(`Cant find tx from docId ${docId}`)
    }

    if (queryResult == null) {
      // Get the full transaction
      const newObj = { _id: docId, _rev: undefined, ...tx }

      // replace all fields with non-standard names
      newObj.depositCurrency = standardizeNames(newObj.depositCurrency)
      newObj.payoutCurrency = standardizeNames(newObj.payoutCurrency)

      datelog(`new doc id: ${newObj._id}`)
      newDocs.push(newObj)
    } else {
      if ('doc' in queryResult) {
        if (tx.status !== queryResult.doc?.status) {
          const oldStatus = queryResult.doc?.status
          const newStatus = tx.status
          const newObj = { _id: docId, _rev: queryResult.doc?._rev, ...tx }
          newDocs.push(newObj)
          datelog(`updated doc id: ${newObj._id} ${oldStatus} -> ${newStatus}`)
        }
      }
    }
  }

  try {
    await promiseTimeout('pagination', pagination(newDocs, dbTransactions))
  } catch (e) {
    datelog('Error doing bulk transaction insert', e)
    throw e
  }
}

async function insertTransactions(
  transactions: StandardTx[],
  pluginId: string
): Promise<any> {
  const dbTransactions: nano.DocumentScope<StandardTx> = nanoDb.db.use(
    'reports_transactions'
  )
  let docIds: string[] = []
  let startIndex = 0
  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i]
    transaction.orderId = transaction.orderId.toLowerCase()
    const key = `${pluginId}:${transaction.orderId}`
    docIds.push(key)

    // Collect a batch of docIds
    if (docIds.length < BULK_FETCH_SIZE) continue

    datelog(
      `insertTransactions ${startIndex} to ${i} of ${transactions.length}`
    )
    await filterAddNewTxs(pluginId, dbTransactions, docIds, transactions)
    docIds = []
    startIndex = i + 1
  }
  await filterAddNewTxs(pluginId, dbTransactions, docIds, transactions)
}

async function runPlugin(
  app: ReturnType<typeof asApp>,
  partnerId: string,
  pluginId: string,
  dbProgress: nano.DocumentScope<unknown>
): Promise<string> {
  const start = Date.now()
  let errorText = ''
  try {
    // obtains function that corresponds to current pluginId
    const plugin = plugins.find(plugin => plugin.pluginId === pluginId)
    // if current plugin is not within the list of partners skip to next
    if (plugin === undefined) {
      errorText = `Missing or disabled plugin ${app.appId.toLowerCase()}_${partnerId}`
      datelog(errorText)
      return errorText
    }

    // get progress cache to see where previous query ended
    datelog(
      `Starting with partner:${partnerId} plugin:${pluginId}, app: ${app.appId}`
    )
    const progressCacheFileName = `${app.appId.toLowerCase()}:${partnerId}`
    const out = await dbProgress.get(progressCacheFileName).catch(e => {
      if (e.error != null && e.error === 'not_found') {
        datelog(
          `Previous Progress Record Not Found ${app.appId.toLowerCase()}_${partnerId}`
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
    const { apiKeys } = app.partnerIds[partnerId]
    const settings = progressSettings.progressCache
    datelog(`Querying ${app.appId.toLowerCase()}_${partnerId}`)
    // run the plugin function
    const result = await promiseTimeout(
      'queryFunc',
      plugin.queryFunc({
        apiKeys,
        settings
      })
    )
    datelog(`Successful query: ${app.appId.toLowerCase()}_${partnerId}`)

    await promiseTimeout(
      'insertTransactions',
      insertTransactions(result.transactions, `${app.appId}_${partnerId}`)
    )
    progressSettings.progressCache = result.settings
    progressSettings._id = progressCacheFileName
    await promiseTimeout(
      'dbProgress.insert',
      dbProgress.insert(progressSettings)
    )
    // Returning a successful completion message
    const completionTime = (Date.now() - start) / 1000
    const successfulCompletionMessage = `Successful update: ${app.appId.toLowerCase()}_${partnerId} in ${completionTime} seconds.`
    datelog(successfulCompletionMessage)
    return successfulCompletionMessage
  } catch (e) {
    errorText = `Error: ${app.appId.toLowerCase()}_${partnerId}. Error message: ${e}`
    datelog(errorText)
    return errorText
  }
}
