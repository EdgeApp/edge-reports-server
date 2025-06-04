import { asArray, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog, safeParseFloat } from '../util'

const asBityTx = asObject({
  id: asString,
  customer_trading_fee: asObject,
  input: asObject({ currency: asString, amount: asString }),
  output: asObject({ currency: asString, amount: asString }),
  partner_fee: asObject,
  profit_sharing: asObject,
  'non-verified_fee': asObject,
  timestamp_created: asString,
  timestamp_executed: asString
})

const asBityResult = asArray(asUnknown)
const BITY_TOKEN_URL = 'https://connect.bity.com/oauth2/token'
const BITY_API_URL =
  'https://reporting.api.bity.com/exchange/v1/summary/monthly/'
const PAGE_SIZE = 100

export async function queryBity(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []
  let tokenParams
  let credentials
  let authToken

  let queryYear = '2020'
  let queryMonth = '01'

  if (typeof pluginParams.settings.lastCheckedYear === 'string') {
    queryYear = pluginParams.settings.lastCheckedYear
  }
  if (typeof pluginParams.settings.lastCheckedMonth === 'string') {
    queryMonth = pluginParams.settings.lastCheckedMonth
  }

  if (
    typeof pluginParams.apiKeys.clientId === 'string' &&
    typeof pluginParams.apiKeys.clientSecret === 'string'
  ) {
    credentials = {
      grant_type: 'client_credentials',
      scope: 'https://auth.bity.com/scopes/reporting.exchange',
      client_id: pluginParams.apiKeys.clientId,
      client_secret: pluginParams.apiKeys.clientSecret
    }

    tokenParams = Object.keys(credentials)
      .map(key => {
        return (
          encodeURIComponent(key) + '=' + encodeURIComponent(credentials[key])
        )
      })
      .join('&')

    const tokenResponse = await fetch(BITY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams
    })
    const tokenReply = await tokenResponse.json()
    authToken = tokenReply.access_token
  } else {
    return {
      settings: { lastCheckedMonth: queryMonth, lastCheckedYear: queryYear },
      transactions: []
    }
  }

  let beforeCurrentMonth = true
  const currentDate = new Date(Date.now())
  let currentMonth = (currentDate.getMonth() + 1).toString()
  currentMonth = currentMonth.length === 1 ? `0${currentMonth}` : currentMonth
  let currentYear = currentDate.getFullYear().toString()
  while (beforeCurrentMonth) {
    if (queryMonth === currentMonth && queryYear === currentYear) {
      beforeCurrentMonth = false
    }
    let moreCurrentMonthsTransactions = true
    let page = 1
    while (moreCurrentMonthsTransactions) {
      let monthlyTxs

      try {
        const monthlyResponse = await fetch(
          `${BITY_API_URL}${queryYear}-${queryMonth}/orders?page=${page}`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${authToken}` }
          }
        )

        // june 2020 has exactly 300 transactions and it gives
        // status: 404
        // statusText: "Not Found"
        // on page 4
        if (monthlyResponse.ok) {
          monthlyTxs = asBityResult(await monthlyResponse.json())
        } else if (
          monthlyResponse.status === 404 &&
          monthlyResponse.statusText === 'Not Found'
        ) {
          break
        }
      } catch (e) {
        datelog(e)
        throw e
      }

      for (const rawTx of monthlyTxs) {
        const standardTx = processBityTx(rawTx)
        standardTxs.push(standardTx)
      }
      moreCurrentMonthsTransactions = monthlyTxs.length === PAGE_SIZE
      page++
    }

    queryMonth = (parseInt(queryMonth) + 1).toString()

    queryMonth = queryMonth.length === 1 ? `0${queryMonth}` : queryMonth

    if (queryMonth === '13') {
      queryMonth = '01'
      queryYear = (parseInt(queryYear) + 1).toString()
    }
  }

  currentMonth = (parseInt(currentMonth) - 1).toString()

  currentMonth = currentMonth.length === 1 ? `0${currentMonth}` : currentMonth
  if (currentMonth === '00') {
    currentMonth = '12'
    currentYear = (parseInt(currentYear) - 1).toString()
  }

  return {
    settings: { lastCheckedMonth: currentMonth, lastCheckedYear: currentYear },
    transactions: standardTxs
  }
}

export const bity: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryBity,
  // results in a PluginResult
  pluginName: 'Bity',
  pluginId: 'bity'
}

export function processBityTx(rawTx: unknown): StandardTx {
  const tx = asBityTx(rawTx)

  // Assume that one currency is EUR and that's the only fiat currency supported
  // by Bity.
  if (
    tx.input.currency.toUpperCase() !== 'EUR' &&
    tx.output.currency.toUpperCase() !== 'EUR'
  ) {
    throw new Error(
      `Unknown fiat currency ${tx.input.currency} or ${tx.output.currency}`
    )
  }
  const direction = tx.input.currency.toUpperCase() === 'EUR' ? 'buy' : 'sell'

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,
    countryCode: null,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: tx.input.currency.toUpperCase(),
    depositAmount: safeParseFloat(tx.input.amount),
    direction,
    exchangeType: 'fiat',
    paymentType: 'sepa',
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency: tx.output.currency.toUpperCase(),
    payoutAmount: safeParseFloat(tx.output.amount),
    timestamp: Date.parse(tx.timestamp_created.concat('Z')) / 1000,
    updateTime: new Date(),
    isoDate: new Date(tx.timestamp_created.concat('Z')).toISOString(),
    usdValue: -1,
    rawTx
  }

  return standardTx
}
