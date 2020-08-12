import {
  asMap,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'

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
  orderId: asString,
  depositTxid: asOptional(asString),
  depositAddress: asOptional(asString),
  depositCurrency: asString,
  depositAmount: asNumber,
  payoutTxid: asOptional(asString),
  payoutAddress: asOptional(asString),
  payoutCurrency: asString,
  payoutAmount: asNumber,
  status: asString,
  isoDate: asString,
  timestamp: asNumber,
  usdValue: asOptional(asNumber),
  rawTx: asUnknown
}
export const asDbTx = asObject({
  ...standardTxFields,
  _id: asOptional(asString),
  _rev: asOptional(asString)
})
export const asStandardTx = asObject(standardTxFields)

export const asProgressSettings = asObject({
  _id: asOptional(asString),
  _rev: asOptional(asString),
  progressCache: asMap((raw: any): any => raw)
})

export type DbTx = ReturnType<typeof asDbTx>
export type StandardTx = ReturnType<typeof asStandardTx>
export type PluginParams = ReturnType<typeof asPluginParams>
