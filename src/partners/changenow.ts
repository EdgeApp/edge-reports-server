import { asArray, asNumber, asObject, asOptional, asString } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asChangeNowTx = asObject({
  status: asString,
  updatedAt: asString,
  payinHash: asOptional(asString),
  payinAddress: asString,
  fromCurrency: asString,
  amountSend: asOptional(asNumber),
  payoutAddress: asString,
  toCurrency: asString,
  amountReceive: asOptional(asNumber)
})

const asChangeNowResult = asArray(asChangeNowTx)
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
    for (const tx of txs) {
      if (
        tx.status === 'finished' &&
        tx.payinHash != null &&
        tx.amountSend != null &&
        tx.amountReceive != null
      ) {
        const date = new Date(tx.updatedAt)
        const timestamp = date.getTime() / 1000
        const ssTx: StandardTx = {
          status: 'complete',
          inputTXID: tx.payinHash,
          inputAddress: tx.payinAddress,
          inputCurrency: tx.fromCurrency.toUpperCase(),
          inputAmount: tx.amountSend.toString(),
          outputAddress: tx.payoutAddress,
          outputCurrency: tx.toCurrency.toUpperCase(),
          outputAmount: tx.amountReceive.toString(),
          timestamp,
          isoDate: new Date(tx.updatedAt).toISOString()
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
