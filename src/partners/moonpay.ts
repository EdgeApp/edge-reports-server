import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asCurrencies = asArray(
  asObject({
    id: asString,
    code: asString
  })
)

const asMoonpayTx = asObject({
  cryptoTransactionId: asString,
  baseCurrencyAmount: asNumber,
  walletAddress: asString,
  quoteCurrencyAmount: asNumber,
  createdAt: asString,
  id: asString,
  baseCurrencyId: asString,
  currencyId: asString
})

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
  let currencies
  let latestTimestamp = 0
  if (typeof pluginParams.settings.latestTimestamp === 'number') {
    latestTimestamp = pluginParams.settings.latestTimestamp
  }

  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
    try {
      const currenciesUrl = 'https://api.moonpay.io/v2/currencies'
      const currenciesResult = await fetch(currenciesUrl)
      currencies = asCurrencies(await currenciesResult.json())
      headers = {
        Authorization: `Api-Key ${apiKey}`
      }
    } catch (e) {
      console.log(e)
      throw e
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
        const tx = asMoonpayTx(rawtx)

        const baseCurrency = currencies.find(
          cur => cur.id === tx.baseCurrencyId
        )
        const outputCurrency = currencies.find(cur => cur.id === tx.currencyId)

        if (typeof baseCurrency === 'undefined') {
          throw new Error(
            `baseCurrency not defined for Moonpay tx ID: ${tx.id}`
          )
        }
        if (typeof outputCurrency === 'undefined') {
          throw new Error(
            `outputCurrency not defined for Moonpay tx ID: ${tx.id}`
          )
        }

        const date = new Date(tx.createdAt)
        const timestamp = date.getTime()
        const ssTx = {
          status: 'complete',
          inputTXID: tx.id,
          inputAddress: '',
          inputCurrency: baseCurrency.code.toUpperCase(),
          inputAmount: tx.baseCurrencyAmount,
          outputAddress: tx.walletAddress,
          outputCurrency: outputCurrency.code.toUpperCase(),
          outputAmount: tx.quoteCurrencyAmount,
          timestamp: timestamp / 1000,
          isoDate: date.toISOString()
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
