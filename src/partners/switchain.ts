import { asArray, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asSwitchainTx = asObject({
  id: asString,
  status: asString,
  appId: asString,
  createdAt: asString,
  pair: asString,
  depositTxId: asString,
  depositAddress: asString,
  amountFrom: asString,
  withdrawTxId: asString,
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
      datelog(e)
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
          orderId: tx.id,
          depositTxid: tx.depositTxId,
          depositAddress: tx.depositAddress,
          depositCurrency: pair[0].toUpperCase(),
          depositAmount: parseFloat(tx.amountFrom),
          payoutTxid: tx.withdrawTxId,
          payoutAddress: tx.withdrawAddress,
          payoutCurrency: pair[1].toUpperCase(),
          payoutAmount: parseFloat(tx.rate),
          timestamp: timestamp / 1000,
          isoDate: tx.createdAt,
          usdValue: undefined,
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
