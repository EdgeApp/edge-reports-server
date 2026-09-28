import { makeConfig } from 'cleaner-config'
import { asArray, asNumber, asObject, asOptional, asString } from 'cleaners'
import { asCouchCredentials } from 'edge-server-tools'

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
  /**
   * Conversion event feed for the v2 dashboard's campaign section. The feed
   * carries one app's events, so only that app's keys may read it.
   */
  referralServer: asOptional(
    asObject({ url: asString, masterKey: asString, appId: asString })
  ),
  couchUris: asOptional(asCouchCredentials, {
    wusa: 'http://username:password@localhost:5984'
  })
})

export const config = makeConfig(asConfig, 'config.json')
