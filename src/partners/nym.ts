import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import {
  describeRawTx,
  retryFetch,
  safeParseFloat,
  smartIsoDateFromTimestamp,
  snooze
} from '../util'
import {
  ChainNameToPluginIdMapping,
  createTokenId,
  EdgeTokenId,
  tokenTypes
} from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS, REVERSE_EVM_CHAIN_IDS } from '../util/chainIds'

// Reports API `sourceNetwork` / `destinationNetwork` -> Edge currency pluginId.
// Quote-side `chainNetwork` uses `nyx` for native NYM; the reports endpoint
// sends `NYM`. Both map to Edge pluginId `nym` (see edge-exchange-plugins
// src/mappings/nym.ts). `BTC` is the ticker used as a network name on reports.
export const NYM_NETWORK_TO_PLUGIN_ID: ChainNameToPluginIdMapping = {
  bitcoin: 'bitcoin',
  btc: 'bitcoin',
  ethereum: 'ethereum',
  nym: 'nym',
  nyx: 'nym'
}

// NYM ("nymswap") reporting plugin.
//
// Confirmed against NYM's live "Edge Partner" API (OpenAPI at
// https://nym-swap-api.nymtech.cc/api/docs/) and a live query under the GUI's
// swap key. The reporting endpoint is
//   GET /api/partner/v1/reports/transactions
// authenticated with the same `x-api-key` header the swap plugin uses
// (edge-exchange-plugins src/swap/central/nym.ts). Query params are `startDate`
// /`endDate` (ISO date-time), `limit` (<= 500), and an opaque `cursor`; the
// response is
//   { transactions: EdgeTransactionRecord[], nextCursor: string | null }
// paged by following `nextCursor` until it is null.
//
// Amounts arrive as native-unit strings (e.g. ETH in wei). StandardTx wants
// major units, so each is divided by 10^decimals using NYM's own
// GET /api/partner/v1/currencies list, keyed by currency code + tokenId.
//
// The report timestamp is keyed off `createdDate`, not `completedDate`. A live
// check across every genuinely-settled swap under the GUI key (status
// `completed` with BOTH a payin and a payout txid) found `completedDate` null on
// all 7 of them; the only `completed` order that carried a `completedDate` was
// an anomalous NYM->NYM order with no payin txid. So `completedDate` is not a
// reliable settlement-time source even for real swaps, and `createdDate` (always
// present) is used uniformly.
const NYM_API_BASE = 'https://nym-swap-api.nymtech.cc'
const REPORTS_PATH = '/api/partner/v1/reports/transactions'
const CURRENCIES_PATH = '/api/partner/v1/currencies'

// Re-query a 5-day window behind the saved progress so in-flight orders that
// settle after the previous run are re-seen (mirrors sibling swap partners).
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const PAGE_LIMIT = 500 // API max
const MAX_RETRIES = 5

// Hard ceiling on pages per run. Every loop below already terminates on the
// partner's own signal, but that makes termination the partner's decision: a
// stuck cursor or a page that never shortens would spin the worker and grow the
// in-memory batch without bound. Hitting the cap ends the run WITHOUT advancing
// progress, so the unread remainder is simply re-queried next cycle, exactly
// like the retry-exhaustion path.
const MAX_PAGES = 200

// Fallback native-unit decimals for NYM's current asset set, used only when the
// live /currencies fetch fails. The live list overlays this at runtime, so a
// newly listed asset is picked up automatically. Key: `CODE|tokenIdLower`.
const DEFAULT_DECIMALS: { [key: string]: number } = {
  'BTC|': 8,
  'ETH|': 18,
  'NYM|': 6,
  'USDT|0xdac17f958d2ee523a2206206994597c13d831ec7': 6,
  'USDC|0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,
  'NYM|0x525a8f6f3ba4752868cde25164382bfbae3990e1': 6
}

interface DecimalsMap {
  [key: string]: number
}

const decimalsKey = (
  currencyCode: string,
  tokenId: string | undefined
): string => `${currencyCode.toUpperCase()}|${(tokenId ?? '').toLowerCase()}`

export const asNymPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, '1970-01-01T00:00:00.000Z')
  }),
  apiKeys: asObject({
    // Partner-issued reporting key, human/ops-set in production CouchDB
    // (reports_apps partnerIds.nymswap.apiKeys). Never fetched or set by code.
    // Optional so an unprovisioned partner entry no-ops (returns []) instead of
    // throwing every query cycle, matching the other couch plugins.
    apiKey: asMaybe(asString)
  })
})

// NYM's EdgeStatus enum. Unknown values degrade to 'other' instead of throwing.
const asNymStatus = asMaybe(
  asValue(
    'pending',
    'processing',
    'infoNeeded',
    'expired',
    'refunded',
    'completed'
  ),
  'other'
)
type NymStatus = ReturnType<typeof asNymStatus>

const statusMap: { [key in NymStatus]: Status } = {
  pending: 'pending',
  processing: 'processing',
  infoNeeded: 'blocked',
  expired: 'expired',
  refunded: 'refunded',
  completed: 'complete',
  other: 'other'
}

// A supported-asset entry from GET /api/partner/v1/currencies. Only the fields
// used to convert native amounts to major units are consumed.
const asNymCurrency = asObject({
  currencyCode: asString,
  tokenId: asMaybe(asString),
  decimals: asNumber
})
const asNymCurrencies = asArray(asNymCurrency)

// One EdgeTransactionRecord. `orderId`/`status`/`createdDate`, the currency
// codes, and the native-unit amounts are always present; the nullable/optional
// fields use asMaybe so a partial or differently-typed record degrades to
// undefined instead of throwing and aborting the whole query block.
const asNymTransaction = asObject({
  orderId: asString,
  status: asNymStatus,
  createdDate: asString,
  completedDate: asMaybe(asString),

  // Source (deposit) side.
  sourceCurrencyCode: asString,
  sourceTokenId: asMaybe(asString),
  sourceAmount: asString,
  sourceNetwork: asMaybe(asString),
  sourceEvmChainId: asMaybe(asNumber),
  payinAddress: asMaybe(asString),
  payinTxid: asMaybe(asString),

  // Destination (payout) side.
  destinationCurrencyCode: asString,
  destinationTokenId: asMaybe(asString),
  destinationAmount: asString,
  destinationNetwork: asMaybe(asString),
  destinationEvmChainId: asMaybe(asNumber),
  payoutAddress: asMaybe(asString),
  payoutTxid: asMaybe(asString)
})

// Reporting page envelope: `{ transactions, nextCursor }`.
const asNymResult = asObject({
  transactions: asArray(asUnknown),
  nextCursor: asMaybe(asString)
})

// Converts a native-unit amount string to a major-unit number using the asset's
// decimals (live /currencies, then DEFAULT_DECIMALS). Throws for an unknown
// asset so the caller skips the record rather than reporting a mis-scaled
// amount that would corrupt the downstream USD valuation.
const toMajorAmount = (
  nativeAmount: string,
  currencyCode: string,
  tokenId: string | undefined,
  decimals: DecimalsMap
): number => {
  const key = decimalsKey(currencyCode, tokenId)
  const dec = decimals[key] ?? DEFAULT_DECIMALS[key]
  if (dec == null) {
    throw new Error(`Unknown decimals for ${key}`)
  }
  const native = safeParseFloat(nativeAmount)
  if (!Number.isFinite(native)) return 0
  return native / 10 ** dec
}

// Fetches NYM's supported-asset list into a decimals lookup. Non-fatal: on any
// error, processNymTx falls back to DEFAULT_DECIMALS for the known asset set.
const fetchDecimals = async (
  headers: { [key: string]: string },
  log: PluginParams['log']
): Promise<DecimalsMap> => {
  const decimals: DecimalsMap = {}
  try {
    const response = await retryFetch(`${NYM_API_BASE}${CURRENCIES_PATH}`, {
      method: 'GET',
      headers
    })
    if (!response.ok) throw new Error(await response.text())
    const currencies = asNymCurrencies(await response.json())
    for (const c of currencies) {
      decimals[decimalsKey(c.currencyCode, c.tokenId)] = c.decimals
    }
  } catch (e) {
    log.warn(
      `Could not fetch NYM currencies, using fallback decimals: ${String(e)}`
    )
  }
  return decimals
}

export async function queryNym(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const { settings, apiKeys } = asNymPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  // A null/empty apiKey means the partner entry is unprovisioned. Skip silently
  // (return no transactions) rather than erroring, so an unconfigured nymswap
  // key does not fail every query cycle.
  if (apiKey == null || apiKey === '') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  // Progress persisted before this run. Only advanced past when the full cursor
  // walk COMPLETES (nextCursor null); on an error-driven early exit we keep this
  // value so a partial fetch never skips orders we did not page through. This
  // does not depend on the API's page ordering.
  const savedIsoDate = latestIsoDate

  const standardTxs: StandardTx[] = []
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': apiKey
  }

  const decimals = await fetchDecimals(headers, log)

  let lookbackTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (lookbackTimestamp < 0) lookbackTimestamp = 0
  const startDate = new Date(lookbackTimestamp).toISOString()

  let cursor: string | undefined
  let retry = 0
  let completed = false

  let page = 0
  for (; page < MAX_PAGES; page++) {
    let url = `${NYM_API_BASE}${REPORTS_PATH}?startDate=${encodeURIComponent(
      startDate
    )}&limit=${PAGE_LIMIT}`
    if (cursor != null) url += `&cursor=${encodeURIComponent(cursor)}`
    try {
      const response = await retryFetch(url, { method: 'GET', headers })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }
      const { transactions, nextCursor } = asNymResult(await response.json())
      // Buffer this page so a mid-page throw is retried idempotently: the
      // buffer is discarded on error, so already-processed records are never
      // appended twice (which would create duplicate orderIds and Couch _id
      // conflicts on bulk insert).
      //
      // An unparseable or unpriceable record therefore propagates to the retry
      // below rather than being skipped. Dropping it here would lose the order
      // permanently: the walk would still complete, `latestIsoDate` would
      // advance past it, and the next run's lookback window would no longer
      // reach it. Failing the page keeps `completed` false, so progress is not
      // advanced and the order is re-queried.
      const pageTxs: StandardTx[] = []
      let pageLatestIsoDate = latestIsoDate
      for (const rawTx of transactions) {
        const standardTx = processNymTx(rawTx, pluginParams, decimals)
        pageTxs.push(standardTx)
        if (standardTx.isoDate > pageLatestIsoDate) {
          pageLatestIsoDate = standardTx.isoDate
        }
      }
      standardTxs.push(...pageTxs)
      latestIsoDate = pageLatestIsoDate
      log(
        `cursor=${cursor ?? 'start'} count=${
          transactions.length
        } latestIsoDate ${latestIsoDate}`
      )
      retry = 0
      // A null nextCursor marks the last page: the walk is complete.
      if (nextCursor == null) {
        completed = true
        break
      }
      cursor = nextCursor
    } catch (e) {
      log.error(String(e))
      // Retry the SAME cursor a few times to ride out throttling.
      retry++
      if (retry <= MAX_RETRIES) {
        log.warn(`Snoozing ${5 * retry}s`)
        await snooze(5000 * retry)
      } else {
        // Give up this run WITHOUT advancing progress (completed stays false),
        // so the unfetched remainder is re-queried next run. Already-fetched
        // records are still returned; the cache engine dedupes them by orderId.
        break
      }
    }
  }

  if (page >= MAX_PAGES) {
    log.warn(
      `NYM hit the ${MAX_PAGES}-page cap; progress is not advanced, so the remainder is re-queried next run`
    )
  }

  const out: PluginResult = {
    settings: { latestIsoDate: completed ? latestIsoDate : savedIsoDate },
    transactions: standardTxs
  }
  return out
}

export const nymswap: PartnerPlugin = {
  // queryFunc takes PluginParams and returns a PluginResult
  queryFunc: queryNym,
  pluginName: 'NYM',
  pluginId: 'nymswap'
}

// Follows the uniform `(rawTx, pluginParams)` processor contract shared by the
// sibling plugins, so a generic backfill caller can invoke it without knowing
// anything NYM-specific. `decimals` is the live /currencies overlay and is
// optional: a caller that has not fetched it still gets DEFAULT_DECIMALS.
export function processNymTx(
  rawTx: unknown,
  pluginParams: PluginParams,
  decimals: DecimalsMap = {}
): StandardTx {
  const { log } = pluginParams
  let tx: ReturnType<typeof asNymTransaction>
  try {
    tx = asNymTransaction(rawTx)
  } catch (e) {
    log.error(`${String(e)}: ${describeRawTx(rawTx)}`)
    throw e
  }

  // completedDate is frequently null even on completed orders, so key the report
  // timestamp off createdDate (always present).
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(tx.createdDate)

  const depositAmount = toMajorAmount(
    tx.sourceAmount,
    tx.sourceCurrencyCode,
    tx.sourceTokenId,
    decimals
  )
  const payoutAmount = toMajorAmount(
    tx.destinationAmount,
    tx.destinationCurrencyCode,
    tx.destinationTokenId,
    decimals
  )

  const depositAsset = resolveNymChain(
    tx.sourceNetwork,
    tx.sourceEvmChainId,
    tx.sourceTokenId,
    tx.sourceCurrencyCode
  )
  const payoutAsset = resolveNymChain(
    tx.destinationNetwork,
    tx.destinationEvmChainId,
    tx.destinationTokenId,
    tx.destinationCurrencyCode
  )

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.orderId,
    countryCode: null,
    depositTxid: tx.payinTxid,
    depositAddress: tx.payinAddress,
    depositCurrency: tx.sourceCurrencyCode.toUpperCase(),
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount,
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.payoutTxid,
    payoutAddress: tx.payoutAddress,
    payoutCurrency: tx.destinationCurrencyCode.toUpperCase(),
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}

interface NymChainInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

/**
 * Map a NYM reports-API network name (and optional EVM chain id / contract)
 * to Edge pluginId, evmChainId, and tokenId. Missing network and chain id
 * leave the fields unset so older partial records still parse. An unknown
 * network name throws.
 */
export function resolveNymChain(
  network: string | undefined,
  evmChainId: number | undefined,
  contractAddress: string | undefined,
  currencyCode: string
): NymChainInfo {
  let chainPluginId: string | undefined
  if (evmChainId != null && REVERSE_EVM_CHAIN_IDS[evmChainId] != null) {
    chainPluginId = REVERSE_EVM_CHAIN_IDS[evmChainId]
  } else if (network != null && network !== '') {
    chainPluginId = NYM_NETWORK_TO_PLUGIN_ID[network.toLowerCase()]
    if (chainPluginId == null) {
      throw new Error(
        `Unknown NYM network "${network}" for ${currencyCode}. Add mapping to NYM_NETWORK_TO_PLUGIN_ID.`
      )
    }
  }

  if (chainPluginId == null) {
    return {
      chainPluginId: undefined,
      evmChainId: undefined,
      tokenId: undefined
    }
  }

  const resolvedEvmChainId = EVM_CHAIN_IDS[chainPluginId] ?? evmChainId
  if (contractAddress == null || contractAddress === '') {
    return {
      chainPluginId,
      evmChainId: resolvedEvmChainId,
      tokenId: null
    }
  }

  const tokenType = tokenTypes[chainPluginId]
  if (tokenType == null) {
    throw new Error(
      `Unknown tokenType for chainPluginId ${chainPluginId} (currency: ${currencyCode}, network: ${network ??
        'null'}). Add tokenType to tokenTypes.`
    )
  }
  return {
    chainPluginId,
    evmChainId: resolvedEvmChainId,
    tokenId: createTokenId(
      tokenType,
      currencyCode.toUpperCase(),
      contractAddress
    )
  }
}
