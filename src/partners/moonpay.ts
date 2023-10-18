import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asMoonpayCurrency = asObject({
  id: asString,
  type: asString,
  name: asString,
  code: asString
})

const asMoonpayTx = asObject({
  cryptoTransactionId: asString,
  baseCurrencyAmount: asNumber,
  walletAddress: asString,
  quoteCurrencyAmount: asNumber,
  createdAt: asString,
  id: asString,
  baseCurrencyId: asString,
  currencyId: asString,
  currency: asMoonpayCurrency,
  baseCurrency: asMoonpayCurrency
})

type MoonpayTx = ReturnType<typeof asMoonpayTx>

const asMoonpayRawTx = asObject({
  status: asString
})

const asMoonpayResult = asArray(asUnknown)

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5
const PER_REQUEST_LIMIT = 50

export async function queryMoonpay(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  let headers
  let latestTimestamp = 0
  if (typeof pluginParams.settings.latestTimestamp === 'number') {
    latestTimestamp = pluginParams.settings.latestTimestamp
  }

  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
    headers = {
      Authorization: `Api-Key ${apiKey}`
    }
  } else {
    return {
      settings: { latestTimestamp: latestTimestamp },
      transactions: []
    }
  }

  if (latestTimestamp > QUERY_LOOKBACK) {
    latestTimestamp -= QUERY_LOOKBACK
  }
  let done = false
  let offset = 0
  let newestTimestamp = latestTimestamp
  while (!done) {
    const url = `https://api.moonpay.io/v1/transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}`
    const result = await fetch(url, {
      method: 'GET',
      headers
    })
    const txs = asMoonpayResult(await result.json())
    // cryptoTransactionId is a duplicate among other transactions sometimes
    // in bulk update it throws an error for document update conflict because of this.

    for (const rawtx of txs) {
      if (asMoonpayRawTx(rawtx).status === 'completed') {
        let tx: MoonpayTx
        try {
          tx = asMoonpayTx(rawtx)
        } catch (e) {
          datelog(e)
          datelog(rawtx)
          throw e
        }

        const date = new Date(tx.createdAt)
        const timestamp = date.getTime()
        const ssTx: StandardTx = {
          status: 'complete',
          orderId: tx.id,
          depositTxid: undefined,
          depositAddress: undefined,
          depositCurrency: tx.baseCurrency.code.toUpperCase(),
          depositAmount: tx.baseCurrencyAmount,
          payoutTxid: tx.cryptoTransactionId,
          payoutAddress: tx.walletAddress,
          payoutCurrency: tx.currency.code.toUpperCase(),
          payoutAmount: tx.quoteCurrencyAmount,
          timestamp: timestamp / 1000,
          isoDate: tx.createdAt,
          usdValue: -1,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
        done = latestTimestamp > timestamp || txs.length < PER_REQUEST_LIMIT
        newestTimestamp =
          newestTimestamp > timestamp ? newestTimestamp : timestamp
      }
    }

    offset += PER_REQUEST_LIMIT
  }

  const out: PluginResult = {
    settings: { latestTimestamp: newestTimestamp },
    transactions: ssFormatTxs
  }
  return out
}

export const moonpay: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryMoonpay,
  // results in a PluginResult
  pluginName: 'Moonpay',
  pluginId: 'moonpay'
}
