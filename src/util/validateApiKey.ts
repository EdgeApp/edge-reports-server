import { asObject, asString } from 'cleaners'

import { reportsApps } from '../indexApi'

const asApiKeyDbResult = asObject({
  appId: asString
})

/**
 * Validates an API key and returns the corresponding appId.
 * Throws an error if the API key is not recognized.
 */
export async function validateApiKey(apiKey: string): Promise<string> {
  const dbResult = await reportsApps.get(apiKey)
  const { appId } = asApiKeyDbResult(dbResult)
  return appId
}
