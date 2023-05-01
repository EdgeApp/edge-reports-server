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
  uid: asString,
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
    try {
      const reply = await response.json()
      const jsonObj = asSwapuzResult(reply)
      const { currentPage, maxPage, result: txs } = jsonObj.result
      for (const rawTx of txs) {
        const { uid, status: statusNum, dTxId, wTxId } = asSwapuzRawTx(rawTx)

        // Status === 6 seems to be the "complete" status
        let status: Status = 'other'
        if (statusNum === 6 && dTxId != null && wTxId != null) {
          status = 'complete'
        }

        const { amount, amountResult, createDate, from, to } = asSwapuzTx(rawTx)
        const d = createDate.endsWith('Z') ? createDate : createDate + 'Z'
        const date = new Date(d)
        const timestamp = date.getTime() / 1000

        const ssTx: StandardTx = {
          status,
          orderId: uid,
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
