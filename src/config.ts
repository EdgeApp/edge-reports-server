import { makeConfig } from 'cleaner-config'
import { asArray, asNumber, asObject, asOptional, asString } from 'cleaners'

export const asConfig = asObject({
  couchDbFullpath: asOptional(
    asString,
    'http://username:password@localhost:5984'
  ),
  clickhouseConnection: asOptional(
    asObject({
      url: asString,
      password: asString
    }),
    {
      url: 'http://localhost:8123',
      password: ''
    }
  ),
  clickhouseIndexVersion: asOptional(asNumber, 1),
  httpPort: asOptional(asNumber, 8008),
  bog: asOptional(asObject({ apiKey: asString }), { apiKey: '' }),

  /** Only run specific appIds (e.g. edge, coinhub, etc) */
  soloAppIds: asOptional(asArray(asString), null),
  /** Only run specific partnerIds (e.g. moonpay, paybis, etc) */
  soloPartnerIds: asOptional(asArray(asString), null),

  timeoutOverrideMins: asOptional(asNumber, 1200),
  cacheLookbackMonths: asOptional(asNumber, 24)
})

export const config = makeConfig(asConfig, 'config.json')
