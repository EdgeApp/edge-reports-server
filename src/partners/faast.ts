import { asArray, asNumber, asObject, asString } from 'cleaners'
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
  orders: asArray(asFaastTx)
})

const PAGE_LIMIT = 50
const SS_QUERY_PAGES = 3

export async function queryFaast(
  pluginParams: PluginParams
): Promise<PluginResult> {
  let page = 1
  const ssFormatTxs: StandardTx[] = []
  let signature = ''
  const nonce = String(Date.now())
  if (typeof pluginParams.apiKeys.faastSecret === 'string') {
    signature = crypto
      .createHmac('sha256', pluginParams.apiKeys.faastSecret)
      .update(nonce)
      .digest('hex')
  } else {
    return {
      settings: {},
      transactions: []
    }
  }
  const url = `https://api.faa.st/api/v2/public/affiliate/swaps?limit=${PAGE_LIMIT}&page=${page}`
  const headers = {
    'affiliate-id': `${pluginParams.apiKeys.faastAffiliateId}`,
    nonce,
    signature
  }
  while (true) {
    let jsonObj: ReturnType<typeof asFaastResult>
    try {
      const result = await fetch(url, { method: 'GET', headers: headers })
      jsonObj = asFaastResult(await result.json())
    } catch (e) {
      console.log(e)
      break
    }
    const txs = jsonObj.orders
    for (const tx of txs) {
      if (tx.status === 'complete') {
        const date = new Date(tx.updated_at)
        const timestamp = date.getTime() / 1000
        const ssTx: StandardTx = {
          status: 'complete',
          inputTXID: tx.transaction_id,
          inputAddress: tx.deposit_address,
          inputCurrency: tx.deposit_currency.toUpperCase(),
          inputAmount: tx.amount_deposited.toString(),
          outputAddress: tx.withdrawal_address,
          outputCurrency: tx.withdrawal_currency.toUpperCase(),
          outputAmount: tx.amount_withdrawn.toString(),
          timestamp,
          isoDate: tx.updated_at
        }
        ssFormatTxs.push(ssTx)
      }
    }
    if (txs.length < PAGE_LIMIT) {
      break
    }
    page++
    if (page > SS_QUERY_PAGES) {
      break
    }
  }
  const out: PluginResult = {
    settings: {},
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
