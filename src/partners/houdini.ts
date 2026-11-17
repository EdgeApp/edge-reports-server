import {
  asArray,
  asBoolean,
  asEither,
  asMaybe,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asTuple,
  asUnknown,
  asValue
} from 'cleaners'

import { config } from '../config'
import {
  EDGE_APP_START_DATE,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { describeRawTx, retryFetch, snooze } from '../util'
import { createTokenId, EdgeTokenId, tokenTypes } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

const asHoudiniPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, EDGE_APP_START_DATE)
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString),
    apiSecret: asOptional(asString)
  })
})

const asHoudiniToken = asObject({
  // Null for a chain's native coin
  address: asMaybe(asString),
  // Houdini chain short name, such as 'ethereum' or 'bsc'
  chain: asString,
  symbol: asString,
  mainnet: asMaybe(asBoolean),
  chainData: asMaybe(
    asObject({
      // EVM chain id, null on non-EVM chains
      chainId: asMaybe(asNumber)
    })
  )
})

// Houdini lists inToken and outToken as required, but its own sample order
// leaves them out, so they are read with asMaybe and the order falls back to
// inSymbol / outSymbol with no chain when they are missing.
const asHoudiniOrder = asObject({
  houdiniId: asString,
  status: asNumber,
  // ISO 8601
  created: asString,
  // Decimal amounts in the token's own units
  inAmount: asNumber,
  outAmount: asNumber,
  // Houdini's own ticker, chain-suffixed for tokens ('USDTTRON', 'USDCSOL').
  // The token's symbol is the plain one and is preferred.
  inSymbol: asString,
  outSymbol: asString,
  inAmountUsd: asMaybe(asNumber),
  inToken: asMaybe(asHoudiniToken),
  outToken: asMaybe(asHoudiniToken),
  receiverAddress: asMaybe(asString),
  // Whether the order took a private route. A plain request also takes one
  // when it is the best quote, so this is the route, not the user's choice.
  anonymous: asMaybe(asBoolean),
  // Omitted on multiswap orders whose per-order setup did not complete
  depositAddress: asMaybe(asString),
  // Empty until the deposit is seen
  inHash: asMaybe(asString),
  // The payout on a finished order, the refund on a refunded one
  transactionHash: asMaybe(asString)
})

const asHoudiniPage = asObject({
  orders: asArray(asUnknown),
  totalPages: asOptional(asEither(asNumber, asNull))
})

type HoudiniOrder = ReturnType<typeof asHoudiniOrder>
type HoudiniToken = ReturnType<typeof asHoudiniToken>

const asHoudiniMode = asValue(
  'swap',
  'swapSend',
  'stealthSwap',
  'stealthSwapSend',
  'stealthSend'
)

/**
 * The app flow that placed a Houdini order, as the app logs it on its swap
 * success event. Each mode reports as its own partner.
 */
export type HoudiniMode = ReturnType<typeof asHoudiniMode>

/** The app's swap success event for one order. */
export interface HoudiniModeEvent {
  /** Undefined when the app version predates the mode property */
  mode: HoudiniMode | undefined
  /** When PostHog received the event */
  receivedMs: number
}

/**
 * Reads the app's swap success events for the given Houdini orders, keyed by
 * lowercase order id, for events stamped between two times. Resolves
 * undefined when no event source is configured. Injectable so tests can
 * drive the join.
 */
export type FetchHoudiniModes = (
  fromMs: number,
  toMs: number,
  orderIds: string[]
) => Promise<Map<string, HoudiniModeEvent> | undefined>

/**
 * Fetches one page of orders created between two ISO dates and returns the
 * response body. Injectable so tests can drive the walk.
 */
export type FetchHoudiniPage = (
  apiKey: string,
  apiSecret: string,
  from: string,
  to: string,
  page: number
) => Promise<unknown>

interface PageResult {
  standardTxs: StandardTx[]
  skipped: number
}

interface EdgeAsset {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

const API_URL = 'https://api-partner.houdiniswap.com/v2/orders'
const MAX_RETRIES = 5
// The API rejects a larger page
const PAGE_SIZE = 100

// GET /orders only returns orders created in the last 48 hours; anything older
// drops out of the API entirely. Every run reads the whole window so status
// changes on recent orders are picked up, and progress must never fall further
// behind than this or the orders in between are lost.
const RETENTION_MS = 1000 * 60 * 60 * 48

// Hard ceiling on pages per run (20,000 orders), so a page count that never
// runs out cannot spin the worker or grow the batch without bound.
const MAX_PAGES = 200

// An order is filed under one mode partner, and a document lives in that
// partner's partition, so a mode must never change once an order is stored.
// Orders younger than this are left for a later run, and only an event
// PostHog received within this long of the order counts toward its mode.
export const HOUDINI_MODE_SETTLE_MS = 1000 * 60 * 60

// How long past the settle window an order waits before it is filed. An event
// stamped just inside the window may not be queryable yet, and Houdini's and
// PostHog's clocks need not agree, so the cut is not taken right at the edge.
export const HOUDINI_MODE_LAG_MS = 1000 * 60 * 15

/**
 * Whether an order is old enough to be filed under a mode for good. Younger
 * orders are left for a later run.
 */
export function isHoudiniModeSettled(
  createdMs: number,
  nowMs: number
): boolean {
  return createdMs <= nowMs - HOUDINI_MODE_SETTLE_MS - HOUDINI_MODE_LAG_MS
}

// The most rows one PostHog query returns
export const POSTHOG_MAX_ROWS = 50000

// Order ids asked about in one PostHog query. The result has at most one row
// per id, so it stays far below the row limit.
export const POSTHOG_ORDER_ID_BATCH = 500

// Anyone holding the app's public project key can write events, so an order
// id only goes into a query in this shape. Houdini ids are alphanumeric; an
// id that does not fit is not looked up and its order takes the fallback.
const SAFE_ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/

// While mode lookups fail, a held order is lost once it leaves the 48-hour
// window. This long before that, the hold is logged as an emergency.
export const HOUDINI_HOLD_ALARM_MS = 1000 * 60 * 60 * 6

const statusMap: { [status: number]: Status | undefined } = {
  [-2]: 'pending', // initializing
  [-1]: 'pending', // created
  0: 'pending', // waiting for the deposit
  1: 'confirming', // confirming the deposit
  2: 'processing', // exchanging
  3: 'processing', // anonymizing, private orders only
  4: 'complete',
  5: 'expired',
  6: 'failed',
  7: 'refunded',
  8: 'cancelled' // deleted
}

/**
 * Houdini chain short name -> Edge currency pluginId. Mirrors
 * src/mappings/houdini.ts in edge-exchange-plugins.
 */
const HOUDINI_CHAINS: Record<string, string> = {
  algorand: 'algorand',
  arbitrum: 'arbitrum',
  avalanche: 'avalanche',
  base: 'base',
  bitcoin: 'bitcoin',
  bitcoincash: 'bitcoincash',
  bsc: 'binancesmartchain',
  bsv: 'bitcoinsv',
  cardano: 'cardano',
  celo: 'celo',
  'cosmoshub-4': 'cosmoshub',
  dash: 'dash',
  doge: 'dogecoin',
  eCash: 'ecash',
  ethereum: 'ethereum',
  fantom: 'fantom',
  hedera: 'hedera',
  hyperevm: 'hyperevm',
  litecoin: 'litecoin',
  MON: 'monad',
  monero: 'monero',
  opbnb: 'opbnb',
  optimism: 'optimism',
  pivx: 'pivx',
  polkadot: 'polkadot',
  polygon: 'polygon',
  pulsechain: 'pulsechain',
  ripple: 'ripple',
  Robinhood: 'robinhood',
  rootstock: 'rsk',
  solana: 'solana',
  sonic: 'sonic',
  sui: 'sui',
  telos: 'telos',
  thorchain: 'thorchainrune',
  ton: 'ton',
  tron: 'tron',
  xlm: 'stellar',
  Zcash: 'zcash',
  'zksync-era': 'zksync'
}

/**
 * One read of the Houdini order feed and the app's swap events for it. The
 * five mode partners share one account, so they share one walk: see
 * `HoudiniWalkCache`.
 */
export interface HoudiniWalk {
  /** The fixed end of the window the walk read */
  nowMs: number
  /** Whether the window was read to its last page */
  complete: boolean
  /** Orders that could not be processed, each logged as it was skipped */
  skipped: number
  standardTxs: StandardTx[]
  /** Undefined when no event source is configured */
  events: Map<string, HoudiniModeEvent> | undefined
  /** Why the event lookup failed, when it did */
  eventsError: string | undefined
}

/**
 * Shares a walk between the partners that read one Houdini account. Without
 * it each mode partner would read the whole 48-hour feed and query PostHog on
 * every run, five times over the same data.
 */
export interface HoudiniWalkCache {
  get: (key: string, walk: () => Promise<HoudiniWalk>) => Promise<HoudiniWalk>
}

/**
 * Reuses a walk that is still in flight, or that finished less than
 * `maxAgeMs` ago, for the same key. A slow walk is never started twice, and
 * partners the query engine holds back until earlier ones finish still share
 * the walk those partners read.
 */
export function makeHoudiniWalkCache(maxAgeMs: number): HoudiniWalkCache {
  const entries = new Map<
    string,
    {
      promise: Promise<HoudiniWalk>
      /** Undefined while the walk is in flight */
      finishedMs: number | undefined
    }
  >()
  return {
    async get(key, walk) {
      const entry = entries.get(key)
      if (
        entry != null &&
        (entry.finishedMs == null || Date.now() - entry.finishedMs < maxAgeMs)
      ) {
        return await entry.promise
      }
      const promise = walk()
      const started = { promise, finishedMs: undefined as number | undefined }
      entries.set(key, started)
      promise.then(
        () => {
          started.finishedMs = Date.now()
        },
        () => {
          // A walk that throws is not worth sharing; the next caller retries
          if (entries.get(key) === started) entries.delete(key)
        }
      )
      return await promise
    }
  }
}

// The query engine runs at most three partners at once and pauses a minute
// (QUERY_FREQ_MS) after the slowest finishes before the next round. Keeping
// this under that pause means a walk finished this recently belongs to the
// current round, so the next round always reads fresh orders. A partner held
// longer than this behind other partners walks again, which costs a read but
// files nothing differently.
export const HOUDINI_WALK_SHARE_MS = 1000 * 30

const defaultWalkCache = makeHoudiniWalkCache(HOUDINI_WALK_SHARE_MS)

/**
 * Houdini orders cover every route Edge sends through it: standard swaps,
 * private (anonymous) swaps, private same-token sends to another address
 * (stealth send), DEX routes and multiswap batches. All of them come back from
 * the one orders endpoint. The mode partners share one read of that feed and
 * each keeps the orders placed in its own mode.
 *
 * Injected fetchers skip the shared cache unless a cache is passed too, so
 * tests never see each other's walks.
 */
export const queryHoudini = async (
  pluginParams: PluginParams,
  mode: HoudiniMode,
  fetchPage: FetchHoudiniPage = defaultFetchHoudiniPage,
  fetchModes: FetchHoudiniModes = defaultFetchHoudiniModes,
  walkCache: HoudiniWalkCache | undefined = fetchPage ===
    defaultFetchHoudiniPage && fetchModes === defaultFetchHoudiniModes
    ? defaultWalkCache
    : undefined
): Promise<PluginResult> => {
  const { log } = pluginParams
  const { settings, apiKeys } = asHoudiniPluginParams(pluginParams)
  const { apiKey, apiSecret } = apiKeys
  const { latestIsoDate } = settings

  // An empty string is what an unprovisioned partner entry looks like in Couch,
  // so treat it as unconfigured rather than calling the API with no credential.
  if (
    apiKey == null ||
    apiKey === '' ||
    apiSecret == null ||
    apiSecret === ''
  ) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const walk = async (): Promise<HoudiniWalk> =>
    await walkHoudini(pluginParams, apiKey, apiSecret, fetchPage, fetchModes)
  const { nowMs, complete, skipped, standardTxs, events, eventsError } =
    walkCache == null ? await walk() : await walkCache.get(apiKey, walk)

  const windowStart = nowMs - RETENTION_MS
  const from = new Date(windowStart).toISOString()
  const to = new Date(nowMs).toISOString()

  if (latestIsoDate === EDGE_APP_START_DATE) {
    log.warn(
      `Houdini: first run; orders created before ${from} are outside the API's 48-hour window and are not reported`
    )
  } else if (new Date(latestIsoDate).getTime() < windowStart) {
    log.error(
      `Houdini: last complete read was ${latestIsoDate}, older than the API's 48-hour window; orders created from then until ${from} are lost`
    )
  }

  if (!complete) {
    log.error(
      `Houdini: the order window was not read to the end; progress is held at ${latestIsoDate}`
    )
  }
  if (skipped > 0) {
    log.error(
      `Houdini: ${skipped} order(s) skipped as unprocessable this run; each is logged above and needs a fix before it leaves the 48-hour window`
    )
  }

  // A failed lookup would file send orders as plain ones, so nothing is
  // reported until it works. Every run rereads the 48-hour window, so a hold
  // loses nothing while it lasts less than that. Past it, the oldest held
  // orders leave the API for good, so the hold is called out well before.
  if (eventsError != null) {
    log.error(
      `Houdini: swap mode lookup failed; progress is held at ${latestIsoDate}: ${eventsError}`
    )
    const lostAtMs = getHeldOrderLossMs(standardTxs, nowMs)
    if (lostAtMs != null && lostAtMs - nowMs < HOUDINI_HOLD_ALARM_MS) {
      log.error(
        `Houdini: EMERGENCY: held orders start leaving the API's 48-hour window at ${new Date(
          lostAtMs
        ).toISOString()} and will never be reported; fix the PostHog lookup before then`
      )
    }
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const transactions: StandardTx[] = []
  for (const standardTx of standardTxs) {
    const createdMs = standardTx.timestamp * 1000
    // Too young to have a settled mode; a later run reads it again
    if (!isHoudiniModeSettled(createdMs, nowMs)) continue
    const { anonymous } = asHoudiniOrder(standardTx.rawTx)
    const event = events?.get(standardTx.orderId.toLowerCase())
    if (getHoudiniMode(anonymous, createdMs, event) === mode) {
      // A copy: the walk is shared between partners, and the query engine
      // lowercases the order id of each transaction it stores, in place.
      transactions.push({ ...standardTx })
    }
  }

  return {
    // Progress marks the end of the last fully read window, so the next run
    // can tell whether it fell behind the 48-hour retention.
    settings: { latestIsoDate: complete ? to : latestIsoDate },
    transactions
  }
}

/**
 * When the oldest settled order in a walk leaves the API's 48-hour window,
 * which is when a hold on it starts losing orders. Undefined with no settled
 * order to lose.
 */
export function getHeldOrderLossMs(
  standardTxs: StandardTx[],
  nowMs: number
): number | undefined {
  let oldestMs: number | undefined
  for (const { timestamp } of standardTxs) {
    const createdMs = timestamp * 1000
    if (!isHoudiniModeSettled(createdMs, nowMs)) continue
    if (oldestMs == null || createdMs < oldestMs) oldestMs = createdMs
  }
  return oldestMs == null ? undefined : oldestMs + RETENTION_MS
}

/**
 * Reads the whole 48-hour order window, newest first, and the app's swap
 * events for it. Problems with single orders are logged as they happen;
 * the rest is returned for each partner to report.
 */
async function walkHoudini(
  pluginParams: PluginParams,
  apiKey: string,
  apiSecret: string,
  fetchPage: FetchHoudiniPage,
  fetchModes: FetchHoudiniModes
): Promise<HoudiniWalk> {
  const { log } = pluginParams

  // Freeze the window for the whole walk. Orders are read newest first up to a
  // fixed end, so a new order cannot shift the pages, and orders leaving the
  // 48-hour window only drop off the last page.
  const nowMs = Date.now()
  const windowStart = nowMs - RETENTION_MS
  const from = new Date(windowStart).toISOString()
  const to = new Date(nowMs).toISOString()

  // Keyed by order id: an order can move between pages while the walk runs
  const standardTxs = new Map<string, StandardTx>()
  let skipped = 0
  let complete = false
  let retry = 0

  for (let page = 1; page <= MAX_PAGES; ) {
    let body: unknown
    try {
      body = await fetchPage(apiKey, apiSecret, from, to, page)
    } catch (e) {
      log.error(String(e))

      retry++
      if (retry > MAX_RETRIES) break
      log.warn(`Snoozing ${5 * retry}s`)
      await snooze(5000 * retry)
      continue
    }

    // A response of the wrong shape will not improve on a retry
    let result: ReturnType<typeof asHoudiniPage>
    try {
      result = asHoudiniPage(body)
    } catch (e) {
      log.error(`Houdini: unexpected response shape: ${String(e)}`)
      break
    }

    const pageResult = processHoudiniOrders(result.orders, pluginParams)
    for (const standardTx of pageResult.standardTxs) {
      standardTxs.set(standardTx.orderId, standardTx)
    }
    skipped += pageResult.skipped

    // Stop only when the page is short and totalPages agrees: a full page
    // always gets a next read, even if totalPages says it was the last one
    const lastPage =
      result.orders.length < PAGE_SIZE &&
      (result.totalPages == null || page >= result.totalPages)
    if (lastPage || result.orders.length === 0) {
      complete = true
      break
    }
    page++
    retry = 0
  }

  let events: Map<string, HoudiniModeEvent> | undefined
  let eventsError: string | undefined
  try {
    events = await fetchModes(windowStart - HOUDINI_MODE_SETTLE_MS, nowMs, [
      ...standardTxs.keys()
    ])
  } catch (e) {
    eventsError = String(e)
  }

  return {
    nowMs,
    complete,
    skipped,
    standardTxs: [...standardTxs.values()],
    events,
    eventsError
  }
}

/** The partner each mode's orders are filed under. */
export const HOUDINI_MODE_PARTNERS: Record<HoudiniMode, string> = {
  swap: 'houdini',
  swapSend: 'houdinisend',
  stealthSwap: 'houdinistealth',
  stealthSwapSend: 'houdinistealthswapsend',
  stealthSend: 'houdinistealthsend'
}

export const houdini: PartnerPlugin = {
  queryFunc: async pluginParams => await queryHoudini(pluginParams, 'swap'),
  pluginName: 'HoudiniSwap',
  pluginId: HOUDINI_MODE_PARTNERS.swap
}

export const houdinisend: PartnerPlugin = {
  queryFunc: async pluginParams => await queryHoudini(pluginParams, 'swapSend'),
  pluginName: 'HoudiniSwap (Swap & Send)',
  pluginId: HOUDINI_MODE_PARTNERS.swapSend
}

export const houdinistealth: PartnerPlugin = {
  queryFunc: async pluginParams =>
    await queryHoudini(pluginParams, 'stealthSwap'),
  pluginName: 'HoudiniSwap (Stealth Swap)',
  pluginId: HOUDINI_MODE_PARTNERS.stealthSwap
}

export const houdinistealthswapsend: PartnerPlugin = {
  queryFunc: async pluginParams =>
    await queryHoudini(pluginParams, 'stealthSwapSend'),
  pluginName: 'HoudiniSwap (Stealth Swap & Send)',
  pluginId: HOUDINI_MODE_PARTNERS.stealthSwapSend
}

/**
 * A Stealth send that pays out the asset it spends. The app names it apart
 * from Stealth Swap & Send, the same split its transaction list makes.
 */
export const houdinistealthsend: PartnerPlugin = {
  queryFunc: async pluginParams =>
    await queryHoudini(pluginParams, 'stealthSend'),
  pluginName: 'HoudiniSwap (Stealth Send)',
  pluginId: HOUDINI_MODE_PARTNERS.stealthSend
}

/**
 * The mode an order was placed in. The app's event names it when the event
 * arrived within the settle window. An order without one (an app version that
 * logs no mode, a lost event, or no event source) falls back to the route
 * Houdini reports and is counted as a swap from the Exchange scene.
 */
export function getHoudiniMode(
  anonymous: boolean | undefined,
  createdMs: number,
  event: HoudiniModeEvent | undefined
): HoudiniMode {
  if (
    event?.mode != null &&
    event.receivedMs <= createdMs + HOUDINI_MODE_SETTLE_MS
  ) {
    return event.mode
  }
  return anonymous === true ? 'stealthSwap' : 'swap'
}

/**
 * Process one page of Houdini orders, quarantining any order that cannot be
 * processed so it does not take the rest of the page down with it.
 */
export function processHoudiniOrders(
  rawTxs: unknown[],
  pluginParams: PluginParams
): PageResult {
  const { log } = pluginParams
  const standardTxs: StandardTx[] = []
  let skipped = 0
  for (const rawTx of rawTxs) {
    try {
      standardTxs.push(processHoudiniOrder(rawTx, pluginParams))
    } catch (e) {
      skipped++
      log.error(
        `Houdini: skipping unprocessable order, ingestion continues: ${String(
          e
        )}: ${describeRawTx(rawTx, ['houdiniId'])}`
      )
    }
  }
  return { standardTxs, skipped }
}

export function processHoudiniOrder(
  rawTx: unknown,
  pluginParams: PluginParams
): StandardTx {
  const order: HoudiniOrder = asHoudiniOrder(rawTx)

  const created = new Date(order.created)
  if (isNaN(created.getTime())) {
    throw new Error(`Bad created date ${order.created}`)
  }

  let status = statusMap[order.status]
  if (status == null) {
    pluginParams.log.warn(`Houdini: unknown status ${order.status}`)
    status = 'other'
  }

  const depositAsset = getEdgeAsset(order.inToken, pluginParams)
  const payoutAsset = getEdgeAsset(order.outToken, pluginParams)

  return {
    status,
    orderId: order.houdiniId,
    countryCode: null,

    depositTxid: emptyToUndefined(order.inHash),
    depositAddress: order.depositAddress,
    depositCurrency: (order.inToken?.symbol ?? order.inSymbol).toUpperCase(),
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: order.inAmount,

    direction: null,
    exchangeType: 'swap',
    paymentType: null,

    // On a refunded order transactionHash is the refund, not a payout
    payoutTxid:
      status === 'complete'
        ? emptyToUndefined(order.transactionHash)
        : undefined,
    payoutAddress: order.receiverAddress,
    payoutCurrency: (order.outToken?.symbol ?? order.outSymbol).toUpperCase(),
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: order.outAmount,

    timestamp: created.getTime() / 1000,
    isoDate: created.toISOString(),

    usdValue:
      order.inAmountUsd != null && order.inAmountUsd > 0
        ? order.inAmountUsd
        : -1,

    rawTx
  }
}

const defaultFetchHoudiniPage: FetchHoudiniPage = async (
  apiKey,
  apiSecret,
  from,
  to,
  page
) => {
  const params = new URLSearchParams({
    from,
    to,
    page: String(page),
    pageSize: String(PAGE_SIZE),
    sortBy: 'created',
    sortOrder: 'desc'
  })
  const response = await retryFetch(`${API_URL}?${params.toString()}`, {
    headers: { Authorization: `${apiKey}:${apiSecret}` }
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Houdini error ${response.status}: ${text}`)
  }
  return await response.json()
}

const asPosthogConfig = asObject({
  // Such as 'https://us.posthog.com'
  host: asString,
  projectId: asString,
  // A personal API key with query read access
  apiKey: asString
})

// Each row is an order id, the mode its first event logged (null before the
// app logged one), and when PostHog received that event.
const asPosthogModeRows = asObject({
  results: asArray(asTuple(asString, asMaybe(asString), asString)),
  // True when PostHog cut the result short
  hasMore: asMaybe(asBoolean)
})

/**
 * The HogQL queries that look up the given orders' swap events, one per batch
 * of ids. Only events for these orders can come back, so events written for
 * other ids, which anyone holding the app's project key can send, neither
 * fill the result nor count toward its row limit.
 */
export function makeHoudiniModeQueries(
  fromMs: number,
  toMs: number,
  orderIds: string[]
): string[] {
  const ids = [
    ...new Set(
      orderIds
        .filter(orderId => SAFE_ORDER_ID.test(orderId))
        .map(orderId => orderId.toLowerCase())
    )
  ]
  const fromSec = Math.floor(fromMs / 1000)
  const toSec = Math.ceil(toMs / 1000)
  const queries: string[] = []
  for (let i = 0; i < ids.length; i += POSTHOG_ORDER_ID_BATCH) {
    const list = ids
      .slice(i, i + POSTHOG_ORDER_ID_BATCH)
      .map(id => `'${id}'`)
      .join(', ')
    queries.push(`
    SELECT
      lower(properties.orderId),
      argMin(properties.swapMode, created_at),
      min(created_at)
    FROM events
    WHERE event = 'Exchange_Shift_Success'
      AND properties.swapProviderId = 'houdini'
      AND lower(properties.orderId) IN (${list})
      AND timestamp >= toDateTime(${fromSec})
      AND timestamp <= toDateTime(${toSec})
    GROUP BY lower(properties.orderId)
    LIMIT ${POSTHOG_MAX_ROWS}
  `)
  }
  return queries
}

/**
 * Reads only the order id and the mode from PostHog; nothing that names a
 * device, a user or a place leaves it.
 */
export const defaultFetchHoudiniModes: FetchHoudiniModes = async (
  fromMs,
  toMs,
  orderIds
) => {
  if (config.posthog == null) return undefined
  const { host, projectId, apiKey } = asPosthogConfig(config.posthog)

  const events = new Map<string, HoudiniModeEvent>()
  for (const query of makeHoudiniModeQueries(fromMs, toMs, orderIds)) {
    const response = await retryFetch(
      `${host.replace(/\/$/, '')}/api/projects/${projectId}/query/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query } })
      }
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`PostHog error ${response.status}: ${text}`)
    }
    // Batches hold distinct ids, so no order appears in two of them
    for (const [orderId, event] of parseHoudiniModeRows(
      await response.json()
    )) {
      events.set(orderId, event)
    }
  }
  return events
}

/**
 * Turns a PostHog query response into each order's swap success event. Throws
 * on any doubt, since a missing row would file its order under the wrong mode.
 */
export function parseHoudiniModeRows(
  body: unknown
): Map<string, HoudiniModeEvent> {
  const { results, hasMore } = asPosthogModeRows(body)
  // A full result may have cut rows off
  if (hasMore === true || results.length >= POSTHOG_MAX_ROWS) {
    throw new Error(`PostHog returned ${results.length} rows, the most it can`)
  }

  // Keyed by lowercase order id, the form the query engine stores, so a
  // lookup matches whatever case the order id is in by then:
  const events = new Map<string, HoudiniModeEvent>()
  for (const [orderId, mode, receivedAt] of results) {
    const receivedMs = Date.parse(receivedAt)
    if (isNaN(receivedMs)) {
      throw new Error(`Bad PostHog event time ${receivedAt}`)
    }
    const key = orderId.toLowerCase()
    const prior = events.get(key)
    if (prior == null || receivedMs < prior.receivedMs) {
      events.set(key, { mode: asMaybe(asHoudiniMode)(mode), receivedMs })
    }
  }
  return events
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value == null || value === '' ? undefined : value
}

/**
 * Resolves a Houdini token to Edge's chain plugin id and token id. A chain or
 * token Edge cannot name leaves the field undefined rather than dropping the
 * order, whose amounts and USD value are still good.
 */
function getEdgeAsset(
  token: HoudiniToken | undefined,
  pluginParams: PluginParams
): EdgeAsset {
  const { log } = pluginParams
  if (token == null) {
    return {
      chainPluginId: undefined,
      evmChainId: undefined,
      tokenId: undefined
    }
  }

  const chainPluginId = HOUDINI_CHAINS[token.chain]
  if (chainPluginId == null) {
    log.warn(`Houdini: unknown chain ${token.chain}`)
    return { chainPluginId, evmChainId: undefined, tokenId: undefined }
  }

  const tokenType = tokenTypes[chainPluginId]
  // The server's table is canonical; the order's chainId only fills a chain
  // the table lacks, such as monad
  const evmChainId =
    tokenType === 'evm'
      ? EVM_CHAIN_IDS[chainPluginId] ?? token.chainData?.chainId
      : undefined

  if (token.mainnet === true || token.address == null) {
    return { chainPluginId, evmChainId, tokenId: null }
  }
  // undefined, unlike null, means this server has no token id format for the chain
  if (tokenType === undefined) {
    return { chainPluginId, evmChainId, tokenId: undefined }
  }

  try {
    const tokenId = createTokenId(tokenType, token.symbol, token.address)
    return { chainPluginId, evmChainId, tokenId }
  } catch (e) {
    log.warn(
      `Houdini: no token id for ${token.symbol} on ${chainPluginId}: ${String(
        e
      )}`
    )
    return { chainPluginId, evmChainId, tokenId: undefined }
  }
}
