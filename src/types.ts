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

export interface StandardTx {
  inputTXID: string
  inputAddress?: string
  inputCurrency: string
  inputAmount: string
  outputAddress?: string
  outputCurrency: string
  status: string
  isoDate: string
  timestamp: number
  outputAmount: string
}
