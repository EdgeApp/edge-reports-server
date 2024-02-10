import { makeConfig } from 'cleaner-config'
import { asArray, asNumber, asObject, asOptional, asString } from 'cleaners'

export const asConfig = asObject({
  couchDbFullpath: asOptional(
    asString,
    'http://username:password@localhost:5984'
  ),
  httpPort: asOptional(asNumber, 8008),
  bog: asOptional(asObject({ apiKey: asString }), { apiKey: '' }),
  soloAppIds: asOptional(asArray(asString), null),
  soloPartnerIds: asOptional(asArray(asString), null),
  timeoutOverrideMins: asOptional(asNumber, 1200),
  cacheLookbackMonths: asOptional(asNumber, 24)
})

export const config = makeConfig(asConfig, 'config.json')
