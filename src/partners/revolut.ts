import {
  asArray,
  asDate,
  asNumber,
  asObject,
  asOptional,
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

const asRevolutTx = asObject({
  id: asString,
  type: asValue('buy', 'sell'),
  created_at: asDate,
  fiat_amount: asNumber,
  fiat_currency: asString,
  crypto_amount: asNumber,
  crypto_currency: asString,
  wallet_address: asOptional(asString),
  tx_hash: asOptional(asString),
  country_code: asOptional(asString),
  payment_method: asOptional(asString)
})

type RevolutTx = ReturnType<typeof asRevolutTx>

const asPreRevolutTx = asObject({
  state: asString
})

const asRevolutResult = asObject({
  transactions: asArray(asUnknown),
  next_cursor: asOptional(asString)
})

const PLUGIN_START_DATE = '2024-01-01T00:00:00.000Z'
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 7 // 7 days
const QUERY_TIME_BLOCK_MS = QUERY_LOOKBACK
const QUERY_LIMIT = 100
const MAX_RETRIES = 5

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
      let cursor: string | undefined

      while (true) {
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
        cursor = result.next_cursor

        for (const rawTx of result.transactions) {
          if (asPreRevolutTx(rawTx).state === 'completed') {
            const standardTx = processRevolutTx(rawTx)
            standardTxs.push(standardTx)
            if (standardTx.isoDate > latestIsoDate) {
              latestIsoDate = standardTx.isoDate
            }
          }
        }

        if (result.transactions.length > 0) {
          datelog(`Revolut txs ${result.transactions.length}`)
        }

        if (cursor == null) {
          break
        }
      }

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
    payoutAddress: tx.wallet_address,
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
      throw new Error(
        `Unknown payment method: ${tx.payment_method} for ${tx.id}`
      )
  }
}
