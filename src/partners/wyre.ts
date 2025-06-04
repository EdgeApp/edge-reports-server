import { asNumber, asObject, asOptional, asString } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { safeParseFloat } from '../util'
import { isFiatCurrency } from '../util/fiatCurrency'

const asWyreTx = asObject({
  id: asString,
  owner: asString,
  status: asString,
  createdAt: asString,
  completedAt: asString,
  sourceAmount: asString,
  sourceCurrency: asString,
  destAmount: asString,
  destCurrency: asString,
  usdFeeEquiv: asString,
  usdEquiv: asString
})

export type WyreTx = ReturnType<typeof asWyreTx>

const asWyreResult = asString

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 7 // 7 days

const asWyreParams = asObject({
  apiKeys: asObject({ apiKey: asString }),
  settings: asOptional(asObject({ lastTxTimestamp: asNumber }), {
    lastTxTimestamp: 0
  })
})

export async function queryWyre(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []

  // lastTxTimestamp is in JS milliseconds
  let apiKey, lastTxTimestamp

  try {
    const { apiKeys, settings } = asWyreParams(pluginParams)
    apiKey = apiKeys.apiKey
    lastTxTimestamp = settings.lastTxTimestamp
  } catch (e) {
    return {
      settings: { lastTxTimestamp: 0 },
      transactions: []
    }
  }

  let newestTxTimestamp = lastTxTimestamp - QUERY_LOOKBACK
  if (newestTxTimestamp < 0) newestTxTimestamp = 0

  const url = `https://app.periscopedata.com/api/sendwyre/chart/csv/${apiKey}`
  const result = await fetch(url, {
    method: 'GET'
  })
  const csvResults = asWyreResult(await result.text())
  const txs = csvResults.split('\n')
  txs.shift()
  txs.pop()

  for (const rawTx of txs) {
    const tx = asWyreTx(parseTxStr(rawTx))
    if (tx.status === 'COMPLETED' && tx.sourceCurrency !== tx.destCurrency) {
      const date = new Date(tx.createdAt)
      const dateMs = date.getTime()
      if (dateMs < lastTxTimestamp) {
        continue
      }
      if (dateMs > newestTxTimestamp) {
        newestTxTimestamp = dateMs
      }

      const standardTx = processWyreTx(rawTx)

      standardTxs.push(standardTx)
    }
  }

  const out: PluginResult = {
    settings: { lastTxTimestamp: newestTxTimestamp },
    transactions: standardTxs
  }
  return out
}

export const wyre: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryWyre,
  // results in a PluginResult
  pluginName: 'Wyre',
  pluginId: 'wyre'
}

export function processWyreTx(rawTx: unknown): StandardTx {
  const tx = asWyreTx(parseTxStr(asString(rawTx)))
  const date = new Date(tx.createdAt)
  const dateMs = date.getTime()

  const depositCurrency = tx.sourceCurrency
  const payoutCurrency = tx.destCurrency
  const isDepositFiat = isFiatCurrency(depositCurrency)
  const isPayoutFiat = isFiatCurrency(payoutCurrency)

  const direction = isDepositFiat ? 'buy' : isPayoutFiat ? 'sell' : undefined

  if (direction == null) {
    throw new Error(
      `Unknown direction for tx ${tx.id}; no fiat currency in trade from ${depositCurrency} to ${payoutCurrency}`
    )
  }

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,
    countryCode: null,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency,
    depositAmount: safeParseFloat(tx.sourceAmount),
    direction,
    exchangeType: 'fiat',
    paymentType: 'ach',
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency,
    payoutAmount: safeParseFloat(tx.destAmount),
    timestamp: dateMs / 1000,
    updateTime: new Date(),
    isoDate: date.toISOString(),
    usdValue: safeParseFloat(tx.usdEquiv),
    rawTx
  }
  return standardTx
}

const parseTxStr = (txStr: string): WyreTx => {
  const txItems = txStr.split(',')
  return {
    id: txItems[0],
    owner: txItems[1],
    status: txItems[2],
    createdAt: txItems[3],
    completedAt: txItems[4],
    sourceAmount: txItems[5],
    sourceCurrency: txItems[6],
    usdFeeEquiv: txItems[7],
    destAmount: txItems[8],
    destCurrency: txItems[9],
    usdEquiv: txItems[10]
  }
}
