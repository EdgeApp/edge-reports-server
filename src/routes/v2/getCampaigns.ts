import { asMap, asObject, asString, asUnknown } from 'cleaners'
import Router from 'express-promise-router'
import fetch from 'node-fetch'

import { config } from '../../config'
import { reportsApps, reportsTransactions } from '../../indexApi'
import {
  aggregateCampaigns,
  asConversionFeed,
  CampaignReport,
  ConversionEvent,
  lookupOf,
  parseCampaignRange
} from '../../util/campaigns'
import {
  ConversionLookup,
  makeTxStore,
  ResolvedTx,
  resolveTxs
} from '../../util/resolveConversions'

const CACHE_TTL_MS = 1000 * 60 * 10
const CACHE_MAX_ENTRIES = 100

const asAppPartners = asObject({
  appId: asString,
  partnerIds: asMap(asUnknown)
})

const cache = new Map<string, { expires: number; report: CampaignReport }>()

async function fetchConversionEvents(
  url: string,
  masterKey: string,
  start: Date,
  end: Date
): Promise<ConversionEvent[]> {
  const query = new URLSearchParams({
    masterKey,
    startDate: start.toISOString(),
    endDate: end.toISOString()
  })
  const response = await fetch(`${url}/api/v1/conversions?${query.toString()}`)
  if (!response.ok) {
    throw new Error(`Conversion feed returned ${response.status}`)
  }
  const { events } = asConversionFeed(await response.json())
  const out: ConversionEvent[] = []
  for (const event of events) if (event != null) out.push(event)
  return out
}

/**
 * Settled partner USD sliced by the installer campaign and promotion each
 * conversion is credited to, joining the referral server's conversion events
 * to `reports_transactions` by the order id the app logged.
 */
export const getCampaignsRouter = Router()

getCampaignsRouter.get('/', async function(req, res) {
  const { apiKey, start, end } = req.query
  if (typeof apiKey !== 'string' || apiKey === '') {
    res.status(400).send(`Missing Request fields.`)
    return
  }

  // Same auth as /v2/config: the app doc keyed by apiKey.
  let app: ReturnType<typeof asAppPartners>
  try {
    app = asAppPartners(await reportsApps.get(apiKey))
  } catch {
    res.status(401).send(`Invalid API Key`)
    return
  }

  const { referralServer } = config
  if (referralServer == null) {
    res.status(503).send(`Campaign data is not configured`)
    return
  }
  // The feed holds no app id of its own; every event is the feed app's:
  if (app.appId !== referralServer.appId) {
    res.status(403).send(`Campaign data is not available for this app`)
    return
  }

  const range = parseCampaignRange(start, end)
  if ('error' in range) {
    res.status(400).send(range.error)
    return
  }

  const cacheKey = [
    apiKey,
    range.start.toISOString(),
    range.end.toISOString()
  ].join(' ')
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached != null && cached.expires > now) {
    res.json(cached.report)
    return
  }

  const events = await fetchConversionEvents(
    referralServer.url,
    referralServer.masterKey,
    range.start,
    range.end
  )
  // Events that logged no order id still count toward their provider's join
  // rate, as misses:
  const lookups = events.map(lookupOf)
  const joinable: Array<{ index: number; lookup: ConversionLookup }> = []
  lookups.forEach((lookup, index) => {
    if (lookup != null) joinable.push({ index, lookup })
  })
  const resolved = await resolveTxs(
    makeTxStore(reportsTransactions),
    app.appId,
    Object.keys(app.partnerIds),
    joinable.map(({ lookup }) => lookup)
  )
  const txs: Array<ResolvedTx | undefined> = events.map(() => undefined)
  joinable.forEach(({ index }, i) => {
    txs[index] = resolved[i]
  })
  const report = aggregateCampaigns(app.appId, events, txs)

  for (const [key, entry] of cache) {
    if (entry.expires <= now || cache.size >= CACHE_MAX_ENTRIES)
      cache.delete(key)
  }
  cache.set(cacheKey, { expires: now + CACHE_TTL_MS, report })
  res.json(report)
})
