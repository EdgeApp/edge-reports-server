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
import { datelog } from '../util'

const asChangeNowTx = asObject({
  id: asString,
  updatedAt: asString,
  payinHash: asOptional(asString),
  payoutHash: asOptional(asString),
  payinAddress: asString,
  fromCurrency: asString,
  amountSend: asNumber,
  payoutAddress: asString,
  toCurrency: asString,
  amountReceive: asNumber
})

const asChangeNowRawTx = asObject({
  status: asString,
  amountSend: asOptional(asNumber),
  amountReceive: asOptional(asNumber)
})

const asChangeNowResult = asArray(asUnknown)
const LIMIT = 100
const ROLLBACK = 500

const makeUrl = (settings, apiKey): string => {
  const options = Object.keys(settings)
    .reduce((prev, key) => `${prev}${key}=${settings[key]}&`, '')
    .slice(0, -1)
  const url = `https://changenow.io/api/v1/transactions/${apiKey}?${options}`
  return url
}

export const queryChangeNow = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const ssFormatTxs: StandardTx[] = []
  const settings = { ...pluginParams.settings }
  if (typeof pluginParams.apiKeys.changenowApiKey !== 'string') {
    return {
      settings,
      transactions: []
    }
  }

  if (settings.limit == null) {
    settings.limit = LIMIT
  }
  if (settings.offset == null) {
    settings.offset = 0
  }

  while (true) {
    const url = makeUrl(settings, pluginParams.apiKeys.changenowApiKey)
    let jsonObj: ReturnType<typeof asChangeNowResult>
    try {
      const result = await fetch(url, {
        method: 'GET'
      })
      const seperate = await result.json()
      jsonObj = asChangeNowResult(seperate)
    } catch (e) {
      datelog(e)
      break
    }
    const txs = jsonObj
    for (const rawtx of txs) {
      const checkTx = asChangeNowRawTx(rawtx) // Check RAW trasaction
      if (
        checkTx.status === 'finished' &&
        checkTx.amountSend != null &&
        checkTx.amountReceive != null
      ) {
        const tx = asChangeNowTx(rawtx) // Set NORMAL trasaction
        const date = new Date(tx.updatedAt)
        const timestamp = date.getTime() / 1000
        const ssTx: StandardTx = {
          status: 'complete',
          orderId: tx.id,
          depositTxid: tx.payinHash,
          depositAddress: tx.payinAddress,
          depositCurrency: tx.fromCurrency.toUpperCase(),
          depositAmount: tx.amountSend,
          payoutTxid: tx.payoutHash,
          payoutAddress: tx.payoutAddress,
          payoutCurrency: tx.toCurrency.toUpperCase(),
          payoutAmount: tx.amountReceive,
          timestamp,
          isoDate: tx.updatedAt,
          usdValue: undefined,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
      }
    }
    if (txs.length < LIMIT) {
      // datelog('length < 100, stopping query')
      break
    }
    settings.offset += LIMIT
  }
  if (settings.offset >= ROLLBACK) {
    settings.offset -= ROLLBACK
  }
  const out: PluginResult = {
    settings,
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
