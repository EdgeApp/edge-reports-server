import {
  asArray,
  asBoolean,
  asEither,
  asNull,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  EDGE_APP_START_DATE,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { datelog, retryFetch, safeParseFloat, snooze } from '../util'

const asNexchangePluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, EDGE_APP_START_DATE)
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString),
    baseUrl: asOptional(asString, 'https://api.n.exchange/en/api/v1'),
    authMode: asOptional(asValue('x-api-key', 'authorization', 'both'), 'both')
  })
})

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

type NexchangeAuthMode = 'x-api-key' | 'authorization' | 'both'

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const MAX_RETRIES = 5
const LIMIT = 200

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

function toQueryIsoDate(latestIsoDate: string): string {
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  return new Date(previousTimestamp).toISOString()
}

function parseApiDate(dateString: string): { isoDate: string; timestamp: number } {
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

export function makeNexchangeHeaders(
  apiKey: string,
  authMode: NexchangeAuthMode
): Record<string, string> {
  const headers: Record<string, string> = {}
  if (authMode === 'x-api-key' || authMode === 'both') {
    headers['x-api-key'] = apiKey
  }
  if (authMode === 'authorization' || authMode === 'both') {
    headers.Authorization = `ApiKey ${apiKey}`
  }
  return headers
}

export async function queryNexchange(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asNexchangePluginParams(pluginParams)
  const { apiKey, baseUrl, authMode } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null || apiKey === '') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const headers = makeNexchangeHeaders(apiKey, authMode)
  const queryDateFrom = toQueryIsoDate(latestIsoDate)
  let cursor: string | undefined
  let offset = 0
  let retry = 0

  const txByOrderId: Map<string, StandardTx> = new Map()

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

    const url = `${baseUrl}/audits/edge/orders?${params.join('&')}`

    try {
      const response = await retryFetch(url, { headers, method: 'GET' })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status.toString()}: ${text}`)
      }
      const json = await response.json()
      const { orders, nextCursor, hasMore } = asNexchangeOrdersResponse(json)

      for (const rawOrder of orders) {
        const standardTx = processNexchangeTx(rawOrder)
        txByOrderId.set(standardTx.orderId, standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
      }

      if (!hasMore) break
      if (orders.length === 0) break

      if (nextCursor != null && nextCursor !== '') {
        cursor = nextCursor
      } else {
        offset += orders.length
      }
      retry = 0
    } catch (e) {
      datelog(e)
      retry++
      if (retry <= MAX_RETRIES) {
        datelog(`Snoozing ${5 * retry}s`)
        await snooze(5000 * retry)
      } else {
        // We can safely save progress because pagination is oldest -> newest.
        break
      }
    }
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

export function processNexchangeTx(rawTx: unknown): StandardTx {
  const tx = asNexchangeOrder(rawTx)
  const lowerStatus = tx.status.toLowerCase()
  const status = statusMap[lowerStatus] ?? 'other'
  const { isoDate, timestamp } = parseApiDate(tx.createdAt)

  return {
    status,
    orderId: tx.orderId,
    countryCode: tx.countryCode,
    depositTxid: tx.deposit.txid ?? undefined,
    depositAddress: tx.deposit.address ?? undefined,
    depositCurrency: tx.deposit.currency.toUpperCase(),
    depositAmount: safeParseFloat(tx.deposit.amount),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.payout.txid ?? undefined,
    payoutAddress: tx.payout.address ?? undefined,
    payoutCurrency: tx.payout.currency.toUpperCase(),
    payoutAmount: safeParseFloat(tx.payout.amount),
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
}
