import {
  asArray,
  asDate,
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
  StandardTx
} from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'

const asRevolutPaymentMethod = asMaybe(
  asValue('revolut', 'card', 'bank_transfer', 'apple_pay', 'google_pay')
)

const asRevolutTx = asObject({
  id: asString,
  type: asValue('buy', 'sell'),
  created_at: asDate,
  fiat_amount: asNumber,
  fiat_currency: asString,
  crypto_amount: asNumber,
  crypto_currency: asString,
  wallet_address: asMaybe(asString),
  tx_hash: asMaybe(asString),
  country_code: asMaybe(asString),
  payment_method: asRevolutPaymentMethod
})

type RevolutTx = ReturnType<typeof asRevolutTx>

const asPreRevolutTx = asObject({
  state: asString
})

const asRevolutResult = asObject({
  transactions: asArray(asUnknown),
  next_cursor: asUnknown
})

const PLUGIN_START_DATE = '2024-01-01T00:00:00.000Z'
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 7 // 7 days
const QUERY_TIME_BLOCK_MS = QUERY_LOOKBACK
const QUERY_LIMIT = 100
const MAX_RETRIES = 5
const MAX_PAGES = 1000

export async function queryRevolut(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys

  if (apiKey == null) {
    return {
      settings: { latestIsoDate: settings.latestIsoDate },
      transactions: []
    }
  }

  const now = Date.now()
  let { latestIsoDate } = settings

  if (latestIsoDate === EDGE_APP_START_DATE) {
    latestIsoDate = PLUGIN_START_DATE
  }

  let startTime = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (startTime < 0) startTime = 0

  const standardTxs: StandardTx[] = []
  let retry = 0

  while (true) {
    const endTime = startTime + QUERY_TIME_BLOCK_MS

    try {
      let windowLatestIsoDate = latestIsoDate
      const windowTxs: StandardTx[] = []
      let cursor: string | undefined
      const seenCursors = new Set<string>()
      let pageCount = 0
      let completedPagination = true

      while (true) {
        const requestCursor = cursor
        const from = new Date(startTime).toISOString()
        const to = new Date(endTime).toISOString()

        let url = `https://api.revolut.com/partner/v1/transactions?from=${from}&to=${to}&limit=${QUERY_LIMIT}`
        if (cursor != null) url += `&cursor=${cursor}`

        datelog(`Querying Revolut from:${from} to:${to}`)

        const response = await retryFetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text)
        }

        const jsonObj = await response.json()
        const result = asRevolutResult(jsonObj)
        const rawNextCursor = result.next_cursor
        const nextCursor =
          typeof rawNextCursor === 'string' ? rawNextCursor : undefined
        pageCount++

        for (const rawTx of result.transactions) {
          if (asPreRevolutTx(rawTx).state === 'completed') {
            const standardTx = processRevolutTx(rawTx)
            windowTxs.push(standardTx)
            if (standardTx.isoDate > windowLatestIsoDate) {
              windowLatestIsoDate = standardTx.isoDate
            }
          }
        }

        if (result.transactions.length > 0) {
          datelog(`Revolut txs ${result.transactions.length}`)
        }

        if (rawNextCursor != null && typeof rawNextCursor !== 'string') {
          datelog(`Stopping Revolut pagination on malformed next_cursor`)
          completedPagination = false
          break
        }

        if (
          nextCursor != null &&
          nextCursor !== '' &&
          (nextCursor === requestCursor || seenCursors.has(nextCursor))
        ) {
          datelog(
            `Stopping Revolut pagination on repeated cursor ${nextCursor}`
          )
          completedPagination = false
          break
        }

        if (nextCursor == null || nextCursor === '') {
          break
        }

        if (pageCount >= MAX_PAGES) {
          datelog(`Stopping Revolut pagination after ${MAX_PAGES} pages`)
          completedPagination = false
          break
        }

        seenCursors.add(nextCursor)
        cursor = nextCursor
      }

      if (!completedPagination) {
        standardTxs.push(...windowTxs)
        break
      }

      const watermarkTime = Math.min(endTime, now)
      const windowEndIsoDate = new Date(watermarkTime).toISOString()
      if (windowEndIsoDate > windowLatestIsoDate) {
        windowLatestIsoDate = windowEndIsoDate
      }

      standardTxs.push(...windowTxs)
      latestIsoDate = windowLatestIsoDate
      startTime = endTime
      if (endTime > now) {
        break
      }
      retry = 0
    } catch (e) {
      datelog(e)
      retry++
      if (retry <= MAX_RETRIES) {
        datelog(`Snoozing ${60 * retry}s`)
        await snooze(60000 * retry)
      } else {
        break
      }
    }
    await snooze(1000)
  }

  return {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
}

export const revolut: PartnerPlugin = {
  queryFunc: queryRevolut,
  pluginName: 'Revolut',
  pluginId: 'revolut'
}

export function processRevolutTx(rawTx: unknown): StandardTx {
  const tx = asRevolutTx(rawTx)
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(
    tx.created_at.getTime()
  )

  const direction = tx.type
  const depositTxid = direction === 'sell' ? tx.tx_hash : undefined
  const payoutTxid = direction === 'buy' ? tx.tx_hash : undefined

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,
    countryCode: tx.country_code ?? null,
    depositTxid,
    depositAddress: undefined,
    depositCurrency:
      direction === 'buy'
        ? tx.fiat_currency.toUpperCase()
        : tx.crypto_currency.toUpperCase(),
    depositAmount: direction === 'buy' ? tx.fiat_amount : tx.crypto_amount,
    direction,
    exchangeType: 'fiat',
    paymentType: getRevolutPaymentType(tx),
    payoutTxid,
    payoutAddress: direction === 'buy' ? tx.wallet_address : undefined,
    payoutCurrency:
      direction === 'buy'
        ? tx.crypto_currency.toUpperCase()
        : tx.fiat_currency.toUpperCase(),
    payoutAmount: direction === 'buy' ? tx.crypto_amount : tx.fiat_amount,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}

function getRevolutPaymentType(tx: RevolutTx): FiatPaymentType | null {
  switch (tx.payment_method) {
    case undefined:
      return null
    case 'revolut':
      return 'revolut'
    case 'card':
      return 'credit'
    case 'bank_transfer':
      return 'banktransfer'
    case 'apple_pay':
      return 'applepay'
    case 'google_pay':
      return 'googlepay'
    default:
      return null
  }
}
