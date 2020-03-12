import { bns } from 'biggystring'

import { PartnerPlugin, PluginResult, StandardTx } from '../types'
import config from './../../config.json'

const div: { [key: string]: string } = {
  BTC: '100000000',
  ETH: '1000000',
  LTC: '100000000',
  DASH: '100000000',
  DOGE: '100000000'
}

export async function queryBitrefill(): Promise<PluginResult> {
  const MAX_ITERATIONS = 20
  let username = ''
  let password = ''
  if (typeof config.bitrefillCredentials === 'object') {
    username = config.bitrefillCredentials.apiKey
    password = config.bitrefillCredentials.apiSecret
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
    let jsonObj
    let txs
    try {
      const result = await fetch(url, {
        method: 'GET',
        headers
      })
      jsonObj = await result.json()
      txs =
        jsonObj != null && jsonObj.orders != null && jsonObj.orders.length > 0
          ? jsonObj.orders
          : []
      // console.log(`Bitrefill: count:${count} count:${txs.length}`)
    } catch (e) {
      console.log(e)
      break
    }
    for (const tx of txs) {
      if (
        tx.paymentReceived === true &&
        tx.expired === false &&
        tx.sent === true
      ) {
        const timestamp = tx.invoiceTime / 1000

        let inputAmountNum = tx.satoshiPrice
        const inputCurrency: string = tx.coinCurrency.toUpperCase()
        if (typeof div[inputCurrency] !== 'string') {
          console.log(inputCurrency + ' has no div')
          break
        }
        if (typeof inputCurrency === 'string' && inputCurrency !== 'BTC') {
          inputAmountNum = tx.receivedPaymentAltcoin
        }
        const inputAmount = bns.div(
          inputAmountNum.toString(),
          div[inputCurrency],
          8
        )
        let inputAddress
        if (tx.payment != null && typeof tx.payment.address === 'string') {
          inputAddress = tx.payment.address
        }
        const ssTx: StandardTx = {
          status: 'complete',
          inputTXID: tx.orderId,
          inputAddress,
          inputCurrency,
          inputAmount,
          outputCurrency: 'USD',
          outputAmount: tx.usdPrice.toString(),
          timestamp,
          isoDate: new Date(timestamp).toISOString()
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
