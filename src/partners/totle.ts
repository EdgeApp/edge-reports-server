// import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

export async function queryTotle(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: {},
      transactions: []
    }
  }

  const { tokens } = await fetch('https://api.totle.com/tokens').then(res =>
    res.json()
  )

  const { contracts } = await fetch(
    'https://api.totle.com/contracts'
  ).then(res => res.json())
  const primaries = contracts.filter(({ type }) => type === 1)

  console.log(apiKey)
  console.log(tokens, primaries)

  const out: PluginResult = {
    settings: {},
    transactions: ssFormatTxs
  }
  return out
}

export const totle: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryTotle,
  // results in a PluginResult
  pluginName: 'Totle',
  pluginId: 'totle'
}
