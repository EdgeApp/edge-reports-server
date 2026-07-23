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
import { retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'

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
  payment_method: asMaybe(asString)
})

type RevolutTx = ReturnType<typeof asRevolutTx>

const asPreRevolutTx = asObject({
  state: asString
})

const asRevolutResult = asObject({
  transactions: asArray(asUnknown),
  next_cursor: asMaybe(asString)
})

const PLUGIN_START_DATE = '2024-01-01T00:00:00.000Z'
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 7 // 7 days
const QUERY_TIME_BLOCK_MS = QUERY_LOOKBACK
const QUERY_LIMIT = 100
const MAX_RETRIES = 5

export async function queryRevolut(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
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
      let cursor: string | undefined
      // Buffer this window's results so a mid-window failure can be retried
      // idempotently: the buffer is discarded on error, so already-paged txs
      // are never appended twice (which would create duplicate orderIds and
      // Couch _id conflicts on bulk insert).
      const windowTxs: StandardTx[] = []
      let windowLatestIsoDate = latestIsoDate

      while (true) {
        const from = new Date(startTime).toISOString()
        const to = new Date(endTime).toISOString()

        let url = `https://api.revolut.com/partner/v1/transactions?from=${from}&to=${to}&limit=${QUERY_LIMIT}`
        if (cursor != null) url += `&cursor=${cursor}`

        log(`Querying Revolut from:${from} to:${to}`)

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
        cursor = result.next_cursor

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
          log(`Revolut txs ${result.transactions.length}`)
        }

        if (cursor == null) {
          break
        }
      }

      // The window completed cleanly: commit its txs and advance progress.
      // Persisting progress on empty windows too keeps the next invocation
      // from re-walking the full range from PLUGIN_START_DATE; the
      // QUERY_LOOKBACK overlap still re-checks the most recent window for
      // late-completing orders.
      standardTxs.push(...windowTxs)
      latestIsoDate = windowLatestIsoDate
      const scannedThroughIso = new Date(Math.min(endTime, now)).toISOString()
      if (scannedThroughIso > latestIsoDate) {
        latestIsoDate = scannedThroughIso
      }

      startTime = endTime
      if (endTime > now) {
        break
      }
      retry = 0
    } catch (e) {
      log.error(String(e))
      retry++
      if (retry <= MAX_RETRIES) {
        log(`Snoozing ${60 * retry}s`)
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
  // The wallet_address is the user's crypto wallet, so it belongs on
  // whichever side holds crypto: payout for a buy, deposit for a sell.
  const depositAddress = direction === 'sell' ? tx.wallet_address : undefined
  const payoutAddress = direction === 'buy' ? tx.wallet_address : undefined

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,
    countryCode: tx.country_code ?? null,
    depositTxid,
    depositAddress,
    depositCurrency:
      direction === 'buy'
        ? tx.fiat_currency.toUpperCase()
        : tx.crypto_currency.toUpperCase(),
    depositChainPluginId: undefined,
    depositEvmChainId: undefined,
    depositTokenId: undefined,
    depositAmount: direction === 'buy' ? tx.fiat_amount : tx.crypto_amount,
    direction,
    exchangeType: 'fiat',
    paymentType: getRevolutPaymentType(tx),
    payoutTxid,
    payoutAddress,
    payoutCurrency:
      direction === 'buy'
        ? tx.crypto_currency.toUpperCase()
        : tx.fiat_currency.toUpperCase(),
    payoutChainPluginId: undefined,
    payoutEvmChainId: undefined,
    payoutTokenId: undefined,
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
      throw new Error(
        `Unknown payment method: ${tx.payment_method} for ${tx.id}`
      )
  }
}
