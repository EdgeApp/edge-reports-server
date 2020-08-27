import {
  asArray,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'
import { datelog } from '../queryEngine'

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
      datelog(e)
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
      orderId: tx.date_us_eastern,
      depositTxid: undefined,
      depositAddress: undefined,
      depositCurrency: 'USD',
      depositAmount: tx.all_transactions_usd_sum,
      payoutTxid: undefined,
      payoutAddress: undefined,
      payoutCurrency: 'BTC',
      payoutAmount: 0,
      timestamp: timestamp,
      isoDate: date.toISOString(),
      usdValue: tx.all_transactions_usd_sum,
      rawTx: rawtx
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
