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
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp } from '../util'

const asSwapuzLogin = asObject({
  result: asObject({
    token: asString
  })
})

const asSwapuzTx = asObject({
  uid: asString,
  status: asNumber,
  wTxId: asOptional(asString),
  dTxId: asOptional(asString),
  withdrawalTransactionID: asOptional(asString),
  depositTransactionID: asOptional(asString),
  createDate: asString,
  from: asString,
  to: asString,
  depositAddress: asString,
  amountResult: asNumber,
  amount: asNumber,
  amountBTC: asNumber,
  startAmount: asNumber
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
  const standardTxs: StandardTx[] = []

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
  if (!response.ok) {
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
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text)
    }
    try {
      const reply = await response.json()
      const jsonObj = asSwapuzResult(reply)
      const { currentPage, maxPage, result: txs } = jsonObj.result
      for (const rawTx of txs) {
        const standardTx = processSwapuzTx(rawTx)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < oldestIsoDate) {
          oldestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < previousLatestIsoDate && !done) {
          datelog(
            `Swapuz done: date ${standardTx.isoDate} < ${previousLatestIsoDate}`
          )
          done = true
        }
      }
      datelog(`Swapuz page=${page}/${maxPage} oldestIsoDate: ${oldestIsoDate}`)

      if (currentPage >= maxPage) {
        break
      }
    } catch (e) {
      const err: any = e
      datelog(err.message)
      throw e
    }
  }
  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
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

export function processSwapuzTx(rawTx: unknown): StandardTx {
  const tx = asSwapuzTx(rawTx)

  // Status === 6 seems to be the "complete" status
  let status: Status = 'other'
  if (tx.status === 6) {
    status = 'complete'
  }

  const { isoDate, timestamp } = smartIsoDateFromTimestamp(tx.createDate)

  const standardTx: StandardTx = {
    status,
    orderId: tx.uid,
    depositTxid: tx.dTxId ?? tx.depositTransactionID,
    depositCurrency: tx.from.toUpperCase(),
    depositAddress: tx.depositAddress,
    depositAmount: tx.amount,
    payoutTxid: tx.wTxId ?? tx.withdrawalTransactionID,
    payoutCurrency: tx.to.toUpperCase(),
    payoutAddress: undefined,
    payoutAmount: tx.amountResult,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}
