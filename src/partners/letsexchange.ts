import { asArray, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'
import ApiKeyScreen from "../demo/components/ApiKeyScreen";

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

const asLetsExchangeResult = asArray(asUnknown)

const LIMIT = 100
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

export async function queryLetsExchange(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  let page = 0
  let lastCheckedTimestamp = 0

  if (typeof pluginParams.settings.latestTimeStamp === 'number') {
    lastCheckedTimestamp =
      pluginParams.settings.latestTimeStamp - QUERY_LOOKBACK
  }
  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: { lastCheckedTimestamp: lastCheckedTimestamp },
      transactions: []
    }
  }

  let done = false
  let newestTimestamp = 0
  try {
    while (!done) {
      const url = `https://api.letsexchange.io/api/v1/affiliate/history/${apiKey}?limit=${LIMIT}&page=${page}&status=success&types=0`
      const headers = {}

      const result = await fetch(url, { method: 'GET', headers: headers })
      const resultJSON = await result.json()
      const txs = asLetsExchangeResult(resultJSON)

      for (const rawtx of txs) {
        const tx = asLetsExchangeTx(rawtx)
        const timestamp = parseInt(tx.created_at)
        const ssTx = {
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
          timestamp: timestamp,
          isoDate: new Date(timestamp * 1000).toISOString(),
          usdValue: undefined,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
        if (timestamp > newestTimestamp) {
          newestTimestamp = timestamp
        }
        if (lastCheckedTimestamp > timestamp) {
          done = true
        }
      }

      page++;
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
    settings: { latestTimeStamp: newestTimestamp },
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
