import {
  asArray,
  asBoolean,
  asEither,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const PAGE_LIMIT = 100
const OFFSET_ROLLBACK = 500

const asTransakOrder = asObject({
  status: asString,
  id: asString,
  fromWalletAddress: asOptional(asEither(asBoolean, asString)),
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
      settings: { offset },
      transactions: []
    }
  }

  let resultJSON
  let done = false

  while (!done) {
    const url = `https://api.transak.com/api/v2/partners/orders/?partnerAPISecret=${apiKey}&limit=${PAGE_LIMIT}&skip=${offset}`
    try {
      const result = await fetch(url)
      resultJSON = asTransakResult(await result.json())
    } catch (e) {
      datelog(e)
      break
    }
    const txs = resultJSON.response

    for (const rawtx of txs) {
      if (asRawTxOrder(rawtx).status === 'COMPLETED') {
        const tx = asTransakOrder(rawtx)
        const date = new Date(tx.completedAt)
        const depositAddress =
          typeof tx.fromWalletAddress === 'string'
            ? tx.fromWalletAddress
            : undefined
        const ssTx: StandardTx = {
          status: 'complete',
          orderId: tx.id,
          depositTxid: undefined,
          depositAddress,
          depositCurrency: tx.fiatCurrency,
          depositAmount: tx.fiatAmount,
          payoutTxid: undefined,
          payoutAddress: tx.walletAddress,
          payoutCurrency: tx.cryptocurrency,
          payoutAmount: tx.cryptoAmount,
          timestamp: date.getTime() / 1000,
          isoDate: date.toISOString(),
          usdValue: undefined,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
      }
    }
    if (txs.length < PAGE_LIMIT) {
      done = true
    }
    offset += txs.length
  }
  offset -= OFFSET_ROLLBACK
  offset = offset > 0 ? offset : 0

  const out: PluginResult = {
    settings: { offset },
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
