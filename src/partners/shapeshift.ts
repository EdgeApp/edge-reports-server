// import { asArray, asObject, asOptional, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

export async function queryShapeshift(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  const page = 0
  let token

  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    token = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: {},
      transactions: []
    }
  }

  const url = `https://shapeshift.io/client/transactions?limit=500&sort=DESC&page=${page}`
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  }

  const response = await fetch(url, options)
  const txs = await response.json()

  console.log(txs)
  console.log(ssFormatTxs)

  const out: PluginResult = {
    settings: {},
    transactions: []
  }
  return out
}

export const shapeshift: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryShapeshift,
  // results in a PluginResult
  pluginName: 'ShapeShift',
  pluginId: 'shapeshift'
}
