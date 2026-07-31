import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  asStandardPluginParams,
  EDGE_APP_START_DATE,
  FiatPaymentType,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'
import { EVM_CHAIN_IDS } from '../util/chainIds'

// Revolut Ramp reporting plugin.
//
// Confirmed against the live API with the key Edge already ships in the GUI
// (env.json RAMP_PLUGIN_INITS.revolut, which also carries `apiUrl`):
//   GET https://ramp-partners.revolut.com/partners/api/2.0/orders
// authenticated with an `X-API-KEY` header. Docs:
// https://developer.revolut.com/docs/crypto-ramp/retrieve-all-orders
//
// Two shapes of this API are easy to get wrong:
//   * `start`/`end` are DATE-ONLY (`YYYY-MM-DD`). An ISO date-time, an epoch
//     seconds value, or an epoch millis value all return HTTP 400 "Invalid
//     field 'start'. Date value parsing error".
//   * The response is a BARE JSON ARRAY of orders, not an envelope with a
//     cursor. Paging is `skip`/`limit`, walked until a short page arrives.
const DEFAULT_API_URL = 'https://ramp-partners.revolut.com'
const ORDERS_PATH = '/partners/api/2.0/orders'

// Revolut has no orders before this; starting earlier only wastes empty pages.
const PLUGIN_START_DATE = '2024-01-01T00:00:00.000Z'
// Re-query a window behind saved progress so orders that settle after a run are
// re-seen. Date-only bounds mean the smallest meaningful window is a day.
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 7 // 7 days
const PAGE_LIMIT = 1000
const MAX_RETRIES = 5

const asRevolutAmount = asObject({
  amount: asNumber,
  currency: asString
})

// Statuses observed across the full live order history. Revolut does not
// publish the enum (the docs host rejects unauthenticated reads), so an
// unrecognised value degrades to 'other' rather than throwing and stalling the
// whole run on one in-flight order.
const asRevolutStatus = asMaybe(
  asValue('COMPLETED', 'FAILED', 'AWAITING_PAYMENT'),
  'OTHER'
)
type RevolutStatus = ReturnType<typeof asRevolutStatus>

const statusMap: { [key in RevolutStatus]: Status } = {
  COMPLETED: 'complete',
  FAILED: 'failed',
  AWAITING_PAYMENT: 'pending',
  OTHER: 'other'
}

// One order. Only `id`, `fiat`, `crypto`, `created_at` and `status` are
// guaranteed across the live set; everything else is absent on some rows (a
// FAILED order commonly has no `payment`, `wallet` or `transaction_hash`), so
// those use asMaybe rather than aborting the page on an ordinary failed order.
const asRevolutOrder = asObject({
  id: asString,
  fiat: asRevolutAmount,
  crypto: asObject({
    amount: asNumber,
    currencyId: asString
  }),
  created_at: asString,
  updated_at: asMaybe(asString),
  status: asRevolutStatus,
  payment: asMaybe(asString),
  wallet: asMaybe(asString),
  transaction_hash: asMaybe(asString)
})
type RevolutOrder = ReturnType<typeof asRevolutOrder>

const asRevolutOrders = asArray(asUnknown)

// Revolut's `crypto.currencyId` is either a bare code for a native asset
// ("BTC") or `CODE-CHAIN` for a token ("USDT-TRON"). This maps the chain suffix
// to an Edge pluginId. Codes seen across the full live order history:
// BTC ETH LTC SOL XRP DOGE XLM POL ADA AVAX ALGO, plus USDT/USDC/UNI on
// TRON, SOL, ETH and POL.
const NATIVE_PLUGIN_IDS: { [currencyCode: string]: string } = {
  ADA: 'cardano',
  ALGO: 'algorand',
  AVAX: 'avalanche',
  BTC: 'bitcoin',
  DOGE: 'dogecoin',
  ETH: 'ethereum',
  LTC: 'litecoin',
  POL: 'polygon',
  SOL: 'solana',
  XLM: 'stellar',
  XRP: 'ripple'
}

const CHAIN_SUFFIX_PLUGIN_IDS: { [suffix: string]: string } = {
  ETH: 'ethereum',
  POL: 'polygon',
  SOL: 'solana',
  TRON: 'tron'
}

interface ResolvedRevolutAsset {
  currencyCode: string
  chainPluginId: string | undefined
  tokenId: string | null | undefined
  evmChainId: number | undefined
}

/**
 * Resolves a Revolut `currencyId` into Edge chain and token identifiers.
 *
 * A native asset resolves fully, with `tokenId: null` per Edge's convention for
 * the chain's own gas asset. A token resolves its chain but leaves `tokenId`
 * undefined: Revolut reports no contract address, and minting a tokenId from a
 * guessed contract would mis-price the asset. Undefined leaves downstream rates
 * lookup to fall back to the currency code, which is why the code is returned
 * with the chain suffix stripped ("USDT-TRON" -> "USDT").
 */
export function resolveRevolutAsset(currencyId: string): ResolvedRevolutAsset {
  const upper = currencyId.toUpperCase()

  const nativePluginId = NATIVE_PLUGIN_IDS[upper]
  if (nativePluginId != null) {
    return {
      currencyCode: upper,
      chainPluginId: nativePluginId,
      tokenId: null,
      evmChainId: EVM_CHAIN_IDS[nativePluginId]
    }
  }

  const separatorIndex = upper.lastIndexOf('-')
  if (separatorIndex > 0) {
    const currencyCode = upper.slice(0, separatorIndex)
    const chainPluginId =
      CHAIN_SUFFIX_PLUGIN_IDS[upper.slice(separatorIndex + 1)]
    if (chainPluginId != null) {
      return {
        currencyCode,
        chainPluginId,
        tokenId: undefined,
        evmChainId: EVM_CHAIN_IDS[chainPluginId]
      }
    }
    // An unknown chain suffix still yields a usable currency code.
    return {
      currencyCode,
      chainPluginId: undefined,
      tokenId: undefined,
      evmChainId: undefined
    }
  }

  return {
    currencyCode: upper,
    chainPluginId: undefined,
    tokenId: undefined,
    evmChainId: undefined
  }
}

const toDateParam = (timestamp: number): string =>
  new Date(timestamp).toISOString().slice(0, 10)

export interface RevolutAttempt {
  order: RevolutOrder
  raw: unknown
}

const isBetterAttempt = (
  candidate: RevolutOrder,
  incumbent: RevolutOrder
): boolean => {
  const candidateComplete = candidate.status === 'COMPLETED'
  const incumbentComplete = incumbent.status === 'COMPLETED'
  if (candidateComplete !== incumbentComplete) return candidateComplete
  return (candidate.updated_at ?? '') > (incumbent.updated_at ?? '')
}

/**
 * Collapses Revolut's per-attempt rows into one winner per order id.
 *
 * An order id is NOT unique in the response: Revolut returns one row per
 * payment attempt, so the same id commonly appears both COMPLETED and FAILED
 * (88 of 500 rows in one live sample, 197 across a full run). `orderId` keys
 * the StandardTx document, so without this the same order is written twice and
 * an arbitrary attempt wins. A settled attempt always beats an unsettled one;
 * between two attempts of the same standing the later `updated_at` wins.
 *
 * Accumulates into the caller's map so the collapse spans pages, not just the
 * page in hand.
 */
export function collectRevolutOrders(
  rawOrders: unknown[],
  bestByOrderId: Map<string, RevolutAttempt>
): void {
  for (const rawOrder of rawOrders) {
    const order = asRevolutOrder(rawOrder)
    const incumbent = bestByOrderId.get(order.id)
    if (incumbent == null || isBetterAttempt(order, incumbent.order)) {
      bestByOrderId.set(order.id, { order, raw: rawOrder })
    }
  }
}

export async function queryRevolut(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys

  // An unprovisioned partner entry no-ops instead of failing every cycle.
  if (apiKey == null || apiKey === '') {
    return {
      settings: { latestIsoDate: settings.latestIsoDate },
      transactions: []
    }
  }

  let { latestIsoDate } = settings
  if (latestIsoDate === EDGE_APP_START_DATE) {
    latestIsoDate = PLUGIN_START_DATE
  }

  // Progress persisted before this run. Only advanced past once the full walk
  // completes, so an error-driven exit never skips unpaged orders.
  const savedIsoDate = latestIsoDate

  let startTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (startTimestamp < 0) startTimestamp = 0
  const now = Date.now()

  // `end` is exclusive of nothing in particular and date-only, so pad a day to
  // be sure today's orders are inside the window.
  const start = toDateParam(startTimestamp)
  const end = toDateParam(now + 1000 * 60 * 60 * 24)

  const headers = { 'X-API-KEY': apiKey }
  // The winning attempt per order id, with its untouched payload so StandardTx
  // still carries the exact row Revolut sent.
  const bestByOrderId = new Map<string, RevolutAttempt>()

  let skip = 0
  let retry = 0
  let completed = false

  while (true) {
    const url = `${DEFAULT_API_URL}${ORDERS_PATH}?start=${start}&end=${end}&skip=${skip}&limit=${PAGE_LIMIT}`
    try {
      log(`Querying Revolut start:${start} end:${end} skip:${skip}`)
      const response = await retryFetch(url, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const rawOrders = asRevolutOrders(await response.json())

      collectRevolutOrders(rawOrders, bestByOrderId)

      log(`Revolut skip:${skip} count:${rawOrders.length}`)
      retry = 0

      // A short page is the last page: there is no cursor or total to consult.
      if (rawOrders.length < PAGE_LIMIT) {
        completed = true
        break
      }
      skip += rawOrders.length
    } catch (e) {
      log.error(String(e))
      retry++
      if (retry <= MAX_RETRIES) {
        log.warn(`Snoozing ${5 * retry}s`)
        await snooze(5000 * retry)
      } else {
        // Give up without advancing progress so the remainder is re-queried.
        break
      }
    }
  }

  const standardTxs: StandardTx[] = []
  for (const { raw } of bestByOrderId.values()) {
    const standardTx = processRevolutTx(raw, pluginParams)
    standardTxs.push(standardTx)
    if (standardTx.isoDate > latestIsoDate) {
      latestIsoDate = standardTx.isoDate
    }
  }

  return {
    settings: { latestIsoDate: completed ? latestIsoDate : savedIsoDate },
    transactions: standardTxs
  }
}

export const revolut: PartnerPlugin = {
  queryFunc: queryRevolut,
  pluginName: 'Revolut',
  pluginId: 'revolut'
}

export function processRevolutTx(
  rawTx: unknown,
  pluginParams: PluginParams
): StandardTx {
  const { log } = pluginParams
  let tx: RevolutOrder
  try {
    tx = asRevolutOrder(rawTx)
  } catch (e) {
    log.error(`${String(e)}: ${JSON.stringify(rawTx)}`)
    throw e
  }

  const { isoDate, timestamp } = smartIsoDateFromTimestamp(tx.created_at)
  const payout = resolveRevolutAsset(tx.crypto.currencyId)

  // Revolut Ramp only reports on-ramp orders, so fiat is always the deposit
  // side and crypto always the payout side. `wallet` is the user's receiving
  // address and `transaction_hash` the payout transaction.
  return {
    status: statusMap[tx.status],
    orderId: tx.id,
    countryCode: null,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: tx.fiat.currency.toUpperCase(),
    depositChainPluginId: undefined,
    depositEvmChainId: undefined,
    depositTokenId: undefined,
    depositAmount: tx.fiat.amount,
    direction: 'buy',
    exchangeType: 'fiat',
    paymentType: getRevolutPaymentType(tx),
    payoutTxid: tx.transaction_hash,
    payoutAddress: tx.wallet,
    payoutCurrency: payout.currencyCode,
    payoutChainPluginId: payout.chainPluginId,
    payoutEvmChainId: payout.evmChainId,
    payoutTokenId: payout.tokenId,
    payoutAmount: tx.crypto.amount,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
}

function getRevolutPaymentType(tx: RevolutOrder): FiatPaymentType | null {
  switch (tx.payment) {
    case 'revolut':
      return 'revolut'
    case 'card':
      return 'credit'
    default:
      // Failed orders frequently carry no payment method at all, and a new
      // method must not abort the run: a null paymentType is a supported
      // StandardTx value, so degrade rather than throw.
      return null
  }
}
