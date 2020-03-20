import { asMap, asNumber, asObject, asOptional, asString } from 'cleaners'

export const asPluginParams = asObject({
  settings: asMap((raw: any): any => raw),
  apiKeys: asMap((raw: any): any => raw)
})
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
const standardTxFields = {
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
export const asDbTx = asObject({
  ...standardTxFields,
  usdValue: asOptional(asNumber),
  _id: asOptional(asString),
  _rev: asOptional(asString)
})
export const asStandardTx = asObject(standardTxFields)

export const asDbSettings = asObject({
  _id: asOptional(asString),
  _rev: asOptional(asString),
  settings: asMap((raw: any): any => raw)
})

export type DbTx = ReturnType<typeof asDbTx>
export type StandardTx = ReturnType<typeof asStandardTx>
export type PluginParams = ReturnType<typeof asPluginParams>
