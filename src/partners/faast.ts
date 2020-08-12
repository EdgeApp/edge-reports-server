import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import crypto from 'crypto'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asFaastTx = asObject({
  status: asString,
  transaction_id: asString,
  deposit_address: asString,
  deposit_currency: asString,
  amount_deposited: asNumber,
  withdrawal_address: asString,
  withdrawal_currency: asString,
  amount_withdrawn: asNumber,
  updated_at: asString
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
  const url = `https://api.faa.st/api/v2/public/affiliate/swaps?limit=${PAGE_LIMIT}&page=${page}`
  const headers = {
    'affiliate-id': `${pluginParams.apiKeys.faastAffiliateId}`,
    nonce,
    signature
  }
  let newLatestTimeStamp = latestTimeStamp
  let done = false
  while (!done) {
    let jsonObj: ReturnType<typeof asFaastResult>
    let resultJSON
    try {
      const result = await fetch(url, { method: 'GET', headers: headers })
      resultJSON = await result.json()
      jsonObj = asFaastResult(resultJSON)
    } catch (e) {
      console.log(e)
      throw e
    }
    const txs = jsonObj.orders
    for (const rawtx of txs) {
      let tx
      try {
        tx = asFaastTx(rawtx)
      } catch (e) {
        console.log(e)
        throw e
      }
      if (tx.status === 'complete') {
        const date = new Date(tx.updated_at)
        const timestamp = date.getTime() / 1000
        const ssTx: StandardTx = {
          status: 'complete',
          inputTXID: tx.transaction_id,
          inputAddress: tx.deposit_address,
          inputCurrency: tx.deposit_currency.toUpperCase(),
          inputAmount: tx.amount_deposited,
          outputAddress: tx.withdrawal_address,
          outputCurrency: tx.withdrawal_currency.toUpperCase(),
          outputAmount: tx.amount_withdrawn,
          timestamp,
          isoDate: tx.updated_at,
          usdValue: null
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
