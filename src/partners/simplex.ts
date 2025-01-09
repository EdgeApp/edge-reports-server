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
import { safeParseFloat } from '../util'

const asSimplexTx = asObject({
  amount_usd: asString,
  amount_crypto: asString,
  fiat_total_amount: asString,
  created_at: asNumber,
  order_id: asString,
  crypto_currency: asString,
  currency: asString
})

const asPreSimpleTx = asObject({
  created_at: asNumber
})

const asRawSimplexTx = asObject({
  status_name: asString
})

const asSimplexResult = asObject({
  data: asObject({
    data: asArray(asUnknown),
    next_page_cursor: asEither(asString, asNull),
    has_more_pages: asBoolean
  })
})

const API_START_DATE = new Date('2020-08-10T00:00:00.000Z').getTime() / 1000
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days
const LIMIT = 100

export async function querySimplex(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []
  let apiKey
  let lastTimestamp = API_START_DATE
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
  if (lastTimestamp < API_START_DATE) {
    lastTimestamp = API_START_DATE
  }
  let continueFromSyntax = ''
  let nextPageCursor = ''
  let newestTimestamp = 0
  let done = false
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
    for (const rawTx of txs) {
      if (asRawSimplexTx(rawTx).status_name === 'approved') {
        const preTx = asPreSimpleTx(rawTx)
        if (lastTimestamp > preTx.created_at) {
          done = true
          break
        }
        const standardTx = processSimplexTx(rawTx)
        standardTxs.push(standardTx)
        if (standardTx.timestamp > newestTimestamp) {
          newestTimestamp = standardTx.timestamp
        }
      }
    }

    if (!csvData.data.has_more_pages) {
      break
    }
    nextPageCursor = asString(csvData.data.next_page_cursor)
  }

  const out: PluginResult = {
    settings: { lastTimestamp: newestTimestamp },
    transactions: standardTxs
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

export function processSimplexTx(rawTx: unknown): StandardTx {
  const tx = asSimplexTx(rawTx)
  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.order_id,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: tx.currency,
    depositAmount: safeParseFloat(tx.fiat_total_amount),
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency: tx.crypto_currency,
    payoutAmount: safeParseFloat(tx.amount_crypto),
    timestamp: tx.created_at,
    isoDate: new Date(tx.created_at * 1000).toISOString(),
    usdValue: safeParseFloat(tx.amount_usd),
    rawTx
  }
  return standardTx
}
