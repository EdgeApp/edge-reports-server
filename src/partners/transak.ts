import {
  asArray,
  asBoolean,
  asEither,
  asNumber,
  asObject,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const pageLimit = 100

const asTransakOrder = asObject({
  status: asString,
  id: asString,
  fromWalletAddress: asEither(asBoolean, asString),
  fiatCurrency: asString,
  fiatAmount: asNumber,
  walletAddress: asString,
  cryptocurrency: asString,
  cryptoAmount: asNumber,
  completedAt: asString
})

const asRawTxOrder = asObject({
  status: asString
})

const asTransakResult = asObject({
  response: asArray(asUnknown)
})

export async function queryTransak(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey: string

  let { offset = 0 } = pluginParams.settings
  if (typeof pluginParams.apiKeys.transak_api_secret === 'string') {
    apiKey = pluginParams.apiKeys.transak_api_secret
  } else {
    return {
      settings: { offset: offset },
      transactions: []
    }
  }

  let resultJSON
  let done = false

  while (!done) {
    const url = `https://api.transak.com/api/v1/partners/orders/?partnerAPISecret=${apiKey}&limit=${pageLimit}&skip=${offset}`
    let jsonObj
    try {
      const result = await fetch(url)
      resultJSON = await result.json()
      jsonObj = asTransakResult(resultJSON)
    } catch (e) {
      console.log(e)
      break
    }
    const txs = jsonObj

    for (const rawtx of txs) {
      if (asRawTxOrder(rawtx).status === 'COMPLETED') {
        const tx = asTransakOrder(rawtx)
        const date = new Date(tx.completedAt)
        const ssTx: StandardTx = {
          status: 'complete',
          inputTXID: tx.id,
          inputAddress: tx.fromWalletAddress.toString(),
          inputCurrency: tx.fiatCurrency,
          inputAmount: tx.fiatAmount,
          outputAddress: tx.walletAddress,
          outputCurrency: tx.cryptocurrency,
          outputAmount: tx.cryptoAmount,
          timestamp: date.getTime() / 1000,
          isoDate: date.toISOString()
        }
        ssFormatTxs.push(ssTx)
      }
    }
    if (txs.length < pageLimit) {
      done = true
    }
    offset += txs.length
  }

  const out: PluginResult = {
    settings: { offset: offset },
    transactions: ssFormatTxs
  }
  return out
}

export const transak: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryTransak,
  // results in a PluginResult
  pluginName: 'Transak',
  pluginId: 'transak'
}
