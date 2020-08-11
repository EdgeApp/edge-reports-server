import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asPaytrieTx = asObject({
  inputTXID: asString,
  inputAddress: asString,
  inputCurrency: asString,
  inputAmount: asNumber,
  outputAddress: asString,
  outputCurrency: asString,
  outputAmount: asNumber,
  timestamp: asNumber
})

export async function queryPaytrie(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let startDate = '2020-01-01'
  const endDate = new Date().toISOString().slice(0, 10)
  let apiKey, secretToken
  if (typeof pluginParams.settings.lastCheckedDate === 'string') {
    startDate = pluginParams.settings.lastCheckedDate
  }

  if (
    typeof pluginParams.apiKeys.apiKey !== 'string' &&
    typeof pluginParams.apiKeys.secretToken !== 'string'
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
  ).catch(err => console.error(err))

  const orders = await apiResponse.json()

  console.log(orders)

  for (const order of orders) {
    const date = new Date(order.timestamp)
    const timestamp = date.getTime() / 1000
    const ssTx: StandardTx = {
      status: 'complete',
      inputTXID: order.inputTXID,
      inputAddress: order.inputAddress,
      inputCurrency: order.inputCurrency,
      inputAmount: order.inputAmount,
      outputAddress: order.outputAddress,
      outputCurrency: order.outputCurrency,
      outputAmount: order.outputAmount.toString(),
      timestamp,
      isoDate: date.toISOString()
    }
    ssFormatTxs.push(ssTx)
  }

  const out: PluginResult = {
    settings: { lastCheckedDate: endDate },
    transactions: ssFormatTxs
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
