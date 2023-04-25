import {
  asArray,
  asEither,
  asNull,
  asNumber,
  asObject,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { smartIsoDateFromTimestamp } from '../util'

const asExolixTx = asObject({
  id: asString,
  status: asString,
  coinFrom: asObject({
    coinCode: asString
  }),
  coinTo: asObject({
    coinCode: asString
  }),
  amount: asNumber,
  amountTo: asNumber,
  depositAddress: asString,
  withdrawalAddress: asString,
  hashIn: asObject({
    hash: asEither(asString, asNull)
  }),
  hashOut: asObject({
    hash: asEither(asString, asNull)
  }),
  createdAt: asString
})

const asExolixResult = asObject({
  data: asArray(asUnknown)
})

const PAGE_LIMIT = 100
const STATUS_SUCCESS = 'success'
const QUERY_LOOKBACK = 60 * 60 * 24 * 1 // 1 days

export async function queryExolix(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey: string
  let latestTimestamp = 0
  if (typeof pluginParams.settings.latestTimestamp === 'number') {
    latestTimestamp = pluginParams.settings.latestTimestamp
  }

  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: { latestTimestamp },
      transactions: []
    }
  }

  let done = false
  let newestTimestamp = 0
  let page = 1
  while (!done) {
    let result
    const request = `https://exolix.com/api/v2/transactions?page=${page}&size=${PAGE_LIMIT}&statuses=${STATUS_SUCCESS}`
    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${apiKey}`
      }
    }
    const response = await fetch(request, options)
    if (response.ok === true) {
      result = asExolixResult(await response.json())
    }

    const txs = result.data
    for (const rawTx of txs) {
      const tx = asExolixTx(rawTx)
      const dateInMillis = Date.parse(tx.createdAt)
      const { isoDate, timestamp } = smartIsoDateFromTimestamp(dateInMillis)
      const ssTx: StandardTx = {
        status: 'complete',
        orderId: tx.id,
        depositTxid: tx.hashIn?.hash ?? '',
        depositAddress: tx.depositAddress,
        depositCurrency: tx.coinFrom.coinCode,
        depositAmount: tx.amount,
        payoutTxid: tx.hashOut?.hash ?? '',
        payoutAddress: tx.withdrawalAddress,
        payoutCurrency: tx.coinTo.coinCode,
        payoutAmount: tx.amountTo,
        timestamp,
        isoDate,
        usdValue: undefined,
        rawTx
      }

      ssFormatTxs.push(ssTx)
      if (latestTimestamp - QUERY_LOOKBACK > timestamp) {
        done = true
      }
      if (timestamp > newestTimestamp) {
        newestTimestamp = timestamp
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

export const exolix: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryExolix,
  // results in a PluginResult
  pluginName: 'Exolix',
  pluginId: 'exolix'
}
