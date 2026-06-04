import { PluginParams } from '../types'
import { createScopedLog } from '../util'

async function main(): Promise<void> {
  const partnerId = process.argv[2]
  if (partnerId == null) {
    console.log(
      'Usage: node -r sucrase/register src/bin/testpartner.ts <partnerId>'
    )
    process.exit(1)
  }

  const pluginParams: PluginParams = {
    settings: {},
    apiKeys: {},
    log: createScopedLog('edge', partnerId)
  }

  // Dynamically import the partner plugin
  const pluginModule = await import(`../partners/${partnerId}`)
  const plugin = pluginModule[partnerId]
  if (plugin?.queryFunc == null) {
    throw new Error(`Plugin ${partnerId} does not have a queryFunc`)
  }

  const result = await plugin.queryFunc(pluginParams)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(e => console.log(e))
