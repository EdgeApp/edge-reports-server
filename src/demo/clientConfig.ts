import { asObject, asOptional, asString } from 'cleaners'

export const asClientConfig = asObject({
  apiHost: asOptional(asString, 'http://localhost:8008')
})
