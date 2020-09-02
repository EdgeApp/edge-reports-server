import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import { datelog } from '../queryEngine'
import crypto from 'crypto'
import fetch from 'node-fetch'
import { snooze } from '../util'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asBanxaTx = asObject({
  created_at: asString,
  fiat_amount: asNumber,
  fiat_code: asString,
  coin_amount: asNumber,
  coin_code: asString,
  order_type: asString,
  ref: asNumber,
  wallet_address: asString
})

const asBanxaResult = asObject({
  data: asObject({
    orders: asArray(asUnknown)
  })
})

const asRawBanxaTx = asObject({
  status: asString
})

const MAX_ATTEMPTS = 5
const PAGE_LIMIT = 100
const ROLLBACK = 1000 * 60 * 60 * 24 * 7 // 7 days
const MONTH_MAP = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12'
}

export async function queryBanxa(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  const lastCheckedDate =
    typeof pluginParams.settings.lastCheckedDate === 'string'
      ? pluginParams.settings.lastCheckedDate
      : '2019-08-26'
  if (typeof pluginParams.apiKeys.banxaToken === 'string') {
    apiKey = pluginParams.apiKeys.banxaToken
  } else {
    return {
      settings: { lastCheckedDate },
      transactions: []
    }
  }

  const today = new Date(Date.now()).toISOString().slice(0, 10)
  let currentQuery = new Date(new Date(lastCheckedDate).getTime() - ROLLBACK)
    .toISOString()
    .slice(0, 10)

  while (currentQuery !== today) {
    let page = 1
    let attempt = 1
    while (true) {
      datelog(
        `BANXA: Calling API with date ${currentQuery}, result size ${PAGE_LIMIT} and offset ${page} for attempt ${attempt}`
      )
      const apiResponse = await callBanxaAPI(
        currentQuery,
        PAGE_LIMIT,
        page,
        apiKey
      )
      const status = await apiResponse.status

      // Handle the situation where the API is rate limiting the requests
      if (status !== 200) {
        const delay = 2000 * attempt
        datelog(
          `BANXA: Response code ${status}. Retrying after ${delay} second snooze...`
        )
        snooze(delay)
        attempt++
        if (attempt === MAX_ATTEMPTS) {
          break
        }
        continue
      }

      const jsonObj = asBanxaResult(await apiResponse.json())
      const txs = jsonObj.data.orders
      processBanxaOrders(txs, ssFormatTxs)

      if (txs.length < PAGE_LIMIT) {
        break
      }
      page++
    }
    if (attempt === MAX_ATTEMPTS) {
      datelog(`BANXA: Retry Limit reached for date ${currentQuery}.`)
      break
    }
    currentQuery = new Date(new Date(currentQuery).getTime() + 86400000)
      .toISOString()
      .slice(0, 10)
  }

  const out: PluginResult = {
    settings: { lastCheckedDate: currentQuery },
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

function callBanxaAPI(
  queryDate: string,
  pageLimit: number,
  page: number,
  apiKey: string
): any {
  const nonce = Math.floor(new Date().getTime() / 1000)

  const apiQuery = `/api/orders?start_date=${queryDate}&end_date=${queryDate}&per_page=${pageLimit}&page=${page}`

  const text = `GET\n${apiQuery}\n${nonce}`
  const secret = apiKey
  const key = 'EDGE'
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(text)
    .digest('hex')
  const authHeader = `${key}:${hmac}:${nonce}`

  const headers = {
    Authorization: 'Bearer ' + authHeader,
    'Content-Type': 'application/json'
  }

  return fetch(`https://edge.banxa.com${apiQuery}`, { headers: headers })
}

function processBanxaOrders(rawtxs, ssFormatTxs): void {
  for (const rawTx of rawtxs) {
    if (asRawBanxaTx(rawTx).status === 'complete') {
      const tx = asBanxaTx(rawTx)
      // Reformat the date from DD-MMM-YYYY HH:MM:SS to YYYY-MM-DDTHH:MM:SS
      const origDateTime = tx.created_at
      const dateTimeParts = origDateTime.split(' ')
      const dateParts = dateTimeParts[0].split('-')
      const month = MONTH_MAP[dateParts[1]]
      const reformattedDate = `${dateParts[2]}-${month}-${dateParts[0]}T${dateTimeParts[1]}Z`

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
        status: 'complete',
        orderId: tx.ref.toString(),
        depositTxid: undefined,
        depositAddress: undefined,
        depositCurrency: inputCurrency,
        depositAmount: inputAmount,
        payoutTxid: undefined,
        payoutAddress,
        payoutCurrency: outputCurrency,
        payoutAmount: outputAmount,
        timestamp: new Date(reformattedDate).getTime() / 1000,
        isoDate: reformattedDate,
        usdValue: undefined,
        rawTx
      }
      ssFormatTxs.push(ssTx)
    }
  }
}
