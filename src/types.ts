import {
  asArray,
  asMap,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
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

const asStatus = asValue(
  'complete',
  'processing',
  'pending',
  'expired',
  'blocked',
  'refunded',
  'other'
)
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
  status: asStatus,
  isoDate: asString,
  timestamp: asNumber,
  usdValue: asNumber,
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

export const asCurrencyCodeMappings = asMap(asString)
export const asDbCurrencyCodeMappings = asObject({
  mappings: asCurrencyCodeMappings
})

export const asStandardPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, '2018-01-01T00:00:00.000Z')
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString)
  })
})

const asPartnerInfo = asObject({
  apiKeys: asMap(asString)
})

export const asApp = asObject({
  _id: asString,
  _rev: asString,
  appId: asString,
  appName: asString,
  partnerIds: asMap(asPartnerInfo)
})

export const asApps = asArray(asApp)

export type CurrencyCodeMappings = ReturnType<typeof asCurrencyCodeMappings>
export type DbCurrencyCodeMappings = ReturnType<typeof asDbCurrencyCodeMappings>
export type DbTx = ReturnType<typeof asDbTx>
export type StandardTx = ReturnType<typeof asStandardTx>
export type PluginParams = ReturnType<typeof asPluginParams>
export type Status = ReturnType<typeof asStatus>
