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

const asMoonpayCurrency = asObject({
  id: asString,
  type: asString,
  name: asString,
  code: asString
})

// Unified cleaner that handles both buy and sell transactions
// Buy transactions have: paymentMethod, cryptoTransactionId, currency, walletAddress
// Sell transactions have: payoutMethod, depositHash, quoteCurrency
const asMoonpayTx = asObject({
  baseCurrency: asMoonpayCurrency,
  baseCurrencyAmount: asNumber,
  baseCurrencyId: asString,
  cardType: asOptional(asValue('apple_pay', 'google_pay', 'card')),
  country: asString,
  createdAt: asDate,
  id: asString,
  // Common amount field (used by both buy and sell)
  quoteCurrencyAmount: asOptional(asNumber),
  // Buy-specific fields
  cryptoTransactionId: asOptional(asString),
  currency: asOptional(asMoonpayCurrency),
  walletAddress: asOptional(asString),
  paymentMethod: asOptional(asString),
  // Sell-specific fields
  depositHash: asOptional(asString),
  quoteCurrency: asOptional(asMoonpayCurrency),
  payoutMethod: asOptional(asString)
})

type MoonpayTx = ReturnType<typeof asMoonpayTx>

const asPreMoonpayTx = asObject({
  status: asString
})

const asMoonpayResult = asArray(asUnknown)

const PARTNER_START_DATE = '2024-06-17T00:00:00.000Z'
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 7
const PER_REQUEST_LIMIT = 50

export async function queryMoonpay(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []

  let headers
  const { apiKeys, settings } = asStandardPluginParams(pluginParams)
  let { latestIsoDate } = settings
  if (latestIsoDate === EDGE_APP_START_DATE) {
    latestIsoDate = PARTNER_START_DATE
  }
  const { apiKey } = pluginParams.apiKeys

  if (typeof apiKey === 'string') {
    headers = {
      Authorization: `Api-Key ${apiKey}`
    }
  } else {
    return {
      settings: { latestIsoDate },
      transactions: []
    }
  }

  // Make endDate a week after the query date
  let queryIsoDate = new Date(
    new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  ).toISOString()

  const isoNow = new Date().toISOString()

  try {
    do {
      console.log(`Querying Moonpay from ${queryIsoDate} to ${latestIsoDate}`)
      let offset = 0

      while (true) {
        const url = `https://api.moonpay.io/v3/sell_transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}&startDate=${queryIsoDate}&endDate=${latestIsoDate}`
        const result = await fetch(url, {
          method: 'GET',
          headers
        })
        const txs = asMoonpayResult(await result.json())

        for (const rawTx of txs) {
          if (asPreMoonpayTx(rawTx).status === 'completed') {
            const standardTx = processTx(rawTx)
            standardTxs.push(standardTx)
          }
        }

        if (txs.length > 0) {
          console.log(
            `Moonpay sell txs ${txs.length}: ${JSON.stringify(
              txs.slice(-1)
            ).slice(0, 100)}`
          )
        }

        if (txs.length < PER_REQUEST_LIMIT) {
          break
        }

        offset += PER_REQUEST_LIMIT
      }

      offset = 0
      while (true) {
        const url = `https://api.moonpay.io/v1/transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}&startDate=${queryIsoDate}&endDate=${latestIsoDate}`
        const result = await fetch(url, {
          method: 'GET',
          headers
        })
        const txs = asMoonpayResult(await result.json())
        // cryptoTransactionId is a duplicate among other transactions sometimes
        // in bulk update it throws an error for document update conflict because of this.

        for (const rawTx of txs) {
          if (asPreMoonpayTx(rawTx).status === 'completed') {
            const standardTx = processTx(rawTx)
            standardTxs.push(standardTx)
          }
        }
        if (txs.length > 0) {
          console.log(
            `Moonpay buy txs ${txs.length}: ${JSON.stringify(
              txs.slice(-1)
            ).slice(0, 100)}`
          )
        }

        if (txs.length < PER_REQUEST_LIMIT) {
          break
        }

        offset += PER_REQUEST_LIMIT
      }
      queryIsoDate = latestIsoDate
      latestIsoDate = new Date(
        new Date(latestIsoDate).getTime() + QUERY_LOOKBACK
      ).toISOString()
    } while (isoNow > latestIsoDate)
    latestIsoDate = isoNow
  } catch (e) {
    datelog(e)
    console.log(`Moonpay error: ${e}`)
    console.log(`Saving progress up until ${queryIsoDate}`)

    // Set the latestIsoDate to the queryIsoDate so that the next query will
    // query the same time range again since we had a failure in that time range
    latestIsoDate = queryIsoDate
  }

  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const moonpay: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryMoonpay,
  // results in a PluginResult
  pluginName: 'Moonpay',
  pluginId: 'moonpay'
}

export function processTx(rawTx: unknown): StandardTx {
  const tx: MoonpayTx = asMoonpayTx(rawTx)
  const isoDate = tx.createdAt.toISOString()
  const timestamp = tx.createdAt.getTime()

  // Determine direction based on paymentMethod vs payoutMethod
  // Buy transactions have paymentMethod, sell transactions have payoutMethod
  const direction = tx.paymentMethod != null ? 'buy' : 'sell'

  // Get the payout currency - different field names for buy vs sell
  const payoutCurrency = direction === 'buy' ? tx.currency : tx.quoteCurrency
  if (payoutCurrency == null) {
    throw new Error(`Missing payout currency for tx ${tx.id}`)
  }

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,

    countryCode: tx.country,
    depositTxid: direction === 'sell' ? tx.depositHash : undefined,
    depositAddress: undefined,
    depositCurrency: tx.baseCurrency.code.toUpperCase(),
    depositChainPluginId: undefined,
    depositEvmChainId: undefined,
    depositTokenId: undefined,
    depositAmount: tx.baseCurrencyAmount,
    direction,
    exchangeType: 'fiat',
    paymentType: getFiatPaymentType(tx),
    payoutTxid: direction === 'buy' ? tx.cryptoTransactionId : undefined,
    payoutAddress: direction === 'buy' ? tx.walletAddress : undefined,
    payoutCurrency: payoutCurrency.code.toUpperCase(),
    payoutChainPluginId: undefined,
    payoutEvmChainId: undefined,
    payoutTokenId: undefined,
    payoutAmount: tx.quoteCurrencyAmount ?? 0,
    timestamp: timestamp / 1000,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}

const paymentMethodMap: Record<string, FiatPaymentType> = {
  ach_bank_transfer: 'ach',
  apple_pay: 'applepay',
  credit_debit_card: 'credit',
  gbp_bank_transfer: 'fasterpayments',
  gbp_open_banking_payment: 'fasterpayments',
  google_pay: 'googlepay',
  moonpay_balance: 'moonpaybalance',
  paypal: 'paypal',
  pix_instant_payment: 'pix',
  revolut_pay: 'revolut',
  sepa_bank_transfer: 'sepa',
  venmo: 'venmo',
  yellow_card_bank_transfer: 'yellowcard'
}

function getFiatPaymentType(tx: MoonpayTx): FiatPaymentType | null {
  let paymentMethod: FiatPaymentType | null = null
  switch (tx.paymentMethod) {
    case undefined:
      return null
    case 'mobile_wallet':
      // Older versions of Moonpay data had a separate cardType field.
      paymentMethod =
        'cardType' in tx
          ? tx.cardType === 'apple_pay'
            ? 'applepay'
            : tx.cardType === 'google_pay'
            ? 'googlepay'
            : null
          : null
      break
    default:
      paymentMethod = paymentMethodMap[tx.paymentMethod]
      break
  }
  if (paymentMethod == null) {
    throw new Error(`Unknown payment method: ${tx.paymentMethod} for ${tx.id}`)
  }
  return paymentMethod
}
