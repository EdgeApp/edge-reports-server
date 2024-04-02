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

const asBanxaTx = asObject({
  id: asString,
  status: asBanxaStatus,
  created_at: asString,
  fiat_amount: asNumber,
  fiat_code: asString,
  coin_amount: asNumber,
  coin_code: asString,
  order_type: asString,
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

type BanxaTx = ReturnType<typeof asBanxaTx>
type BanxaStatus = ReturnType<typeof asBanxaStatus>

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

function processBanxaOrders(rawtxs, ssFormatTxs): void {
  let numComplete = 0
  let newestIsoDate = new Date(0).toISOString()
  let oldestIsoDate = new Date(9999999999999).toISOString()
  for (const rawTx of rawtxs) {
    let tx: BanxaTx
    try {
      tx = asBanxaTx(rawTx)
    } catch (e) {
      datelog(String(e))
      throw e
    }
    if (tx.status === 'complete') {
      numComplete++
    }
    const { isoDate, timestamp } = smartIsoDateFromTimestamp(tx.created_at)

    if (isoDate > newestIsoDate) {
      newestIsoDate = isoDate
    }
    if (isoDate < oldestIsoDate) {
      oldestIsoDate = isoDate
    }
    // Flip the amounts if the order is a SELL
    let payoutAddress
    let inputAmount = tx.fiat_amount
    let inputCurrency = tx.fiat_code
    let outputAmount = tx.coin_amount
    let outputCurrency = tx.coin_code
    if (tx.order_type === 'CRYPTO-SELL') {
      inputAmount = tx.coin_amount
      inputCurrency = tx.coin_code
      outputAmount = tx.fiat_amount
      outputCurrency = tx.fiat_code
    } else {
      payoutAddress = tx.wallet_address
    }

    const ssTx: StandardTx = {
      status: statusMap[tx.status],
      orderId: tx.id,
      depositTxid: undefined,
      depositAddress: undefined,
      depositCurrency: inputCurrency,
      depositAmount: inputAmount,
      payoutTxid: undefined,
      payoutAddress,
      payoutCurrency: outputCurrency,
      payoutAmount: outputAmount,
      timestamp,
      isoDate,
      usdValue: -1,
      rawTx
    }
    ssFormatTxs.push(ssTx)
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
