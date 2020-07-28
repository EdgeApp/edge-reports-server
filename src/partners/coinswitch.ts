import { asArray, asNumber, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asCoinSwitchTx = asObject({
  status: asString,
  inputTransactionHash: asString,
  exchangeAddress: asObject({ address: asString }),
  depositCoin: asString,
  depositCoinAmount: asNumber,
  destinationAddress: asObject({ address: asString }),
  destinationCoin: asString,
  destinationCoinAmount: asNumber,
  createdAt: asNumber
})

const asCoinSwitchResult = asObject({
  data: asObject({
    items: asArray(asCoinSwitchTx)
  })
})
const COUNT = 25
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

export async function queryCoinSwitch(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let start = 0
  let apiKey = ''
  let latestTimeStamp = 0
  if (typeof pluginParams.settings.latestTimeStamp === 'number') {
    latestTimeStamp = pluginParams.settings.latestTimeStamp
  }
  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: {
        latestTimeStamp: latestTimeStamp
      },
      transactions: []
    }
  }
  let url = `https://api.coinswitch.co/v2/orders?start=${start}&count=${COUNT}&status=complete`
  const headers = {
    'x-api-key': apiKey
  }

  let newLatestTimeStamp = latestTimeStamp
  let done = false
  while (!done) {
    let jsonObj: ReturnType<typeof asCoinSwitchResult>
    try {
      const result = await fetch(url, { method: 'GET', headers: headers })
      jsonObj = asCoinSwitchResult(await result.json())
    } catch (e) {
      console.log(e)
      break
    }
    const txs = jsonObj.data.items
    for (const tx of txs) {
      const ssTx: StandardTx = {
        status: 'complete',
        inputTXID: tx.inputTransactionHash,
        inputAddress: tx.exchangeAddress.address,
        inputCurrency: tx.depositCoin.toUpperCase(),
        inputAmount: tx.depositCoinAmount,
        outputAddress: tx.destinationAddress.address,
        outputCurrency: tx.destinationCoin.toUpperCase(),
        outputAmount: tx.destinationCoinAmount,
        timestamp: tx.createdAt / 1000,
        isoDate: new Date(tx.createdAt).toISOString()
      }
      ssFormatTxs.push(ssTx)
      if (tx.createdAt > newLatestTimeStamp) {
        newLatestTimeStamp = tx.createdAt
      }
      if (tx.createdAt < latestTimeStamp - QUERY_LOOKBACK) {
        done = true
      }
    }
    if (txs.length < COUNT) {
      break
    }
    start += COUNT
    url = `https://api.coinswitch.co/v2/orders?start=${start}&count=${COUNT}&status=complete`
  }
  const out: PluginResult = {
    settings: { latestTimeStamp: newLatestTimeStamp },
    transactions: ssFormatTxs
  }
  return out
}

export const coinswitch: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryCoinSwitch,
  // results in a PluginResult
  pluginName: 'CoinSwitch',
  pluginId: 'coinswitch'
}
