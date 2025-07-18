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

const asMoonpayTx = asObject({
  baseCurrency: asMoonpayCurrency,
  baseCurrencyAmount: asNumber,
  baseCurrencyId: asString,
  cardType: asOptional(asValue('apple_pay', 'google_pay', 'card')),
  country: asString,
  createdAt: asDate,
  cryptoTransactionId: asString,
  currencyId: asString,
  currency: asMoonpayCurrency,
  id: asString,
  paymentMethod: asOptional(asString),
  quoteCurrencyAmount: asNumber,
  walletAddress: asString
})

const asMoonpaySellTx = asObject({
  baseCurrency: asMoonpayCurrency,
  baseCurrencyAmount: asNumber,
  baseCurrencyId: asString,
  country: asString,
  createdAt: asDate,
  depositHash: asString,
  id: asString,
  paymentMethod: asOptional(asString),
  quoteCurrency: asMoonpayCurrency,
  quoteCurrencyAmount: asNumber
})

type MoonpayTx = ReturnType<typeof asMoonpayTx>
type MoonpaySellTx = ReturnType<typeof asMoonpaySellTx>

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
            const standardTx = processMoonpaySellTx(rawTx)
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
            const standardTx = processMoonpayTx(rawTx)
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

export function processMoonpayTx(rawTx: unknown): StandardTx {
  const tx: MoonpayTx = asMoonpayTx(rawTx)
  const isoDate = tx.createdAt.toISOString()
  const timestamp = tx.createdAt.getTime()

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
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}

export function processMoonpaySellTx(rawTx: unknown): StandardTx {
  const tx: MoonpaySellTx = asMoonpaySellTx(rawTx)
  const isoDate = tx.createdAt.toISOString()
  const timestamp = tx.createdAt.getTime()
  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,

    countryCode: tx.country,
    depositTxid: tx.depositHash,
    depositAddress: undefined,
    depositCurrency: tx.baseCurrency.code.toUpperCase(),
    depositAmount: tx.baseCurrencyAmount,
    direction: 'sell',
    exchangeType: 'fiat',
    paymentType: getFiatPaymentType(tx),
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency: tx.quoteCurrency.code.toUpperCase(),
    payoutAmount: tx.quoteCurrencyAmount,
    timestamp: timestamp / 1000,
    isoDate,
    usdValue: -1,
    rawTx: rawTx
  }
  return standardTx
}

function getFiatPaymentType(
  tx: MoonpayTx | MoonpaySellTx
): FiatPaymentType | null {
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
      // Older versions of Moonpay data had a separate cardType field.
      return 'cardType' in tx
        ? tx.cardType === 'apple_pay'
          ? 'applepay'
          : tx.cardType === 'google_pay'
          ? 'googlepay'
          : null
        : null
    case 'moonpay_balance':
      return 'moonpaybalance'
    case 'paypal':
      return 'paypal'
    case 'pix_instant_payment':
      return 'pix'
    case 'sepa_bank_transfer':
      return 'sepa'
    case 'venmo':
      return 'venmo'
    case 'yellow_card_bank_transfer':
      return 'yellowcard'
    default:
      throw new Error(
        `Unknown payment method: ${tx.paymentMethod} for ${tx.id}`
      )
  }
}
