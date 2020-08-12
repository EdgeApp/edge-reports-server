import {
  asArray,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asChangeNowTx = asObject({
  updatedAt: asString,
  payinHash: asString,
  payinAddress: asString,
  fromCurrency: asString,
  amountSend: asNumber,
  payoutAddress: asString,
  toCurrency: asString,
  amountReceive: asNumber
})

const asChangeNowRawTx = asObject({
  status: asString,
  payinHash: asOptional(asString),
  amountSend: asOptional(asNumber),
  amountReceive: asOptional(asNumber)
})

const asChangeNowResult = asArray(asUnknown)
const LIMIT = 100
const ROLLBACK = 500

export async function queryChangeNow(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey = ''
  let { offset = 0 } = pluginParams.settings
  if (typeof pluginParams.apiKeys.changenowApiKey === 'string') {
    apiKey = pluginParams.apiKeys.changenowApiKey
  } else {
    return {
      settings: { offset },
      transactions: []
    }
  }
  let url = `https://changenow.io/api/v1/transactions/${apiKey}?limit=${LIMIT}&offset=${offset}`
  while (true) {
    let jsonObj: ReturnType<typeof asChangeNowResult>
    try {
      const result = await fetch(url, {
        method: 'GET'
      })
      jsonObj = asChangeNowResult(await result.json())
    } catch (e) {
      console.log(e)
      break
    }
    const txs = jsonObj
    for (const rawtx of txs) {
      const checkTx = asChangeNowRawTx(rawtx)
      if (
        checkTx.status === 'finished' &&
        checkTx.payinHash != null &&
        checkTx.amountSend != null &&
        checkTx.amountReceive != null
      ) {
        const tx = asChangeNowTx(rawtx)
        const date = new Date(tx.updatedAt)
        const timestamp = date.getTime() / 1000
        const ssTx: StandardTx = {
          status: 'complete',
          inputTXID: tx.payinHash,
          inputAddress: tx.payinAddress,
          inputCurrency: tx.fromCurrency.toUpperCase(),
          inputAmount: tx.amountSend,
          outputAddress: tx.payoutAddress,
          outputCurrency: tx.toCurrency.toUpperCase(),
          outputAmount: tx.amountReceive,
          timestamp,
          isoDate: new Date(tx.updatedAt).toISOString(),
          usdValue: undefined,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
      }
    }
    if (txs.length < LIMIT) {
      // console.log('length < 100, stopping query')
      break
    }
    offset += LIMIT
    url = `https://changenow.io/api/v1/transactions/${apiKey}?limit=${LIMIT}&offset=${offset}`
  }
  if (offset >= ROLLBACK) {
    offset -= ROLLBACK
  }
  const out: PluginResult = {
    settings: { offset },
    transactions: ssFormatTxs
  }
  return out
}

export const changenow: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryChangeNow,
  // results in a PluginResult
  pluginName: 'Changenow',
  pluginId: 'changenow'
}
