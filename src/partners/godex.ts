import { asArray, asObject, asOptional, asString, asUnknown } from 'cleaners'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp } from '../util'

const asGodexPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, '0')
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString)
  })
})

const asGodexTx = asObject({
  transaction_id: asString,
  hash_in: asString,
  deposit: asString,
  coin_from: asString,
  deposit_amount: asString,
  withdrawal: asString,
  coin_to: asString,
  withdrawal_amount: asString,
  created_at: asString
})

const asGodexResult = asArray(asUnknown)

const LIMIT = 100
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

export async function queryGodex(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asGodexPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings
  // let latestIsoDate = '2023-01-04T19:36:46.000Z'

  if (typeof apiKey !== 'string') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const ssFormatTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let done = false
  let offset = 0
  try {
    while (!done) {
      let oldestIsoDate = '999999999999999999999999999999999999'

      const url = `https://api.nrnb.io/api/v1/affiliate/history?status=success&limit=${LIMIT}&offset=${offset}`
      const headers = {
        'public-key': apiKey
      }

      const result = await retryFetch(url, { method: 'GET', headers: headers })
      const resultJSON = await result.json()
      const txs = asGodexResult(resultJSON)

      for (const rawtx of txs) {
        const tx = asGodexTx(rawtx)
        const ts = parseInt(tx.created_at)
        const { isoDate, timestamp } = smartIsoDateFromTimestamp(ts)
        const ssTx: StandardTx = {
          status: 'complete',
          orderId: tx.hash_in,
          depositTxid: tx.hash_in,
          depositAddress: tx.deposit,
          depositCurrency: tx.coin_from.toUpperCase(),
          depositAmount: parseFloat(tx.deposit_amount),
          payoutTxid: undefined,
          payoutAddress: tx.withdrawal,
          payoutCurrency: tx.coin_to.toUpperCase(),
          payoutAmount: parseFloat(tx.withdrawal_amount),
          timestamp,
          isoDate,
          usdValue: undefined,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
        if (isoDate > latestIsoDate) {
          latestIsoDate = isoDate
        }
        if (isoDate < oldestIsoDate) {
          oldestIsoDate = isoDate
        }
        if (isoDate < previousLatestIsoDate && !done) {
          datelog(`Godex done: date ${isoDate} < ${previousLatestIsoDate}`)
          done = true
        }
      }
      // datelog(`godex oldestIsoDate ${oldestIsoDate}`)

      offset += LIMIT
      // this is if the end of the database is reached
      if (txs.length < LIMIT) {
        done = true
      }
    }
  } catch (e) {
    datelog(e)
    throw e
  }
  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: ssFormatTxs
  }
  return out
}
export const godex: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryGodex,
  // results in a PluginResult
  pluginName: 'Godex',
  pluginId: 'godex'
}
