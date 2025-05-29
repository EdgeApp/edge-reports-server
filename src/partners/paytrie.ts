import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asPaytrieTx = asObject({
  inputTXID: asString,
  inputAddress: asString,
  inputCurrency: asString,
  inputAmount: asNumber,
  outputAddress: asString,
  outputCurrency: asString,
  outputAmount: asNumber,
  timestamp: asString
})

const asPaytrieTxs = asArray(asUnknown)

export async function queryPaytrie(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []
  let startDate = '2020-01-01'
  const endDate = new Date().toISOString().slice(0, 10)
  let apiKey, secretToken
  if (typeof pluginParams.settings.lastCheckedDate === 'string') {
    startDate = pluginParams.settings.lastCheckedDate
  }

  if (
    typeof pluginParams.apiKeys.apiKey === 'string' &&
    typeof pluginParams.apiKeys.secretToken === 'string'
  ) {
    apiKey = pluginParams.apiKeys.apiKey
    secretToken = pluginParams.apiKeys.secretToken
  } else {
    return {
      settings: { lastCheckedDate: startDate },
      transactions: []
    }
  }

  const apiResponse = await fetch(
    `https://api1.paytrie.com/getEdgeTransactions?startDate=${startDate}&endDate=${endDate}`,
    {
      headers: {
        'x-api-key': apiKey,
        Authorization: `Bearer ${secretToken}`
      },
      method: 'post'
    }
  ).catch(err => {
    datelog(err)
    throw err
  })

  const orders = asPaytrieTxs(await apiResponse.json())

  for (const rawOrder of orders) {
    const standardTx = processPaytrieTx(rawOrder)
    standardTxs.push(standardTx)
  }

  const out: PluginResult = {
    settings: { lastCheckedDate: endDate },
    transactions: standardTxs
  }
  return out
}

export const paytrie: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryPaytrie,
  // results in a PluginResult
  pluginName: 'Paytrie',
  pluginId: 'paytrie'
}

export function processPaytrieTx(rawTx: unknown): StandardTx {
  const order = asPaytrieTx(rawTx)
  const standardTx: StandardTx = {
    status: 'complete',
    orderId: order.inputTXID,
    countryCode: null, // No records of paytrie in the DB to determine
    depositTxid: undefined,
    depositAddress: order.inputAddress,
    depositCurrency: order.inputCurrency,
    depositAmount: order.inputAmount,
    direction: null, // No records of paytrie in the DB to determine
    exchangeType: 'fiat', // IDK what paytrie is, but I assume it's a fiat exchange
    paymentType: null,
    payoutTxid: undefined,
    payoutAddress: order.outputAddress,
    payoutCurrency: order.outputCurrency,
    payoutAmount: order.outputAmount,
    timestamp: new Date(order.timestamp).getTime() / 1000,
    isoDate: order.timestamp,
    usdValue: -1,
    rawTx
  }
  return standardTx
}
