import { asArray, asObject, asString, asUnknown } from 'cleaners'

import {
  asStandardPluginParams,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx
} from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp } from '../util'

const asLetsExchangeTx = asObject({
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

const asLetsExchangeResult = asObject({
  data: asArray(asUnknown)
})

const LIMIT = 100
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

type LetsExchangeTx = ReturnType<typeof asLetsExchangeTx>

export async function queryLetsExchange(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
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
  let oldestIsoDate = '999999999999999999999999999999999999'

  let page = 0
  let done = false
  try {
    while (!done) {
      const url = `https://api.letsexchange.io/api/v1/affiliate/history/${apiKey}?limit=${LIMIT}&page=${page}&status=success&types=0`

      const result = await retryFetch(url, { method: 'GET' })
      if (result.ok === false) {
        const text = await result.text()
        datelog(text)
        throw new Error(text)
      }
      const resultJSON = await result.json()
      const { data: txs } = asLetsExchangeResult(resultJSON)

      for (const rawTx of txs) {
        let tx: LetsExchangeTx
        try {
          tx = asLetsExchangeTx(rawTx)
        } catch (e) {
          datelog(e)
          throw e
        }
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
          rawTx
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
      // datelog(`letsexchange oldestIsoDate ${oldestIsoDate}`)

      page++
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
export const letsexchange: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryLetsExchange,
  // results in a PluginResult
  pluginName: 'LetsExchange',
  pluginId: 'letsexchange'
}
