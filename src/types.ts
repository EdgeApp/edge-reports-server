import {
  asArray,
  asBoolean,
  asDate,
  asEither,
  asMap,
  asMaybe,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUndefined,
  asUnknown,
  asValue
} from 'cleaners'

/** Earliest date that transactions may show in Edge */
export const EDGE_APP_START_DATE = '2018-01-01T00:00:00.000Z'

export const asPluginParams = asObject({
  settings: asMap((raw: any): any => raw),
  apiKeys: asMap((raw: any): any => raw)
})

/** Scoped logging interface passed to plugins */
export interface ScopedLog {
  (message: string, ...args: unknown[]): void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}
export interface PluginResult {
  // copy the type from standardtx from reports
  transactions: StandardTx[]
  settings: any
}

export interface PartnerPlugin {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: (param: PluginParams) => Promise<PluginResult>
  pluginName: string
  pluginId: string
}

const asStatus = asValue(
  'complete',
  'confirming',
  'withdrawing',
  'processing',
  'pending',
  'expired',
  'blocked',
  'refunded',
  'cancelled',
  'failed',
  'other'
)

const asSafeNumber = (raw: any): number => {
  if (isNaN(raw) || raw === null) {
    return 0
  }
  return asNumber(raw)
}

/** A null direction is for swap exchange types. */
const asDirection = asEither(asValue('buy', 'sell'), asNull)

/**
 * Related to FiatPaymentType in the GUI (src/plugins/gui/fiatPluginTypes.ts).
 * This is the source of truth for all available FiatPaymentType values, but the
 * GUI may have less values.
 */
const asFiatPaymentType = asValue(
  'ach',
  'applepay',
  'auspost',
  'astropay',
  'banktransfer',
  'bpay',
  'blueshyft',
  'cash',
  'colombiabank',
  'credit',
  'directtobank',
  'fasterpayments',
  'fpx',
  'giftcard',
  'giropay',
  'googlepay',
  'iach',
  'ideal',
  'interac',
  'iobank',
  'israelibank',
  'mexicobank',
  'mobikwik',
  'moonpay',
  'moonpaybalance',
  'neft',
  'neteller',
  'ozow',
  'payid',
  'paynow',
  'paypal',
  'pix',
  'poli',
  'pse',
  'revolut',
  'sepa',
  'skrill',
  'spei',
  'sofort',
  'swift',
  'swish',
  'turkishbank',
  'upi',
  'venmo',
  'wire',
  'yellowcard'
)
export type FiatPaymentType = ReturnType<typeof asFiatPaymentType>

/** The type of exchange that the partner is. A 'fiat' type means on/off ramp. */
const asExchangeType = asValue('fiat', 'swap')

export const asStandardTx = asObject({
  orderId: asString,
  countryCode: asEither(asString, asNull, asUndefined),
  depositTxid: asOptional(asString),
  depositAddress: asOptional(asString),
  depositCurrency: asString,
  depositChainPluginId: asOptional(asString),
  depositEvmChainId: asOptional(asNumber),
  depositTokenId: asOptional(asEither(asString, asNull)),
  depositAmount: asSafeNumber,
  direction: asOptional(asDirection),
  exchangeType: asOptional(asExchangeType),
  paymentType: asEither(asFiatPaymentType, asNull, asUndefined),
  payoutTxid: asOptional(asString),
  payoutAddress: asOptional(asString),
  payoutCurrency: asString,
  payoutChainPluginId: asOptional(asString),
  payoutEvmChainId: asOptional(asNumber),
  payoutTokenId: asOptional(asEither(asString, asNull)),
  payoutAmount: asSafeNumber,
  status: asStatus,
  isoDate: asString,
  timestamp: asNumber,
  usdValue: asNumber,
  /**
   * Edge's actual revenue on this order in USD, when the partner's API reports
   * it (e.g. Revolut's partner_fee, pre-converted to USD by Revolut). Stored at
   * ingest as a fact about the order, never recomputed. Absent when the partner
   * does not report one; the v2 dashboard then estimates revenue at read time
   * as usdValue * the app doc's per-partner revShareRate, so a corrected rate
   * fixes history immediately while reported figures stay immutable.
   */
  revenueUsd: asOptional(asNumber),
  /**
   * How revenueUsd was obtained. 'reported' is the only value written at
   * ingest; 'estimated' exists so read-time consumers can tag derived figures
   * without inventing a second vocabulary.
   */
  revenueSource: asOptional(asValue('reported', 'estimated')),
  rawTx: asUnknown
})

export const asDbTx = asObject({
  ...asStandardTx.shape,
  _id: asOptional(asString),
  _rev: asOptional(asString)
})

export const asProgressSettings = asObject({
  _id: asOptional(asString),
  _rev: asOptional(asString),
  progressCache: asMap((raw: any): any => raw)
})

export const asCurrencyCodeMappings = asMap(asString)
export const asDbCurrencyCodeMappings = asObject({
  mappings: asCurrencyCodeMappings
})

export const asStandardPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, EDGE_APP_START_DATE)
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString)
  })
})

const asPartnerInfo = asObject({
  pluginId: asOptional(asString),
  apiKeys: asMap(asString),
  /**
   * Revenue-share rate for this app-partner relationship (fraction of volume),
   * used by the v2 dashboard to estimate revenue when the partner's API does
   * not report actual fees. Lives here, beside the credentials that define the
   * relationship, because the rate is a property of the deal: per app AND per
   * partner. Never committed to source; this repo is public.
   */
  revShareRate: asOptional(asNumber)
})

export const asApp = asObject({
  _id: asString,
  _rev: asString,
  appId: asString,
  appName: asString,
  partnerIds: asMap(asPartnerInfo)
})

export const asApps = asArray(asApp)
const asCacheEntry = asObject({
  timestamp: asNumber,
  usdValue: asNumber,
  numTxs: asNumber,
  // Sum of reported revenueUsd across the bucket's txs. Optional: cache docs
  // written before this field existed lack it, and rebuilding fills it in.
  revenueUsd: asOptional(asNumber),
  currencyCodes: asObject(asNumber),
  currencyPairs: asObject(asNumber)
})

export const asCacheQuery = asObject({
  docs: asArray(asCacheEntry)
})

export const asBucket = asObject({
  start: asNumber,
  usdValue: asNumber,
  numTxs: asNumber,
  revenueUsd: asOptional(asNumber),
  isoDate: asString,
  currencyCodes: asObject(asNumber),
  currencyPairs: asObject(asNumber)
})

export const asAnalyticsResult = asObject({
  result: asObject({
    hour: asArray(asBucket),
    day: asArray(asBucket),
    month: asArray(asBucket),
    numAllTxs: asNumber
  }),
  app: asString,
  partnerId: asString,
  start: asNumber,
  end: asNumber
})

// v3/rates response cleaner (matches GUI's shape)
const asRatesV3CryptoAsset = asObject({
  pluginId: asString,
  tokenId: asOptional(asEither(asString, asNull))
})
const asRatesV3CryptoRate = asObject({
  isoDate: asOptional(asDate),
  asset: asRatesV3CryptoAsset,
  rate: asOptional(asNumber)
})
const asRatesV3FiatRate = asObject({
  isoDate: asOptional(asDate),
  fiatCode: asString,
  rate: asOptional(asNumber)
})
export const asRatesV3Params = asObject({
  targetFiat: asString,
  crypto: asArray(asRatesV3CryptoRate),
  fiat: asArray(asRatesV3FiatRate)
})

/**
 * Controls which plugins and app-partner combinations are disabled.
 * Set a key to `true` to disable that plugin or app-partner.
 * Example: `{ plugins: { moonpay: true }, appPartners: { "edge:moonpay": true } }`
 */
export const asDisablePartnerQuery = asMaybe(
  asObject({
    plugins: asObject(asBoolean),
    appPartners: asObject(asBoolean)
  }),
  { plugins: {}, appPartners: {} }
)

export type RatesV3Params = ReturnType<typeof asRatesV3Params>
export type DisablePartnerQuery = ReturnType<typeof asDisablePartnerQuery>
export type Bucket = ReturnType<typeof asBucket>
export type AnalyticsResult = ReturnType<typeof asAnalyticsResult>

export type CurrencyCodeMappings = ReturnType<typeof asCurrencyCodeMappings>
export type DbCurrencyCodeMappings = ReturnType<typeof asDbCurrencyCodeMappings>
// Same optional-key relaxation as StandardTx (asDbTx spreads its shape).
export type DbTx = Omit<
  ReturnType<typeof asDbTx>,
  'revenueUsd' | 'revenueSource'
> & {
  revenueUsd?: number
  revenueSource?: string
}
/**
 * `revenueUsd`/`revenueSource` are truly optional KEYS, not just
 * possibly-undefined values: only partners whose APIs report an actual fee set
 * them, and requiring every other plugin to spell out two explicit undefineds
 * would churn the whole partner directory for no information. The cleaner
 * still validates both fields when present.
 */
export type StandardTx = Omit<
  ReturnType<typeof asStandardTx>,
  'revenueUsd' | 'revenueSource'
> & {
  revenueUsd?: number
  // Widened to string at the type level because asObject's shape inference
  // widens asValue literals anyway; the cleaner still enforces
  // 'reported' | 'estimated' at runtime.
  revenueSource?: string
}
export type PluginParams = ReturnType<typeof asPluginParams> & {
  log: ScopedLog
}
export type Status = ReturnType<typeof asStatus>
