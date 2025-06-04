import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'
import crypto from 'crypto'
import { Response } from 'node-fetch'

import {
  EDGE_APP_START_DATE,
  FiatPaymentType,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'

export const asBanxaParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, EDGE_APP_START_DATE)
  }),
  apiKeys: asObject({
    apiKey: asString,
    secret: asString,
    partnerUrl: asString
  })
})

type BanxaStatus = ReturnType<typeof asBanxaStatus>
const asBanxaStatus = asMaybe(
  asValue(
    'complete',
    'pendingPayment',
    'cancelled',
    'expired',
    'declined',
    'refunded'
  ),
  'other'
)

type BanxaTx = ReturnType<typeof asBanxaTx>
const asBanxaTx = asObject({
  id: asString,
  status: asBanxaStatus,
  created_at: asString,
  country: asString,
  fiat_amount: asNumber,
  fiat_code: asString,
  coin_amount: asNumber,
  coin_code: asString,
  order_type: asString,
  payment_type: asString,
  wallet_address: asMaybe(asString, '')
})

const asBanxaResult = asObject({
  data: asObject({
    orders: asArray(asUnknown)
  })
})

const MAX_ATTEMPTS = 1
const PAGE_LIMIT = 100
const ONE_DAY_MS = 1000 * 60 * 60 * 24
const ROLLBACK = ONE_DAY_MS * 7 // 7 days

const statusMap: { [key in BanxaStatus]: Status } = {
  complete: 'complete',
  expired: 'expired',
  cancelled: 'other',
  declined: 'blocked',
  refunded: 'refunded',
  pendingPayment: 'pending',
  other: 'other'
}

export async function queryBanxa(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  const { settings, apiKeys } = asBanxaParams(pluginParams)
  const { apiKey, partnerUrl, secret } = apiKeys
  const { latestIsoDate } = settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const today = new Date().toISOString()
  let startDate = new Date(
    new Date(latestIsoDate).getTime() - ROLLBACK
  ).toISOString()

  let endDate = startDate
  while (startDate < today) {
    endDate = new Date(new Date(startDate).getTime() + ROLLBACK).toISOString()
    if (endDate > today) {
      endDate = today
    }

    let page = 1
    let attempt = 0
    try {
      while (true) {
        datelog(
          `BANXA: Querying ${startDate}->${endDate}, limit=${PAGE_LIMIT} page=${page} attempt=${attempt}`
        )
        const response = await fetchBanxaAPI(
          partnerUrl,
          startDate,
          endDate,
          PAGE_LIMIT,
          page,
          apiKey,
          secret
        )

        // Handle the situation where the API is rate limiting the requests
        if (!response.ok) {
          attempt++
          const delay = 2000 * attempt
          datelog(
            `BANXA: Response code ${response.status}. Retrying after ${delay /
              1000} second snooze...`
          )
          await snooze(delay)
          if (attempt === MAX_ATTEMPTS) {
            datelog(`BANXA: Retry Limit reached for date ${startDate}.`)

            const text = await response.text()
            throw new Error(text)
          }
          continue
        }

        const reply = await response.json()
        const jsonObj = asBanxaResult(reply)
        const txs = jsonObj.data.orders
        processBanxaOrders(txs, ssFormatTxs)
        if (txs.length < PAGE_LIMIT) {
          break
        }
        page++
      }
      const newStartTs = new Date(endDate).getTime()
      startDate = new Date(newStartTs).toISOString()
    } catch (e) {
      datelog(String(e))
      endDate = startDate

      // We can safely save our progress since we go from oldest to newest.
      break
    }
  }

  const out: PluginResult = {
    settings: { latestIsoDate: endDate },
    transactions: ssFormatTxs
  }
  return out
}

export const banxa: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryBanxa,
  // results in a PluginResult
  pluginName: 'Banxa',
  pluginId: 'banxa'
}

async function fetchBanxaAPI(
  partnerUrl: string,
  startDate: string,
  endDate: string,
  pageLimit: number,
  page: number,
  apiKey: string,
  secret: string
): Promise<Response> {
  const nonce = Math.floor(new Date().getTime() / 1000)

  const apiQuery = `/api/orders?start_date=${startDate}&end_date=${endDate}&per_page=${pageLimit}&page=${page}`

  const text = `GET\n${apiQuery}\n${nonce}`
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(text)
    .digest('hex')
  const authHeader = `${apiKey}:${hmac}:${nonce}`

  const headers = {
    Authorization: 'Bearer ' + authHeader,
    'Content-Type': 'application/json'
  }

  return await retryFetch(`${partnerUrl}${apiQuery}`, { headers: headers })
}

function processBanxaOrders(
  rawtxs: unknown[],
  ssFormatTxs: StandardTx[]
): void {
  let numComplete = 0
  let newestIsoDate = new Date(0).toISOString()
  let oldestIsoDate = new Date(9999999999999).toISOString()
  for (const rawTx of rawtxs) {
    let standardTx: StandardTx
    try {
      standardTx = processBanxaTx(rawTx)
    } catch (e) {
      datelog(String(e))
      throw e
    }

    ssFormatTxs.push(standardTx)

    if (standardTx.status === 'complete') {
      numComplete++
    }
    if (standardTx.isoDate > newestIsoDate) {
      newestIsoDate = standardTx.isoDate
    }
    if (standardTx.isoDate < oldestIsoDate) {
      oldestIsoDate = standardTx.isoDate
    }
  }
  if (rawtxs.length > 1) {
    datelog(
      `BANXA: Processed ${
        rawtxs.length
      }, #complete=${numComplete} oldest=${oldestIsoDate.slice(
        0,
        16
      )} newest=${newestIsoDate.slice(0, 16)}`
    )
  } else {
    datelog(`BANXA: Processed ${rawtxs.length}`)
  }
}

export function processBanxaTx(rawTx: unknown): StandardTx {
  const banxaTx: BanxaTx = asBanxaTx(rawTx)
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(banxaTx.created_at)

  // Flip the amounts if the order is a SELL
  let payoutAddress
  let inputAmount = banxaTx.fiat_amount
  let inputCurrency = banxaTx.fiat_code
  let outputAmount = banxaTx.coin_amount
  let outputCurrency = banxaTx.coin_code
  if (banxaTx.order_type === 'CRYPTO-SELL') {
    inputAmount = banxaTx.coin_amount
    inputCurrency = banxaTx.coin_code
    outputAmount = banxaTx.fiat_amount
    outputCurrency = banxaTx.fiat_code
  } else {
    payoutAddress = banxaTx.wallet_address
  }

  const direction = banxaTx.order_type === 'CRYPTO-SELL' ? 'sell' : 'buy'

  const paymentType = getFiatPaymentType(banxaTx)

  const standardTx: StandardTx = {
    status: statusMap[banxaTx.status],
    orderId: banxaTx.id,
    countryCode: banxaTx.country,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: inputCurrency,
    depositAmount: inputAmount,
    direction,
    exchangeType: 'fiat',
    paymentType,
    payoutTxid: undefined,
    payoutAddress,
    payoutCurrency: outputCurrency,
    payoutAmount: outputAmount,
    timestamp,
    updateTime: new Date(),
    isoDate,
    usdValue: -1,
    rawTx
  }

  return standardTx
}

function getFiatPaymentType(tx: BanxaTx): FiatPaymentType {
  switch (tx.payment_type) {
    case 'AusPost Retail':
      return 'auspost'
    case 'BPay':
      return 'bpay'
    case 'Blueshyft Online':
      return 'blueshyft'
    case 'POLi Transfer':
      return 'poli'
    case 'Sofort Transfer':
      return 'sofort'
    case 'Checkout Credit Card':
    case 'WorldPay Credit Card':
      return 'credit'
    case 'ClearJunction Fast Pay':
    case 'ClearJunction Sell Fast Pay':
      return 'fasterpayments'
    case 'ClearJunction Sepa':
    case 'Ten31 Sepa':
      return 'sepa'
    case 'DCBank Interac':
    case 'DCBank Interac Sell':
      return 'interac'
    case 'Enumis Transfer':
      return 'fasterpayments'
    case 'Monoova Sell':
      return 'banktransfer'
    case 'NPP PayID':
    case 'PayID via Monoova':
      return 'payid'
    case 'WorldPay ApplePay':
      return 'applepay'
    case 'WorldPay GooglePay':
      return 'googlepay'
    case 'iDEAL Transfer':
      return 'ideal'
    default:
      throw new Error(`Unknown payment method: ${tx.payment_type} for ${tx.id}`)
  }
}
