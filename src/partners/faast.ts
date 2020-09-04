import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import crypto from 'crypto'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asFaastTx = asObject({
  swap_id: asString,
  order_id: asString,
  transaction_id: asString,
  deposit_address: asString,
  deposit_currency: asString,
  amount_deposited: asNumber,
  withdrawal_address: asString,
  withdrawal_currency: asString,
  amount_withdrawn: asNumber,
  created_at: asString
})

const asRawFaastTx = asObject({
  status: asString
})

const asFaastResult = asObject({
  orders: asArray(asUnknown)
})

const PAGE_LIMIT = 50
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

export async function queryFaast(
  pluginParams: PluginParams
): Promise<PluginResult> {
  let page = 1
  const ssFormatTxs: StandardTx[] = []
  let signature = ''
  let latestTimeStamp = 0
  if (typeof pluginParams.settings.latestTimeStamp === 'number') {
    latestTimeStamp = pluginParams.settings.latestTimeStamp
  }
  const nonce = String(Date.now())
  if (typeof pluginParams.apiKeys.faastSecret === 'string') {
    signature = crypto
      .createHmac('sha256', pluginParams.apiKeys.faastSecret)
      .update(nonce)
      .digest('hex')
  } else {
    return {
      settings: {
        latestTimeStamp: latestTimeStamp
      },
      transactions: []
    }
  }
  let newLatestTimeStamp = latestTimeStamp
  let done = false
  while (!done) {
    const url = `https://api.faa.st/api/v2/public/affiliate/swaps?limit=${PAGE_LIMIT}&page=${page}`
    const headers = {
      'affiliate-id': `${pluginParams.apiKeys.faastAffiliateId}`,
      nonce,
      signature
    }
    let jsonObj: ReturnType<typeof asFaastResult>
    let resultJSON
    try {
      const result = await fetch(url, { method: 'GET', headers: headers })
      resultJSON = await result.json()
      jsonObj = asFaastResult(resultJSON)
    } catch (e) {
      datelog(e)
      throw e
    }
    const txs = jsonObj.orders
    for (const rawtx of txs) {
      if (asRawFaastTx(rawtx).status === 'complete') {
        const tx = asFaastTx(rawtx)
        const date = new Date(tx.created_at)
        const timestamp = date.getTime() / 1000
        const ssTx: StandardTx = {
          status: 'complete',
          orderId: tx.swap_id,
          depositTxid: undefined,
          depositAddress: tx.deposit_address,
          depositCurrency: tx.deposit_currency.toUpperCase(),
          depositAmount: tx.amount_deposited,
          payoutTxid: tx.transaction_id,
          payoutAddress: tx.withdrawal_address,
          payoutCurrency: tx.withdrawal_currency.toUpperCase(),
          payoutAmount: tx.amount_withdrawn,
          timestamp,
          isoDate: tx.created_at,
          usdValue: undefined,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
        if (timestamp > newLatestTimeStamp) {
          newLatestTimeStamp = timestamp
        }
        if (timestamp < latestTimeStamp - QUERY_LOOKBACK) {
          done = true
        }
      }
    }
    if (txs.length < PAGE_LIMIT) {
      break
    }
    page++
  }
  const out: PluginResult = {
    settings: { latestTimeStamp: newLatestTimeStamp },
    transactions: ssFormatTxs
  }
  return out
}

export const faast: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryFaast,
  // results in a PluginResult
  pluginName: 'Faast',
  pluginId: 'faast'
}
