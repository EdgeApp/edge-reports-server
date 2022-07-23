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
  coin_from: asString,
  coin_to: asString,
  amount_from: asString,
  amount_to: asString,
  deposit_address: asString,
  destination_address: asString,
  input_hash: asEither(asString, asNull),
  created_at: asNumber
})

const asExolixResult = asObject({
  data: asArray(asUnknown)
})

const PAGE_LIMIT = 100
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
    const request = `https://exolix.com/api/history?page=${page}&per_page=${PAGE_LIMIT}`
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
      const { isoDate, timestamp } = smartIsoDateFromTimestamp(tx.created_at)
      if (tx.status === 'success') {
        const ssTx: StandardTx = {
          status: 'complete',
          orderId: tx.id,
          depositTxid: tx.input_hash ?? '',
          depositAddress: tx.deposit_address,
          depositCurrency: tx.coin_from,
          depositAmount: parseFloat(tx.amount_from),
          payoutTxid: undefined,
          payoutAddress: tx.destination_address,
          payoutCurrency: tx.coin_to,
          payoutAmount: parseFloat(tx.amount_to),
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
