import { div } from 'biggystring'
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog, safeParseFloat } from '../util'

const asBitrefillTx = asObject({
  paymentReceived: asBoolean,
  expired: asBoolean,
  sent: asBoolean,
  invoiceTime: asNumber,
  satoshiPrice: asOptional(asNumber),
  value: asString,
  currency: asString,
  coinCurrency: asString,
  receivedPaymentAltcoin: asOptional(asNumber),
  orderId: asString,
  usdPrice: asNumber
})

// Partial type for Bitrefill txs for pre-processing
const asPreBitrefillTx = asObject({
  expired: asBoolean,
  paymentReceived: asBoolean,
  sent: asBoolean,
  status: asString
})

const asBitrefillResult = asObject({
  nextUrl: asOptional(asString),
  orders: asArray(asUnknown)
})

const multipliers: { [key: string]: string } = {
  BTC: '100000000',
  ETH: '1000000',
  LTC: '100000000',
  DASH: '100000000',
  DOGE: '100000000'
}

export async function queryBitrefill(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const MAX_ITERATIONS = 20
  let username = ''
  let password = ''
  if (
    typeof pluginParams.apiKeys.apiKey === 'string' &&
    typeof pluginParams.apiKeys.apiSecret === 'string'
  ) {
    username = pluginParams.apiKeys.apiKey
    password = pluginParams.apiKeys.apiSecret
  } else {
    return {
      settings: {},
      transactions: []
    }
  }
  const headers = {
    Authorization:
      'Basic ' + Buffer.from(username + ':' + password).toString('base64')
  }
  const standardTxs: StandardTx[] = []

  let url = `https://api.bitrefill.com/v1/orders/`
  let count = 0
  while (true) {
    let jsonObj: ReturnType<typeof asBitrefillResult>
    try {
      const result = await fetch(url, {
        method: 'GET',
        headers
      })
      jsonObj = asBitrefillResult(await result.json())
    } catch (e) {
      datelog(e)
      break
    }
    const txs = jsonObj.orders
    for (const rawTx of txs) {
      // Pre-process the tx to see if it's meets criteria for inclusion:
      const preTx = asPreBitrefillTx(rawTx)
      if (preTx.status === 'unpaid') {
        continue
      }
      if (preTx.paymentReceived && !preTx.expired && preTx.sent) {
        const standardTx = processBitrefillTx(rawTx)
        standardTxs.push(standardTx)
      }
    }

    if (count > MAX_ITERATIONS) {
      break
    }

    if (jsonObj.nextUrl != null && typeof jsonObj.nextUrl === 'string') {
      url = jsonObj.nextUrl
    } else {
      break
    }
    count++
  }
  const out: PluginResult = {
    settings: {},
    transactions: standardTxs
  }
  return out
}

export const bitrefill: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryBitrefill,
  // results in a PluginResult
  pluginName: 'Bitrefill',
  pluginId: 'bitrefill'
}

export function processBitrefillTx(rawTx: unknown): StandardTx {
  const tx = asBitrefillTx(rawTx)
  const timestamp = tx.invoiceTime / 1000

  const inputCurrency: string = tx.coinCurrency.toUpperCase()
  if (typeof multipliers[inputCurrency] !== 'string') {
    throw new Error(inputCurrency + ' has no multipliers')
  }
  let depositAmountStr = tx.satoshiPrice?.toString()
  if (typeof inputCurrency === 'string' && inputCurrency !== 'BTC') {
    depositAmountStr = tx.receivedPaymentAltcoin?.toString()
  }
  if (depositAmountStr == null) {
    throw new Error(`Missing depositAmount for tx: ${tx.orderId}`)
  }
  const depositAmount = safeParseFloat(
    div(depositAmountStr, multipliers[inputCurrency], 8)
  )
  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.orderId,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: inputCurrency,
    depositAmount,
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency: tx.currency,
    payoutAmount: parseInt(tx.value),
    timestamp,
    isoDate: new Date(tx.invoiceTime).toISOString(),
    usdValue: tx.usdPrice,
    rawTx
  }

  return standardTx
}
