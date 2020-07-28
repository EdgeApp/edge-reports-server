import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const PER_REQUEST_LIMIT = 100

export async function querySafello(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let headers
  const latestTimestamp = Date.now() - 1000 * 60 * 60 * 24 * 5

  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    headers = {
      'secret-key': pluginParams.apiKeys.apiKey
    }
  } else {
    return {
      settings: {},
      transactions: []
    }
  }

  let done = false
  let offset = 0
  const newestTimestamp = 0
  while (!done) {
    const url = `https://app.safello.com/v1/partner/get-orders?offset=${offset}`
    const result = await fetch(url, {
      method: 'GET',
      headers
    })
    const txs = await result.json()

    for (const tx of txs) {
      const date = new Date(tx.completedDate)
      const ssTx = {
        status: 'complete',
        inputTXID: tx.id,
        inputAddress: '',
        inputCurrency: tx.currency,
        inputAmount: tx.amount,
        outputAddress: '',
        outputCurrency: tx.cryptoCurrency,
        outputAmount: 0,
        timestamp: date.getTime() / 1000,
        isoDate: date.toISOString()
      }
      ssFormatTxs.push(ssTx)
    }

    offset += PER_REQUEST_LIMIT
    if (offset === 500) {
      done = true
    }
  }

  const out: PluginResult = {
    settings: {},
    transactions: ssFormatTxs
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
