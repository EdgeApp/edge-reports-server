import { makeConfig } from 'cleaner-config'
import { asArray, asNumber, asObject, asOptional, asString } from 'cleaners'
import { asCouchCredentials } from 'edge-server-tools'

import { asHealthCheckConfig } from './healthCheck/healthCheckTypes'

export const asConfig = asObject({
  couchDbFullpath: asOptional(
    asString,
    'http://username:password@localhost:5984'
  ),
  httpPort: asOptional(asNumber, 8008),
  bog: asOptional(asObject({ apiKey: asString }), { apiKey: '' }),

  /** Only run specific appIds (e.g. edge, coinhub, etc) */
  soloAppIds: asOptional(asArray(asString), null),
  /** Only run specific partnerIds (e.g. moonpay, paybis, etc) */
  soloPartnerIds: asOptional(asArray(asString), null),

  timeoutOverrideMins: asOptional(asNumber, 1200),
  cacheLookbackMonths: asOptional(asNumber, 24),
  couchMainCluster: asOptional(asString, 'wusa'),
  couchUris: asOptional(asCouchCredentials, {
    wusa: 'http://username:password@localhost:5984'
  }),

  /** Thresholds and output settings for the daily health check */
  healthCheck: asOptional(asHealthCheckConfig, () => asHealthCheckConfig({}))
})

export const config = makeConfig(asConfig, 'config.json')
