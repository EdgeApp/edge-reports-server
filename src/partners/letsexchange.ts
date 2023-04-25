import { asArray, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

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

export async function queryLetsExchange(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey: string
  let page = 0
  let lookbackTimestamp = 0

  if (typeof pluginParams.settings.latestTimeStamp === 'number') {
    lookbackTimestamp = pluginParams.settings.latestTimeStamp - QUERY_LOOKBACK
  }
  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: { lookbackTimestamp },
      transactions: []
    }
  }

  let done = false
  let newestTimestamp = 0
  while (!done) {
    const url = `https://api.letsexchange.io/api/v1/affiliate/history/${apiKey}?limit=${LIMIT}&page=${page}&status=success&types=0`

    const result = await fetch(url, { method: 'GET' })
    if (result.ok === false) {
      const text = await result.text()
      datelog(text)
      throw new Error(text)
    }
    const resultJSON = await result.json()
    const { data: txs } = asLetsExchangeResult(resultJSON)

    for (const rawTx of txs) {
      const tx = asLetsExchangeTx(rawTx)
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
        rawTx
      }
      ssFormatTxs.push(ssTx)
      if (timestamp > newestTimestamp) {
        newestTimestamp = timestamp
      }
      if (lookbackTimestamp > timestamp) {
        done = true
      }
    }

    page++
    // this is if the end of the database is reached
    if (txs.length < LIMIT) {
      done = true
    }
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
