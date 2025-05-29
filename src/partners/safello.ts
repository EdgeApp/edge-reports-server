import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asSafelloTx = asObject({
  completedDate: asString,
  id: asString,
  currency: asString,
  amount: asNumber,
  cryptoCurrency: asString
})

const asSafelloResult = asObject({ orders: asArray(asUnknown) })
const PER_REQUEST_LIMIT = 100
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

export async function querySafello(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []
  let latestTimestamp = 0
  if (typeof pluginParams.settings.lastCheckedTimestamp === 'number') {
    latestTimestamp = pluginParams.settings.lastCheckedTimestamp
  }

  if (typeof pluginParams.apiKeys.apiKey !== 'string') {
    return {
      settings: { lastCheckedTimestamp: latestTimestamp },
      transactions: []
    }
  }

  let done = false
  let offset = 0
  let newestTimestamp = latestTimestamp
  while (!done) {
    const url = `https://app.safello.com/v1/partner/get-orders?offset=${offset}`
    const headers = {
      'secret-key': pluginParams.apiKeys.apiKey
    }
    const result = await fetch(url, {
      method: 'GET',
      headers
    })
    const txs = asSafelloResult(await result.json())

    for (const rawTx of txs.orders) {
      const standardTx = processSafelloTx(rawTx)
      standardTxs.push(standardTx)
      const timestamp = standardTx.timestamp * 1000
      if (timestamp > newestTimestamp) {
        newestTimestamp = timestamp
      }
      if (latestTimestamp - QUERY_LOOKBACK > timestamp) {
        done = true
      }
    }

    offset += PER_REQUEST_LIMIT

    // reached end of database
    if (txs.orders.length < PER_REQUEST_LIMIT) {
      done = true
    }
  }

  const out: PluginResult = {
    settings: { lastCheckedTimestamp: newestTimestamp },
    transactions: standardTxs
  }
  return out
}

export const safello: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: querySafello,
  // results in a PluginResult
  pluginName: 'Safello',
  pluginId: 'safello'
}

export function processSafelloTx(rawTx: unknown): StandardTx {
  const tx = asSafelloTx(rawTx)
  const date = new Date(tx.completedDate)
  const timestamp = date.getTime()
  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,
    countryCode: 'SE',
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: tx.currency,
    depositAmount: tx.amount,
    direction: 'buy',
    exchangeType: 'fiat',
    paymentType: 'swish',
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency: tx.cryptoCurrency,
    payoutAmount: 0,
    timestamp: timestamp / 1000,
    isoDate: date.toISOString(),
    usdValue: -1,
    rawTx
  }
  return standardTx
}
