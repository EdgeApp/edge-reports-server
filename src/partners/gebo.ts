import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'
import { queryDummy } from './dummy'

export async function queryGebo(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  await datelog('Running Gebo')
  return {
    settings: {},
    transactions: ssFormatTxs
  }
}

export const gebo: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryDummy,
  // results in a PluginResult
  pluginName: 'Gebo',
  pluginId: 'gebo'
}
