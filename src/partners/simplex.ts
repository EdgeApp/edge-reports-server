import axios from 'axios'
import {
  asArray,
  asBoolean,
  asEither,
  asNull,
  asNumber,
  asObject,
  asString,
  asUnknown
} from 'cleaners'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asSimplexTx = asObject({
  amount_usd: asString,
  amount_crypto: asString,
  fiat_total_amount: asString,
  created_at: asNumber,
  order_id: asString,
  crypto_currency: asString,
  currency: asString
})

const asSimplexResult = asObject({
  data: asObject({
    data: asArray(asUnknown),
    next_page_cursor: asEither(asString, asNull),
    has_more_pages: asBoolean
  })
})

const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days
const LIMIT = 100

export async function querySimplex(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  let lastTimestamp = 0
  if (typeof pluginParams.settings.lastTimestamp === 'number') {
    lastTimestamp = pluginParams.settings.lastTimestamp
  }
  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: { lastTimestamp: lastTimestamp },
      transactions: []
    }
  }

  lastTimestamp -= QUERY_LOOKBACK
  let continueFromSyntax = ''
  let nextPageCursor = ''
  let done = false
  let newestTimestamp = 0
  let retry = 3

  while (!done) {
    if (nextPageCursor !== '')
      continueFromSyntax = `continue_from=${nextPageCursor}&`
    const url = `https://turnkey.api.simplex.com/transactions?${continueFromSyntax}limit=${LIMIT}&starting_at=0`
    const csvData = asSimplexResult(
      await axios({
        url,
        headers: {
          'X-API-KEY': apiKey
        }
      }).catch(e => {
        retry--
        if (retry === 0) {
          throw e
        }
        return {
          data: {
            data: undefined,
            next_page_cursor: undefined,
            has_more_pages: true
          }
        }
      })
    )

    // 3 attempts to requery before throwing error
    if (typeof csvData.data.data === 'undefined') {
      continue
    }

    const txs = csvData.data.data
    for (const rawtx of txs) {
      const tx = asSimplexTx(rawtx)
      const timestamp = tx.created_at
      const ssTx = {
        status: 'complete',
        orderId: tx.order_id,
        depositTxid: undefined,
        depositAddress: undefined,
        depositCurrency: tx.currency,
        depositAmount: parseFloat(tx.fiat_total_amount),
        payoutTxid: undefined,
        payoutAddress: undefined,
        payoutCurrency: tx.crypto_currency,
        payoutAmount: parseFloat(tx.amount_crypto),
        timestamp,
        isoDate: new Date(timestamp * 1000).toISOString(),
        usdValue: parseFloat(tx.amount_usd),
        rawTx: rawtx
      }
      ssFormatTxs.push(ssTx)

      newestTimestamp =
        timestamp > newestTimestamp ? timestamp : newestTimestamp
      if (lastTimestamp > timestamp) {
        done = true
      }
    }

    if (csvData.data.has_more_pages === false) {
      break
    }
    nextPageCursor = asString(csvData.data.next_page_cursor)
  }

  const out: PluginResult = {
    settings: { lastTimestamp: newestTimestamp },
    transactions: ssFormatTxs
  }
  return out
}

export const simplex: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: querySimplex,
  // results in a PluginResult
  pluginName: 'Simplex',
  pluginId: 'simplex'
}
