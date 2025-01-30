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
import { datelog } from '../util'

const asLibertyxTx = asObject({
  all_transactions_usd_sum: asNumber,
  date_us_eastern: asString
})
const asPreLibertyxTx = asObject({
  all_transactions_usd_sum: asOptional(asNumber)
})

const asLibertyxResult = asObject({ stats: asArray(asUnknown) })

const INCOMPLETE_DAY_RANGE = 3

export async function queryLibertyx(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []
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

  for (const index in result.stats) {
    if (parseInt(index) < INCOMPLETE_DAY_RANGE) {
      continue
    }
    const rawTx = result.stats[index]
    const preTx = asPreLibertyxTx(rawTx)
    if (typeof preTx.all_transactions_usd_sum !== 'number') {
      continue
    }
    const standardTx = processLibertyxTx(rawTx)
    standardTxs.push(standardTx)
  }

  const out: PluginResult = {
    settings: {},
    transactions: standardTxs
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

export function processLibertyxTx(rawTx: unknown): StandardTx {
  const tx = asLibertyxTx(rawTx)
  const date = new Date(tx.date_us_eastern)
  const timestamp = date.getTime() / 1000
  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.date_us_eastern,
    countryCode: null,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: 'USD',
    depositAmount: tx.all_transactions_usd_sum,
    direction: 'buy',
    exchangeType: 'fiat',
    paymentType: null,
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency: 'BTC',
    payoutAmount: 0,
    timestamp: timestamp,
    isoDate: date.toISOString(),
    usdValue: tx.all_transactions_usd_sum,
    rawTx
  }
  return standardTx
}
