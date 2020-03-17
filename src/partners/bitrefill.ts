import { bns } from 'biggystring'
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asOptional,
  asString
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asBitrefillTx = asObject({
  paymentReceived: asBoolean,
  expired: asBoolean,
  sent: asBoolean,
  invoiceTime: asNumber,
  satoshiPrice: asOptional(asNumber),
  coinCurrency: asString,
  receivedPaymentAltcoin: asOptional(asNumber),
  orderId: asString,
  usdPrice: asNumber
})

const asBitrefillResult = asObject({
  nextUrl: asOptional(asString),
  orders: asArray(asBitrefillTx)
})

const div: { [key: string]: string } = {
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
  const ssFormatTxs: StandardTx[] = []

  let url = `https://api.bitrefill.com/v1/orders/`
  let count = 0
  while (true) {
    // console.log(`Querying url ${url}`)
    // console.log(`Querying lastTxid ${lastTxid}`)
    // const limit = 100
    let jsonObj: ReturnType<typeof asBitrefillResult>
    try {
      const result = await fetch(url, {
        method: 'GET',
        headers
      })
      jsonObj = asBitrefillResult(await result.json())
      // console.log(`Bitrefill: count:${count} count:${txs.length}`)
    } catch (e) {
      console.log(e)
      break
    }
    const txs = jsonObj.orders
    for (const tx of txs) {
      if (
        tx.paymentReceived === true &&
        tx.expired === false &&
        tx.sent === true
      ) {
        const timestamp = tx.invoiceTime / 1000

        let inputAmountStr = tx.satoshiPrice?.toString()
        const inputCurrency: string = tx.coinCurrency.toUpperCase()
        if (typeof div[inputCurrency] !== 'string') {
          console.log(inputCurrency + ' has no div')
          break
        }
        if (typeof inputCurrency === 'string' && inputCurrency !== 'BTC') {
          inputAmountStr = tx.receivedPaymentAltcoin?.toString()
        }
        if (inputAmountStr == null) {
          break
        }
        const inputAmountNum = parseFloat(
          bns.div(inputAmountStr, div[inputCurrency], 8)
        )
        const ssTx: StandardTx = {
          status: 'complete',
          inputTXID: tx.orderId,
          inputAddress: undefined,
          inputCurrency,
          inputAmount: inputAmountNum,
          outputAddress: undefined,
          outputCurrency: 'USD',
          outputAmount: tx.usdPrice,
          timestamp,
          isoDate: new Date(tx.invoiceTime).toISOString()
        }
        ssFormatTxs.push(ssTx)
      }
    }

    if (count > MAX_ITERATIONS) {
      // console.log('count > 9999')
      break
    }

    // console.log(`Bitrefill completed: ${ssFormatTxs.length}`)
    if (jsonObj.nextUrl != null && typeof jsonObj.nextUrl === 'string') {
      url = jsonObj.nextUrl
    } else {
      break
    }
    count++
  }
  const out: PluginResult = {
    settings: {},
    transactions: ssFormatTxs
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
