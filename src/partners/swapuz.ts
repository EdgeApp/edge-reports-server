import {
  asArray,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'
import { datelog, retryFetch } from '../util'

const asSwapuzLogin = asObject({
  result: asObject({
    token: asString
  })
})

const asSwapuzTx = asObject({
  createDate: asString,
  from: asString,
  to: asString,
  amountResult: asNumber,
  amount: asNumber,
  amountBTC: asNumber,
  startAmount: asNumber
})

const asSwapuzRawTx = asObject({
  id: asNumber,
  status: asNumber,
  wTxId: asOptional(asString),
  dTxId: asOptional(asString)
})

const asSwapuzResult = asObject({
  result: asObject({
    currentPage: asNumber,
    maxPage: asNumber,
    result: asArray(asUnknown)
  }),
  status: asNumber
})

const asSwapuzPluginParams = asObject({
  apiKeys: asObject({ login: asString, password: asString }),
  settings: asObject({
    latestIsoDate: asOptional(asString, '1970-01-01T00:00:00.000Z')
  })
})

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

export const querySwapuz = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const ssFormatTxs: StandardTx[] = []

  const { settings, apiKeys } = asSwapuzPluginParams(pluginParams)
  const { login, password } = apiKeys

  // Get our Bearer token
  const response = await fetch('https://api.swapuz.com/api/User/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      login,
      password
    })
  })
  if (response.ok === false) {
    const text = await response.text()
    throw new Error(text)
  }
  const reply = await response.json()
  const loginReply = asSwapuzLogin(reply)

  const bearerToken = loginReply.result.token

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearerToken}`
  }

  let { latestIsoDate } = settings

  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let page = -1
  let done = false
  let oldestIsoDate = new Date(99999999999999).toISOString()

  while (!done) {
    page++
    const url = `https://api.swapuz.com/api/partner/partnerPaginator?page=${page}`
    const response = await retryFetch(url, {
      method: 'GET',
      headers
    })
    if (response.ok === false) {
      const text = await response.text()
      throw new Error(text)
    }
    const reply = await response.json()
    const jsonObj = asSwapuzResult(reply)
    const { currentPage, maxPage, result: txs } = jsonObj.result
    for (const rawTx of txs) {
      const { id, status, dTxId, wTxId } = asSwapuzRawTx(rawTx)

      // Status === 6 seems to be the "complete" status
      if (status === 6) {
        if (dTxId == null) {
          continue
        }
        if (wTxId == null) {
          continue
        }
        const { amount, amountResult, createDate, from, to } = asSwapuzTx(rawTx)
        const date = new Date(createDate)
        const timestamp = date.getTime() / 1000

        const ssTx: StandardTx = {
          status: 'complete',
          orderId: id.toString(),
          depositTxid: dTxId,
          depositCurrency: from.toUpperCase(),
          depositAddress: undefined,
          depositAmount: amount,
          payoutTxid: wTxId,
          payoutCurrency: to.toUpperCase(),
          payoutAddress: undefined,
          payoutAmount: amountResult,
          timestamp,
          isoDate: date.toISOString(),
          usdValue: undefined,
          rawTx
        }
        ssFormatTxs.push(ssTx)
        if (ssTx.isoDate > latestIsoDate) {
          latestIsoDate = ssTx.isoDate
        }
        if (ssTx.isoDate < oldestIsoDate) {
          oldestIsoDate = ssTx.isoDate
        }
        if (ssTx.isoDate < previousLatestIsoDate && !done) {
          datelog(
            `Swapuz done: date ${ssTx.isoDate} < ${previousLatestIsoDate}`
          )
          done = true
        }
      }
    }
    // console.log(
    //   `Swapuz page=${page}/${maxPage} oldestIsoDate: ${oldestIsoDate}`
    // )

    if (currentPage >= maxPage) {
      break
    }
  }
  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: ssFormatTxs
  }
  return out
}

export const swapuz: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: querySwapuz,
  // results in a PluginResult
  pluginName: 'Swapuz',
  pluginId: 'swapuz'
}
