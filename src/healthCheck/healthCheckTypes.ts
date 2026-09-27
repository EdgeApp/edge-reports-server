import {
  asArray,
  asEither,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue
} from 'cleaners'

import { asDisablePartnerQuery } from '../types'

/** Per-partner or per-chain overrides of the default alert thresholds */
const asHealthThresholdOverrides = asObject({
  volumeFraction: asOptional(asNumber),
  minBaselineOrders: asOptional(asNumber),
  errorCycles: asOptional(asNumber),
  missingMinExpectedOrders: asOptional(asNumber)
})

export const asHealthCheckConfig = asObject({
  /** Volume alert fires when observed volume is below this fraction of baseline */
  volumeFraction: asOptional(asNumber, 0.25),
  /** Volume and chain alerts need at least this many expected baseline orders */
  minBaselineOrders: asOptional(asNumber, 10),
  /** Query error alert fires after this many consecutive failed cycles */
  errorCycles: asOptional(asNumber, 3),
  /**
   * Missing provider alert needs at least this many expected baseline orders.
   * The default of 0 fires on any nonzero baseline; raise it to quiet
   * providers that average under one order per window.
   */
  missingMinExpectedOrders: asOptional(asNumber, 0),
  /** Length of the trailing baseline period, in weeks */
  baselineWeeks: asOptional(asNumber, 8),
  /** Number of per-cycle statuses the query engine keeps per partner */
  statusHistoryLength: asOptional(asNumber, 20),
  /** Number of per-cycle statuses shown per partner in the summary */
  statusCyclesShown: asOptional(asNumber, 5),
  summaryPath: asOptional(asString, 'healthCheckSummary.txt'),
  jevUrl: asOptional(asString, 'https://api.typesafe.ai/v1/systemone'),
  jevModel: asOptional(asString, 'jev-latest'),
  jevTimeoutMs: asOptional(asNumber, 30000),
  /** Threshold overrides keyed by `${appId}_${partnerId}` or partnerId */
  partners: asOptional(asObject(asHealthThresholdOverrides), () => ({})),
  /** Threshold overrides keyed by chain pluginId */
  chains: asOptional(asObject(asHealthThresholdOverrides), () => ({}))
})

/** Outcome of one query engine cycle for one app partner */
export const asStatusResult = asValue('success', 'error', 'noPlugin')

export const asStatusCycle = asObject({
  isoDate: asString,
  result: asStatusResult,
  status: asString
})

/** reports_status document, keyed by `${appId}_${partnerId}` */
export const asStatusDoc = asObject({
  _id: asString,
  _rev: asOptional(asString),
  cycles: asArray(asStatusCycle)
})

/** The transaction fields the health check reads */
export const asHealthTx = asObject({
  isoDate: asString,
  status: asString,
  usdValue: asNumber,
  depositChainPluginId: asOptional(asString),
  payoutChainPluginId: asOptional(asString)
})

/** An app with its partner list, without API keys */
export const asHealthApp = asObject({
  appId: asString,
  partnerIds: asObject(asObject({ pluginId: asOptional(asString) }))
})

/**
 * Everything the health check reads from CouchDB. The dry-run mode reads
 * this shape from a JSON file instead of the database.
 */
export const asHealthDump = asObject({
  nowIsoDate: asString,
  apps: asArray(asHealthApp),
  disablePartnerQuery: asDisablePartnerQuery,
  soloAppIds: asOptional(asEither(asArray(asString), asNull), null),
  soloPartnerIds: asOptional(asEither(asArray(asString), asNull), null),
  /** Transactions keyed by `${appId}_${partnerId}` */
  transactions: asObject(asArray(asHealthTx)),
  /** Per-cycle status history keyed by `${appId}_${partnerId}` */
  statusHistory: asObject(asArray(asStatusCycle))
})

export type HealthCheckConfig = ReturnType<typeof asHealthCheckConfig>
export type HealthThresholdOverrides = ReturnType<
  typeof asHealthThresholdOverrides
>
export type StatusResult = ReturnType<typeof asStatusResult>
export type StatusCycle = ReturnType<typeof asStatusCycle>
export type StatusDoc = ReturnType<typeof asStatusDoc>
export type HealthTx = ReturnType<typeof asHealthTx>
export type HealthApp = ReturnType<typeof asHealthApp>
export type HealthDump = ReturnType<typeof asHealthDump>

export interface HealthThresholds {
  volumeFraction: number
  minBaselineOrders: number
  errorCycles: number
  missingMinExpectedOrders: number
}
