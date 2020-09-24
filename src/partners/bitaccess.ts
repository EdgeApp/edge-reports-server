import {
  asArray,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import crypto from 'crypto'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asBitaccessTx = asObject({
  transaction_id: asString,
  tx_hash: asOptional(asString),
  deposit_address: asString,
  deposit_currency: asString,
  deposit_amount: asNumber,
  withdrawal_address: asOptional(asString),
  withdrawal_currency: asString,
  withdrawal_amount: asNumber,
  updated_at: asString
})

const asBitaccessRawTx = asObject({
  status: asString
})

const asBitaccessResult = asObject({
  result: asArray(asUnknown)
})

const PAGE_LIMIT = 50
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

export async function queryBitaccess(
  pluginParams: PluginParams
): Promise<PluginResult> {
  let lastTimestamp = 0
  if (typeof pluginParams.settings.lastTimestamp === 'number') {
    lastTimestamp = pluginParams.settings.lastTimestamp
  }
  if (
    typeof pluginParams.apiKeys.affiliateId !== 'string' ||
    typeof pluginParams.apiKeys.apiKey !== 'string' ||
    typeof pluginParams.apiKeys.apiSecret !== 'string'
  ) {
    return {
      settings: { lastTimestamp },
      transactions: []
    }
  }

  const ssFormatTxs: StandardTx[] = []
  lastTimestamp -= QUERY_LOOKBACK
  let newestTimestamp = 0
  let page = 1
  let done = false
  while (!done) {
    const requestMethod = 'GET'
    const bodyHash = ''
    const contentType = 'application/json'
    const dateString = new Date().toISOString()
    const sigString = `${requestMethod}\n${bodyHash}\n${contentType}\n${dateString}`
    const signature = crypto
      .createHmac('sha256', pluginParams.apiKeys.apiSecret)
      .update(sigString, 'utf8')
      .digest('base64')
    const options = {
      method: requestMethod,
      headers: {
        Authorization: `HMAC ${pluginParams.apiKeys.apiKey}:${signature}`,
        'x-date': dateString,
        'Content-Type': contentType
      }
    }
    const url = `https://cashapi.bitaccessbtm.com/api/v1/affiliate/${pluginParams.apiKeys.affiliateId}/transactions?limit=${PAGE_LIMIT}&page=${page}`
    try {
      const response = await fetch(url, options)
      const result = asBitaccessResult(await response.json())
      const txs = result.result
      for (const rawTx of txs) {
        if (asBitaccessRawTx(rawTx).status === 'complete') {
          const tx = asBitaccessTx(rawTx)
          const timestamp = new Date(tx.updated_at).getTime() / 1000
          let depositTxid
          let payoutTxid
          if (typeof tx.deposit_address === 'string') {
            depositTxid = tx.tx_hash
          }
          if (typeof tx.withdrawal_address === 'string') {
            payoutTxid = tx.tx_hash
          }

          const ssTx: StandardTx = {
            status: 'complete',
            orderId: tx.transaction_id,
            depositTxid,
            depositAddress: tx.deposit_address,
            depositCurrency: tx.deposit_currency.toUpperCase(),
            depositAmount: tx.deposit_amount,
            payoutTxid,
            payoutAddress: tx.withdrawal_address,
            payoutCurrency: tx.withdrawal_currency.toUpperCase(),
            payoutAmount: tx.withdrawal_amount,
            timestamp,
            isoDate: tx.updated_at,
            usdValue: undefined,
            rawTx
          }
          ssFormatTxs.push(ssTx)
          if (timestamp > newestTimestamp) {
            newestTimestamp = timestamp
          }
          if (timestamp < lastTimestamp) {
            done = true
            break
          }
        }
      }
      if (txs.length < PAGE_LIMIT) {
        break
      }
      page++
    } catch (e) {
      datelog(e)
      throw e
    }
  }

  const out = {
    settings: { lastTimestamp: newestTimestamp },
    transactions: ssFormatTxs
  }
  return out
}

export const bitaccess: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryBitaccess,
  // results in a PluginResult
  pluginName: 'Bitaccess',
  pluginId: 'bitaccess'
}
