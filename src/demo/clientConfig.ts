import { makeConfig } from 'cleaner-config'
import { asObject, asOptional, asString } from 'cleaners'

const asClientConfig = asObject({
  apiHost: asOptional(asString, 'http://localhost:8000')
})

export const clientConfig = makeConfig(asClientConfig, './clientConfig.json')
