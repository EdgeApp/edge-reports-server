import {
  asArray,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asLibertyxTx = asObject({
  all_transactions_usd_sum: asOptional(asNumber),
  date_us_eastern: asString
})

const asLibertyxResult = asObject({ stats: asArray(asUnknown) })

export async function queryLibertyx(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  let result
  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    try {
      apiKey = pluginParams.apiKeys.apiKey
      const request = `https://libertyx.com/airbitz/stats`
      const response = await fetch(request, {
        headers: {
          Authorization: `${apiKey}`
        },
        method: 'POST'
      })
      result = asLibertyxResult(await response.json())
    } catch (e) {
      console.log(e)
      throw e
    }
  } else {
    return {
      settings: {},
      transactions: []
    }
  }

  for (const rawtx of result.stats) {
    const tx = asLibertyxTx(rawtx)
    if (typeof tx.all_transactions_usd_sum !== 'number') {
      continue
    }
    const date = new Date(tx.date_us_eastern)
    const timestamp = date.getTime() / 1000
    const ssTx = {
      status: 'complete',
      inputTXID: tx.date_us_eastern,
      inputAddress: '',
      inputCurrency: 'USD',
      inputAmount: tx.all_transactions_usd_sum,
      outputAddress: '',
      outputCurrency: 'USD',
      outputAmount: tx.all_transactions_usd_sum,
      timestamp: timestamp,
      isoDate: tx.date_us_eastern,
      usdValue: null
    }
    ssFormatTxs.push(ssTx)
  }

  const out: PluginResult = {
    settings: {},
    transactions: ssFormatTxs
  }
  return out
}

export const libertyx: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryLibertyx,
  // results in a PluginResult
  pluginName: 'Libertyx',
  pluginId: 'libertyx'
}
