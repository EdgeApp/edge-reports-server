import { asArray, asMaybe, asObject, asString } from 'cleaners'

import { ConversionLookup, ResolvedTx } from './resolveConversions'

const DAY_MS = 1000 * 60 * 60 * 24

/** The longest range one campaigns request may read. */
export const MAX_CAMPAIGN_RANGE_DAYS = 400

/** Installer label for a conversion no referral led to. */
export const ORGANIC = 'organic'

/** Promotion label for a conversion made without an active promotion. */
export const NO_PROMO = 'none'

const asOptionalString = asMaybe(asString)

/**
 * One conversion event from the referral server's feed. Tolerant: the feed
 * holds everything any app version ever logged, so every field but the event
 * name and date degrades to undefined rather than dropping the event.
 */
export const asConversionEvent = asObject({
  event: asString,
  date: asString,
  orderId: asOptionalString,
  pluginId: asOptionalString,
  fiatProviderId: asOptionalString,
  swapProviderId: asOptionalString,
  installerId: asOptionalString,
  aid: asOptionalString,
  refAccountInstallerId: asOptionalString,
  refDeviceInstallerId: asOptionalString,
  promoIds: asMaybe(asArray(asString))
})

export const asConversionFeed = asObject({
  events: asArray(asMaybe(asConversionEvent))
})

export type ConversionEvent = ReturnType<typeof asConversionEvent>

/** Settled USD for one day, reports partner, installer and promotion. */
export interface CampaignRow {
  date: string
  pluginId: string
  installer: string
  promo: string
  usdValue: number
  count: number
}

/** How many logged conversions per app provider id joined a partner order. */
export interface CampaignJoinStat {
  pluginId: string
  events: number
  matched: number
  settled: number
}

export interface CampaignReport {
  rows: CampaignRow[]
  joins: CampaignJoinStat[]
}

type CampaignRange = { start: Date; end: Date } | { error: string }

/**
 * Validates the `start` / `end` query parameters. Both are required, so a
 * forgotten parameter can never turn into an all-time feed read.
 */
export function parseCampaignRange(
  start: unknown,
  end: unknown
): CampaignRange {
  if (typeof start !== 'string' || typeof end !== 'string') {
    return { error: 'Please provide a start and end' }
  }
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (isNaN(startDate.valueOf()) || isNaN(endDate.valueOf())) {
    return { error: 'Invalid start or end' }
  }
  if (endDate.valueOf() <= startDate.valueOf()) {
    return { error: 'end must be after start' }
  }
  if (
    endDate.valueOf() - startDate.valueOf() >
    MAX_CAMPAIGN_RANGE_DAYS * DAY_MS
  ) {
    return { error: `The range may not exceed ${MAX_CAMPAIGN_RANGE_DAYS} days` }
  }
  return { start: startDate, end: endDate }
}

const nonEmpty = (value: string | undefined): string | undefined =>
  value === '' ? undefined : value

/**
 * The provider the app logged the conversion under. Ramp and swap events
 * name it in their own field; `pluginId` covers events that predate those.
 */
export function providerIdOf(event: ConversionEvent): string | undefined {
  return (
    nonEmpty(event.swapProviderId) ??
    nonEmpty(event.fiatProviderId) ??
    nonEmpty(event.pluginId)
  )
}

/**
 * The installer campaign a conversion is credited to: the referral the account
 * was created under, else the one the device was installed under.
 */
export function installerOf(event: ConversionEvent): string {
  return (
    nonEmpty(event.refAccountInstallerId) ??
    nonEmpty(event.refDeviceInstallerId) ??
    nonEmpty(event.installerId) ??
    nonEmpty(event.aid) ??
    ORGANIC
  )
}

export function promoOf(event: ConversionEvent): string {
  return nonEmpty(event.promoIds?.[0]) ?? NO_PROMO
}

/** The partner transaction lookup for an event, if it logged enough to join. */
export function lookupOf(event: ConversionEvent): ConversionLookup | undefined {
  const pluginId = providerIdOf(event)
  const orderId = nonEmpty(event.orderId)
  if (pluginId == null || orderId == null) return
  return { pluginId, orderId }
}

/**
 * Sums settled partner USD by day, partner, installer and promotion. `txs`
 * holds the resolved partner transaction for each event, in order. An order
 * logged twice counts once, under its first event.
 */
export function aggregateCampaigns(
  appId: string,
  events: ConversionEvent[],
  txs: Array<ResolvedTx | undefined>
): CampaignReport {
  const rows = new Map<string, CampaignRow>()
  const joins = new Map<string, CampaignJoinStat>()
  const seen = new Set<string>()

  events.forEach((event, index) => {
    const providerId = providerIdOf(event)
    if (providerId == null) return
    const join = joins.get(providerId) ?? {
      pluginId: providerId,
      events: 0,
      matched: 0,
      settled: 0
    }
    joins.set(providerId, join)
    join.events++

    const tx = txs[index]
    if (tx == null) return
    const { key: docId, doc } = tx
    join.matched++
    if (doc.status !== 'complete' || doc.usdValue < 0) return
    join.settled++
    if (seen.has(docId)) return
    seen.add(docId)

    // The partition names the reports partner, which may differ from the
    // provider id the app logged (`banxa3` for `banxa`):
    const partition = docId.slice(0, docId.indexOf(':'))
    const pluginId = partition.slice(appId.length + 1)
    const date = doc.isoDate.slice(0, 10)
    const installer = installerOf(event)
    const promo = promoOf(event)
    const rowKey = [date, pluginId, installer, promo].join('\n')
    const row = rows.get(rowKey) ?? {
      date,
      pluginId,
      installer,
      promo,
      usdValue: 0,
      count: 0
    }
    rows.set(rowKey, row)
    row.usdValue += doc.usdValue
    row.count++
  })

  return {
    rows: [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)),
    joins: [...joins.values()].sort((a, b) => b.events - a.events)
  }
}
