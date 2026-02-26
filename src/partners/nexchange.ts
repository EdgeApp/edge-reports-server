import {
  asArray,
  asBoolean,
  asEither,
  asNull,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'

import {
  asStandardPluginParams,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { retryFetch, safeParseFloat } from '../util'
import { createTokenId, tokenTypes } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

// n.exchange endpoints are fixed for all deployments; they intentionally are
// not exposed via apiKeys.  Auth uses the modern `x-api-key` header — the
// legacy `Authorization: ApiKey <key>` form is not used.
const BASE_URL = 'https://api.n.exchange/en/api/v1'
const CURRENCY_URL = 'https://api.n.exchange/en/api/v2/currency/'

const asNexchangeTransfer = asObject({
  currency: asString,
  amount: asString,
  address: asOptional(asEither(asString, asNull), null),
  txid: asOptional(asEither(asString, asNull), null)
})

const asNexchangeOrder = asObject({
  orderId: asString,
  status: asString,
  createdAt: asString,
  deposit: asNexchangeTransfer,
  payout: asNexchangeTransfer,
  countryCode: asOptional(asEither(asString, asNull), null)
})

const asNexchangeOrdersResponse = asObject({
  orders: asArray(asUnknown),
  nextCursor: asOptional(asEither(asString, asNull), null),
  hasMore: asBoolean
})

// Each entry from /api/v2/currency/.  Only the fields below are needed to
// derive Edge chain plugin / token ids; other catalog fields (decimals,
// withdrawal_fee, etc.) are intentionally ignored.
const asNexchangeCurrencyMeta = asObject({
  code: asString,
  is_fiat: asOptional(asBoolean, false),
  network: asOptional(asEither(asString, asNull), null),
  contract_address: asOptional(asEither(asString, asNull), null),
  common_symbol: asOptional(asEither(asString, asNull), null)
})

const asNexchangeCurrencyList = asArray(asNexchangeCurrencyMeta)

export type NexchangeCurrencyMeta = ReturnType<typeof asNexchangeCurrencyMeta>
export type NexchangeCurrencyInfoMap = Record<string, NexchangeCurrencyMeta>

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const LIMIT = 200
const MAX_ERROR_TEXT_LENGTH = 500

const statusMap: { [key: string]: Status } = {
  released: 'complete',
  complete: 'complete',
  completed: 'complete',
  done: 'complete',
  processing: 'processing',
  exchanging: 'processing',
  confirming: 'processing',
  waiting: 'pending',
  pending: 'pending',
  created: 'pending',
  new: 'pending',
  expired: 'expired',
  blocked: 'blocked',
  refund: 'refunded',
  refunded: 'refunded',
  cancelled: 'other',
  canceled: 'other',
  failed: 'other'
}

// Map of n.exchange network identifier -> Edge chain plugin id.
// Network strings are lowercased before lookup so we are resilient to casing
// changes from n.exchange (e.g. HyperEvm vs HYPEREVM).  Networks that have no
// Edge equivalent are intentionally omitted; those transactions will be
// reported without chain/token id enrichment.
//
// n.exchange uses TRON as the canonical network name in the v2 currency
// catalog, but historical Edge audit-orders payloads have also been observed
// to reference TRX — both are mapped so the plugin works regardless of which
// the API returns.
export const NEXCHANGE_NETWORK_TO_PLUGIN_ID: Record<string, string> = {
  ada: 'cardano',
  algo: 'algorand',
  arb: 'arbitrum',
  atom: 'cosmoshub',
  avaxc: 'avalanche',
  base: 'base',
  bch: 'bitcoincash',
  bsc: 'binancesmartchain',
  btc: 'bitcoin',
  dash: 'dash',
  doge: 'dogecoin',
  dot: 'polkadot',
  eos: 'eos',
  etc: 'ethereumclassic',
  eth: 'ethereum',
  fil: 'filecoin',
  filevm: 'filecoinfevm',
  ftm: 'fantom',
  hbar: 'hedera',
  hyperevm: 'hyperevm',
  ltc: 'litecoin',
  // n.exchange exposes both MATIC and POL networks; both reference the same
  // Polygon chain (chain id 137).
  matic: 'polygon',
  op: 'optimism',
  pol: 'polygon',
  sol: 'solana',
  sonic: 'sonic',
  sui: 'sui',
  ton: 'ton',
  tron: 'tron',
  trx: 'tron',
  xlm: 'stellar',
  xmr: 'monero',
  xrp: 'ripple',
  xtz: 'tezos',
  zec: 'zcash'
}

export function toQueryIsoDate(latestIsoDate: string): string {
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  return new Date(previousTimestamp).toISOString()
}

export function parseApiDate(
  dateString: string
): { isoDate: string; timestamp: number } {
  const hasTimezone = /(Z|[+-]\d{2}:\d{2})$/.test(dateString)
  const normalized = hasTimezone ? dateString : `${dateString}Z`
  const date = new Date(normalized)
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid createdAt date: ${dateString}`)
  }
  return {
    isoDate: date.toISOString(),
    timestamp: date.getTime() / 1000
  }
}

function truncateForError(text: string): string {
  return text.length > MAX_ERROR_TEXT_LENGTH
    ? `${text.slice(0, MAX_ERROR_TEXT_LENGTH)}…`
    : text
}

/**
 * Fetches the n.exchange currency catalog and returns a lookup keyed by the
 * uppercased currency code.  The catalog supplies the network and contract
 * address fields that the audit-orders endpoint omits, which Edge needs to
 * populate chain plugin id and token id.
 */
export async function fetchNexchangeCurrencyMap(): Promise<
  NexchangeCurrencyInfoMap
> {
  const response = await retryFetch(CURRENCY_URL, { method: 'GET' })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `HTTP ${response.status.toString()}: ${truncateForError(text)}`
    )
  }
  const json = await response.json()
  const currencies = asNexchangeCurrencyList(json)
  const map: NexchangeCurrencyInfoMap = {}
  for (const currency of currencies) {
    map[currency.code.toUpperCase()] = currency
  }
  return map
}

/**
 * Returned by `resolveNexchangeAsset`.  The shape is consistent across all
 * exit branches so callers can rely on the field set.  `chainPluginId`,
 * `tokenId`, and `evmChainId` are `undefined` whenever the asset cannot be
 * mapped to an Edge chain/token; `tokenId` is `null` to mean "native chain
 * asset" (per Edge's tokenId conventions), so the distinction between
 * "unmapped" and "native" is preserved.
 */
export interface ResolvedNexchangeAsset {
  currencyCode: string
  chainPluginId: string | undefined
  tokenId: string | null | undefined
  evmChainId: number | undefined
}

function asUnmapped(currencyCode: string): ResolvedNexchangeAsset {
  return {
    currencyCode,
    chainPluginId: undefined,
    tokenId: undefined,
    evmChainId: undefined
  }
}

/**
 * Resolves an n.exchange currency code into Edge chain plugin and token
 * identifiers.  Returns an "unmapped" shape (all chain fields undefined) when
 * the network is unknown to Edge, when no metadata is available, or when the
 * currency is fiat.  Callers should leave the corresponding StandardTx
 * fields undefined in that case so downstream rates lookup can fall back to
 * currency-code mappings.
 *
 * Throws if a token-supporting chain has a contract address that cannot be
 * converted into an Edge tokenId, so the bad payload is surfaced rather than
 * silently producing an unenriched transaction.
 */
export function resolveNexchangeAsset(
  currencyCode: string,
  currencyMap: NexchangeCurrencyInfoMap
): ResolvedNexchangeAsset {
  const upper = currencyCode.toUpperCase()
  const meta = currencyMap[upper]

  // Default to the raw nexchange code; downstream `standardizeNames` handles
  // some of the composite codes (e.g. USDCSOL -> USDC).
  let normalizedCode = upper

  if (meta == null) return asUnmapped(normalizedCode)

  // Prefer the canonical symbol when n.exchange supplies a clean ticker.
  // Some entries embed suffixes like "USDT-old"; only use the symbol when it
  // is alphanumeric.
  if (
    meta.common_symbol != null &&
    meta.common_symbol !== '' &&
    /^[A-Za-z0-9]+$/.test(meta.common_symbol)
  ) {
    normalizedCode = meta.common_symbol.toUpperCase()
  }

  if (meta.is_fiat) return asUnmapped(normalizedCode)

  const network = meta.network
  if (network == null || network === '') return asUnmapped(normalizedCode)

  const chainPluginId = NEXCHANGE_NETWORK_TO_PLUGIN_ID[network.toLowerCase()]
  if (chainPluginId == null) return asUnmapped(normalizedCode)

  const evmChainId = EVM_CHAIN_IDS[chainPluginId]
  const contractAddress = meta.contract_address

  // No contract_address means a native chain asset.
  if (contractAddress == null || contractAddress === '') {
    return {
      currencyCode: normalizedCode,
      chainPluginId,
      tokenId: null,
      evmChainId
    }
  }

  // The contract address is present but the chain does not support tokens in
  // Edge's model; fall back to a chain-only mapping so we at least populate
  // the chain plugin id for rates lookup.
  const tokenType = tokenTypes[chainPluginId]
  if (tokenType == null) {
    return {
      currencyCode: normalizedCode,
      chainPluginId,
      tokenId: null,
      evmChainId
    }
  }

  const tokenId = createTokenId(tokenType, normalizedCode, contractAddress)
  return { currencyCode: normalizedCode, chainPluginId, tokenId, evmChainId }
}

export async function queryNexchange(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null || apiKey === '') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const headers = { 'x-api-key': apiKey }
  const queryDateFrom = toQueryIsoDate(latestIsoDate)
  const txByOrderId: Map<string, StandardTx> = new Map()
  let cursor: string | undefined
  let offset = 0

  try {
    // The currency catalog supplies the network/contract metadata that the
    // audit-orders endpoint omits, so it is required for chain/token
    // enrichment.  Fetch it up front; a failure aborts the run (saving
    // nothing) rather than persisting a batch of unenriched transactions.
    const currencyMap = await fetchNexchangeCurrencyMap()

    while (true) {
      const params: string[] = [
        `dateFrom=${encodeURIComponent(queryDateFrom)}`,
        `limit=${LIMIT.toString()}`,
        'sortDirection=ASC'
      ]
      if (cursor != null && cursor !== '') {
        params.push(`cursor=${encodeURIComponent(cursor)}`)
      } else {
        params.push(`offset=${offset.toString()}`)
      }

      const url = `${BASE_URL}/audits/edge/orders?${params.join('&')}`
      const response = await retryFetch(url, { headers, method: 'GET' })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(
          `HTTP ${response.status.toString()}: ${truncateForError(text)}`
        )
      }
      const json = await response.json()
      const { orders, nextCursor, hasMore } = asNexchangeOrdersResponse(json)

      for (const rawOrder of orders) {
        const standardTx = processNexchangeTx(rawOrder, currencyMap)
        txByOrderId.set(standardTx.orderId, standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
      }
      log(`latestIsoDate ${latestIsoDate}`)

      if (!hasMore || orders.length === 0) break

      if (nextCursor != null && nextCursor !== '') {
        cursor = nextCursor
      } else {
        // Reset cursor when falling back to offset, otherwise the previous
        // cursor value would re-pin pagination to the wrong position next
        // iteration.
        cursor = undefined
        offset += orders.length
      }
    }
  } catch (e) {
    log.error(String(e))
    // Do not re-throw. Pagination is oldest -> newest, so any transactions
    // already collected are fully processed and older than latestIsoDate; we
    // can safely persist that progress and resume from it next run. A failing
    // order halts pagination (it is never silently skipped) so its volume is
    // retried rather than lost.
  }

  return {
    settings: { latestIsoDate },
    transactions: Array.from(txByOrderId.values())
  }
}

export const nexchange: PartnerPlugin = {
  queryFunc: queryNexchange,
  pluginName: 'Nexchange',
  pluginId: 'nexchange'
}

export function processNexchangeTx(
  rawTx: unknown,
  currencyMap: NexchangeCurrencyInfoMap
): StandardTx {
  const tx = asNexchangeOrder(rawTx)
  const lowerStatus = tx.status.toLowerCase()
  const status = statusMap[lowerStatus] ?? 'other'
  const { isoDate, timestamp } = parseApiDate(tx.createdAt)

  const deposit = resolveNexchangeAsset(tx.deposit.currency, currencyMap)
  const payout = resolveNexchangeAsset(tx.payout.currency, currencyMap)

  return {
    status,
    orderId: tx.orderId,
    countryCode: tx.countryCode,
    depositTxid: tx.deposit.txid ?? undefined,
    depositAddress: tx.deposit.address ?? undefined,
    depositCurrency: deposit.currencyCode,
    depositChainPluginId: deposit.chainPluginId,
    depositTokenId: deposit.tokenId,
    depositEvmChainId: deposit.evmChainId,
    depositAmount: safeParseFloat(tx.deposit.amount),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.payout.txid ?? undefined,
    payoutAddress: tx.payout.address ?? undefined,
    payoutCurrency: payout.currencyCode,
    payoutChainPluginId: payout.chainPluginId,
    payoutTokenId: payout.tokenId,
    payoutEvmChainId: payout.evmChainId,
    payoutAmount: safeParseFloat(tx.payout.amount),
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
}
