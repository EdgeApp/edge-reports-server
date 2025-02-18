import {
  asArray,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import {
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

const asMoonpayTx = asObject({
  baseCurrency: asMoonpayCurrency,
  baseCurrencyAmount: asNumber,
  baseCurrencyId: asString,
  country: asString,
  createdAt: asString,
  cryptoTransactionId: asString,
  currencyId: asString,
  currency: asMoonpayCurrency,
  id: asString,
  paymentMethod: asOptional(asString),
  quoteCurrencyAmount: asNumber,
  walletAddress: asString
})

type MoonpayTx = ReturnType<typeof asMoonpayTx>

const asPreMoonpayTx = asObject({
  status: asString
})

const asMoonpayResult = asArray(asUnknown)

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5
const PER_REQUEST_LIMIT = 50

export async function queryMoonpay(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []

  let headers
  let latestTimestamp = 0
  if (typeof pluginParams.settings.latestTimestamp === 'number') {
    latestTimestamp = pluginParams.settings.latestTimestamp
  }

  const apiKey = pluginParams.apiKeys.apiKey
  if (typeof apiKey === 'string') {
    headers = {
      Authorization: `Api-Key ${apiKey}`
    }
  } else {
    return {
      settings: { latestTimestamp: latestTimestamp },
      transactions: []
    }
  }

  if (latestTimestamp > QUERY_LOOKBACK) {
    latestTimestamp -= QUERY_LOOKBACK
  }
  let done = false
  let offset = 0
  let newestTimestamp = latestTimestamp
  while (!done) {
    const url = `https://api.moonpay.io/v1/transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}`
    const result = await fetch(url, {
      method: 'GET',
      headers
    })
    const txs = asMoonpayResult(await result.json())
    // cryptoTransactionId is a duplicate among other transactions sometimes
    // in bulk update it throws an error for document update conflict because of this.

    for (const rawTx of txs) {
      const preTx = asPreMoonpayTx(rawTx)
      if (preTx.status === 'completed') {
        const standardTx = processMoonpayTx(rawTx)
        standardTxs.push(standardTx)
        const timestamp = standardTx.timestamp * 1000
        done = latestTimestamp > timestamp || txs.length < PER_REQUEST_LIMIT
        newestTimestamp =
          newestTimestamp > timestamp ? newestTimestamp : timestamp
      }
    }

    offset += PER_REQUEST_LIMIT
  }

  const out: PluginResult = {
    settings: { latestTimestamp: newestTimestamp },
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

export function processMoonpayTx(rawTx: unknown): StandardTx {
  const tx: MoonpayTx = asMoonpayTx(rawTx)
  const date = new Date(tx.createdAt)
  const timestamp = date.getTime()

  const direction = tx.baseCurrency.type === 'fiat' ? 'buy' : 'sell'

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,

    countryCode: tx.country,
    depositTxid: direction === 'sell' ? tx.cryptoTransactionId : undefined,
    depositAddress: undefined,
    depositCurrency: tx.baseCurrency.code.toUpperCase(),
    depositAmount: tx.baseCurrencyAmount,
    direction,
    exchangeType: 'fiat',
    paymentType: getFiatPaymentType(tx),
    payoutTxid: direction === 'buy' ? tx.cryptoTransactionId : undefined,
    payoutAddress: tx.walletAddress,
    payoutCurrency: tx.currency.code.toUpperCase(),
    payoutAmount: tx.quoteCurrencyAmount,
    timestamp: timestamp / 1000,
    isoDate: tx.createdAt,
    usdValue: -1,
    rawTx
  }
  return standardTx
}

function getFiatPaymentType(tx: MoonpayTx): FiatPaymentType | null {
  switch (tx.paymentMethod) {
    case undefined:
      return null
    case 'ach_bank_transfer':
      return 'ach'
    case 'apple_pay':
      return 'applepay'
    case 'credit_debit_card':
      return 'credit'
    case 'gbp_open_banking_payment':
      return 'fasterpayments'
    case 'google_pay':
      return 'googlepay'
    case 'mobile_wallet':
      // Idk?
      return null
    case 'moonpay_balance':
      // Idk?
      return null
    case 'paypal':
      return 'paypal'
    case 'pix_instant_payment':
      return 'pix'
    case 'sepa_bank_transfer':
      return 'sepa'
    case 'venmo':
      return 'venmo'
    case 'yellow_card_bank_transfer':
      // Idk?
      return null
    default:
      throw new Error(
        `Unknown payment method: ${tx.paymentMethod} for ${tx.id}`
      )
  }
}
