import './types.ts'

function queryFake (settings: PluginSettings): PluginResult {
  const fakeResult = {
    transactions: [{
      inputTXID: 'inputTXID',
      inputAddress: 'inputAddress',
      inputCurrency: 'inputCurrency',
      inputAmount: 'inputAmount',
      outputAddress: 'outputAddress',
      outputCurrency: 'outputCurrency',
      status: 'status',
      isoDate: 'isoDate',
      outputAmount: 'outputAmount'
  }],
    settings: {offset: 5}
  }
  return fakeResult
} 

export const fakePartnerPlugin: PartnerPlugin = {
  queryFunc: queryFake,
  pluginName: 'fakeName',
  pluginId: 'fakeId'
}
