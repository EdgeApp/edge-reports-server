import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

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

const asMoonpayResult = asArray(
  asObject({
    status: asString,
    cryptoTransactionId: asUnknown,
    baseCurrencyAmount: asUnknown,
    walletAddress: asUnknown,
    quoteCurrencyAmount: asUnknown,
    createdAt: asUnknown,
    id: asUnknown,
    baseCurrencyId: asUnknown,
    currencyId: asUnknown
  })
)

const PER_REQUEST_LIMIT = 50

export async function queryMoonpay(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  let headers
  let currencies
  let latestTimestamp = Date.now() - 1000 * 60 * 60 * 24 * 5
  if (typeof pluginParams.settings.latestTimestamp === 'number') {
    latestTimestamp = pluginParams.settings.latestTimestamp
  }

  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
    try {
      const currenciesUrl = 'https://api.moonpay.io/v2/currencies'
      const currenciesResult = await fetch(currenciesUrl)
      currencies = await currenciesResult.json()
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

  let done = false
  let offset = 0
  let newestTimestamp = 0
  while (!done) {
    const url = `https://api.moonpay.io/v1/transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}`
    const result = await fetch(url, {
      method: 'GET',
      headers
    })
    const txs = asMoonpayResult(await result.json())

    for (const rawtx of txs) {
      let tx
      if (rawtx.status === 'completed') {
        tx = asMoonpayTx(rawtx)
        const baseCurrency = currencies.find(
          cur => cur.id === tx.baseCurrencyId
        )
        const outputCurrency = currencies.find(cur => cur.id === tx.currencyId)
        const baseCurrencyCode =
          typeof baseCurrency === 'object' &&
          typeof baseCurrency.code === 'string'
            ? baseCurrency.code.toUpperCase()
            : ''
        const outputCurrencyCode =
          typeof outputCurrency === 'object' &&
          typeof outputCurrency.code === 'string'
            ? outputCurrency.code.toUpperCase()
            : ''
        if (baseCurrencyCode === '') {
          console.warn(
            `baseCurrencyCode not defined for Moonpay tx ID: ${tx.id}`
          )
        }
        if (outputCurrencyCode === '') {
          console.warn(
            `outputCurrencyCode not defined for Moonpay tx ID: ${tx.id}`
          )
        }
        if (baseCurrencyCode !== '' && outputCurrencyCode !== '') {
          const date = new Date(tx.createdAt)
          const timestamp = date.getTime()

          const ssTx = {
            status: 'complete',
            inputTXID: tx.cryptoTransactionId,
            inputAddress: '',
            inputCurrency: baseCurrencyCode,
            inputAmount: tx.baseCurrencyAmount,
            outputAddress: tx.walletAddress,
            outputCurrency: outputCurrencyCode,
            outputAmount: tx.quoteCurrencyAmount,
            timestamp,
            isoDate: date.toISOString()
          }
          ssFormatTxs.push(ssTx)
          done = latestTimestamp > timestamp || txs.length < PER_REQUEST_LIMIT
          newestTimestamp =
            newestTimestamp > timestamp ? newestTimestamp : timestamp
        }
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
