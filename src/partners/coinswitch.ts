import {
  asArray,
  asEither,
  asNull,
  asNumber,
  asObject,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asCoinSwitchTx = asObject({
  status: asString,
  orderId: asString,
  inputTransactionHash: asEither(asString, asNull),
  outputTransactionHash: asEither(asString, asNull),
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
    items: asArray(asUnknown)
  })
})
const COUNT = 25
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

export async function queryCoinSwitch(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []
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
      datelog(e)
      break
    }
    const txs = jsonObj.data.items
    for (const rawTx of txs) {
      const standardTx = processCoinSwitchTx(rawTx)
      standardTxs.push(standardTx)
      const createdAt = standardTx.timestamp * 1000
      if (createdAt > newLatestTimeStamp) {
        newLatestTimeStamp = createdAt
      }
      if (createdAt < latestTimeStamp - QUERY_LOOKBACK) {
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
    transactions: standardTxs
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

export function processCoinSwitchTx(rawTx: unknown): StandardTx {
  const tx = asCoinSwitchTx(rawTx)
  const depositTxid =
    tx.inputTransactionHash === 'string' ? tx.inputTransactionHash : undefined
  const payoutTxid =
    tx.outputTransactionHash === 'string' ? tx.outputTransactionHash : undefined
  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.orderId,
    countryCode: null,
    depositTxid,
    depositAddress: tx.exchangeAddress.address,
    depositCurrency: tx.depositCoin.toUpperCase(),
    depositAmount: tx.depositCoinAmount,
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid,
    payoutAddress: tx.destinationAddress.address,
    payoutCurrency: tx.destinationCoin.toUpperCase(),
    payoutAmount: tx.destinationCoinAmount,
    timestamp: tx.createdAt / 1000,
    isoDate: new Date(tx.createdAt).toISOString(),
    usdValue: -1,
    rawTx: rawTx
  }
  return standardTx
}
