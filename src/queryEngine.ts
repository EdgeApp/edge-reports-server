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
import {
  asApp,
  asApps,
  asDisablePartnerQuery,
  asProgressSettings,
  DbTx,
  DisablePartnerQuery,
  ScopedLog,
  StandardTx
} from './types'
import {
  createScopedLog,
  datelog,
  promiseTimeout,
  standardizeNames
} from './util'

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
  const dbSettings: nano.DocumentScope<unknown> = nanoDb.db.use(
    'reports_settings'
  )

  while (true) {
    datelog('Starting query loop...')
    let disablePartnerQuery: DisablePartnerQuery = {
      plugins: {},
      appPartners: {}
    }
    try {
      const disablePartnerQueryDoc = await dbSettings.get('disablePartnerQuery')
      if (disablePartnerQueryDoc != null) {
        disablePartnerQuery = asDisablePartnerQuery(disablePartnerQueryDoc)
      }
    } catch (e) {
      datelog('Error getting disablePartnerQuery', e)
    }
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
        if (config.soloPartnerIds?.includes(partnerId) !== true) {
          if (disablePartnerQuery.plugins[pluginId]) {
            continue
          }
          const appPartnerId = `${app.appId}_${partnerId}`
          if (disablePartnerQuery.appPartners[appPartnerId]) {
            continue
          }
          if (
            config.soloPartnerIds != null &&
            !config.soloPartnerIds.includes(partnerId)
          ) {
            continue
          }
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

const checkUpdateTx = (
  oldTx: StandardTx,
  newTx: StandardTx
): string[] => {
  const changedFields: string[] = []

  if (oldTx.status !== newTx.status) changedFields.push('status')
  if (oldTx.depositChainPluginId !== newTx.depositChainPluginId)
    changedFields.push('depositChainPluginId')
  if (oldTx.depositEvmChainId !== newTx.depositEvmChainId)
    changedFields.push('depositEvmChainId')
  if (oldTx.depositTokenId !== newTx.depositTokenId)
    changedFields.push('depositTokenId')
  if (oldTx.payoutChainPluginId !== newTx.payoutChainPluginId)
    changedFields.push('payoutChainPluginId')
  if (oldTx.payoutEvmChainId !== newTx.payoutEvmChainId)
    changedFields.push('payoutEvmChainId')
  if (oldTx.payoutTokenId !== newTx.payoutTokenId)
    changedFields.push('payoutTokenId')

  return changedFields
}

const filterAddNewTxs = async (
  pluginId: string,
  dbTransactions: nano.DocumentScope<StandardTx>,
  docIds: string[],
  transactions: StandardTx[],
  log: ScopedLog
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

    if (
      queryResult == null ||
      !('doc' in queryResult) ||
      queryResult.doc == null
    ) {
      // Get the full transaction
      const newObj = { _id: docId, _rev: undefined, ...tx }

      // replace all fields with non-standard names
      newObj.depositCurrency = standardizeNames(newObj.depositCurrency)
      newObj.payoutCurrency = standardizeNames(newObj.payoutCurrency)

      log(`[filterAddNewTxs] new doc id: ${newObj._id}`)
      newDocs.push(newObj)
    } else {
      const changedFields = checkUpdateTx(queryResult.doc, tx)
      if (changedFields.length > 0) {
        const oldStatus = queryResult.doc?.status
        const newStatus = tx.status
        const newObj = { _id: docId, _rev: queryResult.doc?._rev, ...tx }
        newDocs.push(newObj)
        log(
          `[filterAddNewTxs] updated doc id: ${
            newObj._id
          } ${oldStatus} -> ${newStatus} [${changedFields.join(', ')}]`
        )
      }
    }
  }

  try {
    await promiseTimeout(
      'pagination',
      pagination(newDocs, dbTransactions, log),
      log
    )
  } catch (e) {
    log.error('[filterAddNewTxs] Error doing bulk transaction insert', e)
    throw e
  }
}

async function insertTransactions(
  transactions: StandardTx[],
  pluginId: string,
  log: ScopedLog
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

    log(`[insertTransactions] ${startIndex} to ${i} of ${transactions.length}`)
    await filterAddNewTxs(pluginId, dbTransactions, docIds, transactions, log)
    docIds = []
    startIndex = i + 1
  }
  await filterAddNewTxs(pluginId, dbTransactions, docIds, transactions, log)
}

async function runPlugin(
  app: ReturnType<typeof asApp>,
  partnerId: string,
  pluginId: string,
  dbProgress: nano.DocumentScope<unknown>
): Promise<string> {
  const start = Date.now()
  const log = createScopedLog(app.appId, partnerId)
  let errorText = ''
  try {
    // obtains function that corresponds to current pluginId
    const plugin = plugins.find(plugin => plugin.pluginId === pluginId)
    // if current plugin is not within the list of partners skip to next
    if (plugin === undefined) {
      errorText = `[runPlugin] Missing or disabled plugin`
      log(errorText)
      return errorText
    }

    // get progress cache to see where previous query ended
    log(`[runPlugin] Starting with plugin:${pluginId}`)
    const progressCacheFileName = `${app.appId.toLowerCase()}:${partnerId}`
    const out = await dbProgress.get(progressCacheFileName).catch(e => {
      if (e.error != null && e.error === 'not_found') {
        log(`[runPlugin] Previous Progress Record Not Found`)
        return {}
      } else {
        log.error('[runPlugin] Error fetching progress', e)
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
    log(`[runPlugin] Querying`)
    // run the plugin function
    const result = await promiseTimeout(
      'queryFunc',
      plugin.queryFunc({
        apiKeys,
        settings,
        log
      }),
      log
    )
    log(`[runPlugin] Successful query`)

    await promiseTimeout(
      'insertTransactions',
      insertTransactions(result.transactions, `${app.appId}_${partnerId}`, log),
      log
    )
    progressSettings.progressCache = result.settings
    progressSettings._id = progressCacheFileName
    await promiseTimeout(
      'dbProgress.insert',
      dbProgress.insert(progressSettings),
      log
    )
    // Returning a successful completion message
    const completionTime = (Date.now() - start) / 1000
    const successfulCompletionMessage = `Successful update in ${completionTime} seconds.`
    log(`[runPlugin] ${successfulCompletionMessage}`)
    return successfulCompletionMessage
  } catch (e) {
    errorText = `[runPlugin] Error: ${e}`
    log.error(errorText)
    return errorText
  }
}
