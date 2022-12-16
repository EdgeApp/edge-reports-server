import { thorchain as plugin } from '../partners/thorchain'
import { PluginParams } from '../types.js'

const pluginParams: PluginParams = {
  settings: {
    offset: 0
  },
  apiKeys: {
    thorchainAddress: ''
  }
}

async function main(): Promise<void> {
  const result = await plugin.queryFunc(pluginParams)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(e => console.log(e))
