import { asArray, asNumber, asObject, asOptional, asString } from 'cleaners'

export interface PluginParams {
  settings: any
  apiKeys: any
}
export interface PluginResult {
  // copy the type from standardtx from reports
  transactions: StandardTx[]
  settings: any
}
export interface PartnerPlugin {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: (param: PluginParams) => Promise<PluginResult>
  pluginName: string
  pluginId: string
}

export const asStandardTx = asObject({
  inputTXID: asString,
  inputAddress: asOptional(asString),
  inputCurrency: asString,
  inputAmount: asNumber,
  outputAddress: asOptional(asString),
  outputCurrency: asString,
  status: asString,
  isoDate: asString,
  timestamp: asNumber,
  outputAmount: asNumber
}
})

export type StandardTx = ReturnType<typeof asStandardTx>
