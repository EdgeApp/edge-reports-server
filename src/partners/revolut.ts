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
import fetch from 'node-fetch'

import {
  asStandardPluginParams,
  EDGE_APP_START_DATE,
  FiatPaymentType,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx
} from '../types'
import { datelog } from '../util'

const REVOLUT_START_DATE = '2025-01-01T00:00:00.000Z'
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 // ~1.5 years
const PER_REQUEST_LIMIT = 50
const REVOLUT_API_BASE = 'https://api.revolut.com' // Placeholder - will be configured via env var or config

// Revolut currency codes (ISO 4217)
const REVOLUT_CURRENCY = {
  code: 'EUR',
  name: 'Euro',
  decimals: 2
}

const asRevolutQueryResult = asObject({
  docs: asArray(asUnknown),
  limit: asOptional(asNumber)
})

const asRevolutConfig = asObject({
  lastIsoDate: asString,
  enabled: asOptional(asBoolean)
})

const asRevolutApiKey = asObject({
  apiKey: asString
})

type RevolutTx = {
  id: string
  type: string
  state: string
  reason: string
  created_at: string
  updated_at: string
  amount: RevolutAmount
  currency: string
  counterpart: RevolutCounterpart
  beneficiary: RevolutBeneficiary
  legs: RevolutLeg[]
  started_at: string
  completed_at: string
}

type RevolutAmount = {
  value: number
  currency: string
}

type RevolutCounterpart = {
  account_id: string
  type: string
  name: string
}

type RevolutBeneficiary = {
  account_id: string
  type: string
  name: string
}

type RevolutLeg = {
  account_id: string
  type: string
  name: string
}

// Transaction types
const TX_TYPE = {
  CARD_PAYMENT: 'card_payment',
  TRANSFER: 'transfer',
  TOP_UP: 'topup',
  EXCHANGE: 'exchange',
  AT_WITHDRAWAL: 'atm_withdrawal',
  REFUND: 'refund',
  CARD_TRANSACTION: 'card_transaction',
  RECURRING_CARD_PAYMENT: 'recurring_card_payment',
  BILL_PAYMENT: 'bill_payment'
}

// Transaction states
const TX_STATE = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DECLINED: 'declined',
  REVERTED: 'reverted'
}

function getFiatPaymentType(tx: RevolutTx): FiatPaymentType | null {
  switch (tx.type) {
    case TX_TYPE.CARD_PAYMENT:
    case TX_TYPE.TRANSFER:
      return 'card'
    case TX_TYPE.AT_WITHDRAWAL:
      return 'card'
    case TX_TYPE.REFUND:
      return 'card'
    case TX_TYPE.CARD_TRANSACTION:
      return 'card'
    case TX_TYPE.RECURRING_CARD_PAYMENT:
      return 'card'
    case TX_TYPE.BILL_PAYMENT:
      return 'card'
    case TX_TYPE.EXCHANGE:
      return 'card'
    case TX_TYPE.TOP_UP:
      return 'card'
    default:
      return null
  }
}

export async function queryRevolut(
  pluginParams: PluginParams
): Promise<PluginResult> {
  datelog('Starting Revolut query')
  const standardTxs: StandardTx[] = []

  let headers: Record<string, string> = {}
  const { apiKey, settings } = asStandardPluginParams(pluginParams)
  let { latestIsoDate } = settings || { enabled: true }

  // TODO: Replace with proper API key when available
  const revolutKey = apiKey || 'TODO_CONFIGURE_API_KEY'

  if (typeof revolutKey === 'string' && revolutKey.trim()) {
    headers = {
      Authorization: `Bearer ${revolutKey}`
    }
  }

  const queryDate = latestIsoDate || REVOLUT_START_DATE

  try {
    do {
      console.log(`Querying Revolut from ${queryDate}`)

      // Query transactions - using pagination
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const url = `${REVOLUT_API_BASE}/transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}&from=${queryDate}`
        const result = await fetch(url, {
          method: 'GET',
          headers
        })

        if (!result.ok) {
          if (result.status === 401) {
            throw new Error(`Invalid Revolut API key`)
          }
          if (result.status === 403) {
            throw new Error(`Revolut API forbidden - check permissions`)
          }
          if (result.status === 429) {
            console.log('Rate limited, waiting...')
            await new Promise((resolve) => setTimeout(resolve, 5000))
            continue
          }
          throw new Error(`Revolut API error: ${result.status}`)
        }

        const data = await result.json()

        if (!data.transactions || data.transactions.length === 0) {
          break
        }

        for (const rawTx of data.transactions) {
          const tx = processRevolutTx(rawTx)
          if (tx) {
            standardTxs.push(tx)
          }
        }

        if (data.transactions.length < PER_REQUEST_LIMIT) {
          hasMore = false
        } else {
          offset += PER_REQUEST_LIMIT
        }

        console.log(
          `Revolut txs ${data.transactions.length}: ${JSON.stringify(
            data.transactions.slice(-1)
          ).slice(0, 100)}`
        )
      }

      queryIsoDate = new Date(
        new Date(queryDate).getTime() + QUERY_LOOKBACK
      ).toISOString()
      latestIsoDate = queryIsoDate
    } while (new Date() > latestIsoDate)
    latestIsoDate = new Date().toISOString()
  } catch (e) {
    datelog(`Revolut error: ${e}`)
    console.log(`Saving progress up until ${queryIsoDate}`)

    // Save query date for next run
    latestIsoDate = queryIsoDate
  }

  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export function processRevolutTx(rawTx: RevolutTx): StandardTx | null {
  if (!rawTx) {
    return null
  }

  const isoDate = rawTx.created_at || rawTx.started_at
  const timestamp = isoDate ? new Date(isoDate).getTime() : 0

  if (!timestamp) {
    return null
  }

  const direction = ['topup', 'exchange', 'card_payment'].includes(rawTx.type)
    ? 'buy'
    : ['refund', 'atm_withdrawal'].includes(rawTx.type)
      ? 'sell'
      : 'neutral'

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: rawTx.id,
    countryCode: 'GB', // Revolut is UK-based
    depositTxid: rawTx.id,
    depositAddress: undefined,
    depositCurrency: REVOLUT_CURRENCY.code,
    depositAmount: rawTx.amount ? rawTx.amount.value : 0,
    direction,
    exchangeType: 'fiat',
    paymentType: getFiatPaymentType(rawTx),
    payoutTxid: undefined,
    payoutAddress: rawTx.legs && rawTx.legs[0]?.account_id,
    payoutCurrency: REVOLUT_CURRENCY.code,
    payoutAmount: rawTx.amount ? rawTx.amount.value : 0,
    timestamp: timestamp / 1000,
    isoDate,
    usdValue: 0, // Will calculate from rates engine
    rawTx
  }

  return standardTx
}

export const revolut: PartnerPlugin = {
  queryFunc: queryRevolut,
  pluginName: 'Revolut',
  pluginId: 'revolut'
}
