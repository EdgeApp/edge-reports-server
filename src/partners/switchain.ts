import { asArray, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asSwitchainTx = asObject({
  status: asString,
  appId: asString,
  createdAt: asString,
  pair: asString,
  depositTxId: asString,
  depositAddress: asString,
  amountFrom: asString,
  withdrawAddress: asString,
  rate: asString
})

const asSwitchainResult = asObject({
  orders: asArray(asUnknown)
})

const PAGE_LIMIT = 100
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 4 // 4 days ago

export async function querySwitchain(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  let latestTimestamp = 0
  if (typeof pluginParams.settings.latestTimestamp === 'number') {
    latestTimestamp = pluginParams.settings.latestTimestamp
  }

  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: { latestTimestamp: latestTimestamp },
      transactions: []
    }
  }

  let done = false
  let newestTimestamp = 0
  let page = 1
  while (!done) {
    let result
    try {
      const request = `https://api.switchain.com/rest/v1/ordersinfo?limit=${PAGE_LIMIT}&page=${page}`
      const options = {
        method: 'GET',
        headers: {
          authorization: `Bearer ${apiKey}`
        }
      }
      const response = await fetch(request, options)
      if (response.ok === true) {
        result = asSwitchainResult(await response.json())
      }
    } catch (e) {
      console.log(e)
      throw e
    }

    const txs = result.orders
    for (const rawtx of txs) {
      const tx = asSwitchainTx(rawtx)
      if (tx.status === 'confirmed' && tx.appId === apiKey) {
        const timestamp = new Date(tx.createdAt).getTime()
        const pair = tx.pair.split('-')
        const ssTx: StandardTx = {
          status: 'complete',
          inputTXID: tx.depositTxId,
          inputAddress: tx.depositAddress,
          inputCurrency: pair[0].toUpperCase(),
          inputAmount: parseFloat(tx.amountFrom),
          outputAddress: tx.withdrawAddress,
          outputCurrency: pair[1].toUpperCase(),
          outputAmount: parseFloat(tx.rate),
          timestamp: timestamp / 1000,
          isoDate: tx.createdAt,
          usdValue: null,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
        if (latestTimestamp - QUERY_LOOKBACK > timestamp) {
          done = true
        }
        if (timestamp > newestTimestamp) {
          newestTimestamp = timestamp
        }
      }
    }
    page++

    // reached end of database
    if (txs.length < PAGE_LIMIT) {
      done = true
    }
  }

  const out: PluginResult = {
    settings: { latestTimestamp: newestTimestamp },
    transactions: ssFormatTxs
  }
  return out
}

export const switchain: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: querySwitchain,
  // results in a PluginResult
  pluginName: 'Switchain',
  pluginId: 'switchain'
}
