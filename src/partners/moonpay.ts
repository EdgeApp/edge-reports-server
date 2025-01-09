import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asMoonpayCurrency = asObject({
  id: asString,
  type: asString,
  name: asString,
  code: asString
})

const asMoonpayTx = asObject({
  cryptoTransactionId: asString,
  baseCurrencyAmount: asNumber,
  walletAddress: asString,
  quoteCurrencyAmount: asNumber,
  createdAt: asString,
  id: asString,
  baseCurrencyId: asString,
  currencyId: asString,
  currency: asMoonpayCurrency,
  baseCurrency: asMoonpayCurrency
})

type MoonpayTx = ReturnType<typeof asMoonpayTx>

const asPreMoonpayTx = asObject({
  status: asString
})

const asMoonpayResult = asArray(asUnknown)

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5
const PER_REQUEST_LIMIT = 50

export async function queryMoonpay(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []

  let headers
  let latestTimestamp = 0
  if (typeof pluginParams.settings.latestTimestamp === 'number') {
    latestTimestamp = pluginParams.settings.latestTimestamp
  }

  const apiKey = pluginParams.apiKeys.apiKey
  if (typeof apiKey === 'string') {
    headers = {
      Authorization: `Api-Key ${apiKey}`
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

    for (const rawTx of txs) {
      const preTx = asPreMoonpayTx(rawTx)
      if (preTx.status === 'completed') {
        const standardTx = processMoonpayTx(rawTx)
        standardTxs.push(standardTx)
        const timestamp = standardTx.timestamp * 1000
        done = latestTimestamp > timestamp || txs.length < PER_REQUEST_LIMIT
        newestTimestamp =
          newestTimestamp > timestamp ? newestTimestamp : timestamp
      }
    }

    offset += PER_REQUEST_LIMIT
  }

  const out: PluginResult = {
    settings: { latestTimestamp: newestTimestamp },
    transactions: standardTxs
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

export function processMoonpayTx(rawTx: unknown): StandardTx {
  const tx: MoonpayTx = asMoonpayTx(rawTx)
  const date = new Date(tx.createdAt)
  const timestamp = date.getTime()
  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: tx.baseCurrency.code.toUpperCase(),
    depositAmount: tx.baseCurrencyAmount,
    payoutTxid: tx.cryptoTransactionId,
    payoutAddress: tx.walletAddress,
    payoutCurrency: tx.currency.code.toUpperCase(),
    payoutAmount: tx.quoteCurrencyAmount,
    timestamp: timestamp / 1000,
    isoDate: tx.createdAt,
    usdValue: -1,
    rawTx
  }
  return standardTx
}
