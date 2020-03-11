interface PluginSettings {
  settings: any
}
interface PluginResult {
  //copy the type from standardtx from reports
  transactions: StandardTx[]
  settings: any
}
interface PartnerPlugin {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: (param: PluginSettings) => PluginResult
  pluginName: string
  pluginId: string
}

interface StandardTx {
    inputTXID: string
    inputAddress: string
    inputCurrency: string
    inputAmount: string
    outputAddress: string
    outputCurrency: string
    status: string
    isoDate: string
    outputAmount: string
}