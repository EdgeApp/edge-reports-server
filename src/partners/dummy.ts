import { PluginParams, PluginResult } from '../types'

export async function queryDummy(
  pluginParams: PluginParams
): Promise<PluginResult> {
  return {
    settings: { lastTimestamp: 0 },
    transactions: []
  }
}
