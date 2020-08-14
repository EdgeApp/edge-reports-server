import { asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

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

export async function queryWyre(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: {},
      transactions: []
    }
  }

  const parseTxStr = (txStr): WyreTx => {
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

  const url = `https://app.periscopedata.com/api/sendwyre/chart/csv/${apiKey}`
  const result = await fetch(url, {
    method: 'GET'
  })
  const csvResults = asWyreResult(await result.text())
  const txs = csvResults.split('\n')
  txs.shift()
  txs.pop()

  for (const txStr of txs) {
    const tx = asWyreTx(parseTxStr(txStr))
    if (tx.status === 'COMPLETED' && tx.sourceCurrency !== tx.destCurrency) {
      const date = new Date(tx.createdAt)

      const ssTx: StandardTx = {
        status: 'complete',
        orderId: tx.id,
        depositTxid: undefined,
        depositAddress: undefined,
        depositCurrency: tx.sourceCurrency,
        depositAmount: parseFloat(tx.sourceAmount),
        payoutTxid: undefined,
        payoutAddress: undefined,
        payoutCurrency: tx.destCurrency,
        payoutAmount: parseFloat(tx.destAmount),
        timestamp: date.getTime() / 1000,
        isoDate: date.toISOString(),
        usdValue: parseFloat(tx.usdEquiv),
        rawTx: txStr
      }
      ssFormatTxs.push(ssTx)
    }
  }

  const out: PluginResult = {
    settings: {},
    transactions: ssFormatTxs
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
