import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asFoxExchangeTx = asObject({
  orderId: asString,
  depositCoin: asString,
  depositCoinAmount: asNumber,
  exchangeAddress: asObject({ address: asString }),
  destinationCoin: asString,
  destinationCoinAmount: asNumber,
  destinationAddress: asObject({ address: asString }),
  outputTransactionHash: asString,
  createdAt: asNumber
})

const asFoxExchangeRawTx = asObject({
  status: asString
})

const asFoxExchangeTxs = asObject({
  data: asObject({
    items: asArray(asUnknown)
  })
})

const LIMIT = 100
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 3 // 3 days ago

export async function queryFoxExchange(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []
  let apiKey
  let secretToken
  let lastCheckedTimestamp
  if (typeof pluginParams.settings.lastCheckedTimestamp !== 'number') {
    lastCheckedTimestamp = 0
  } else {
    lastCheckedTimestamp = pluginParams.settings.lastCheckedTimestamp
  }
  if (
    typeof pluginParams.apiKeys.apiKey === 'string' &&
    typeof pluginParams.apiKeys.secretToken === 'string'
  ) {
    apiKey = pluginParams.apiKeys.apiKey
    secretToken = pluginParams.apiKeys.secretToken
  } else {
    return {
      settings: { lastCheckedTimestamp: lastCheckedTimestamp },
      transactions: []
    }
  }

  let done = false
  let newestTimestamp = 0
  let offset = 0
  lastCheckedTimestamp -= QUERY_LOOKBACK
  while (!done) {
    let txs
    try {
      // Limit is the amount of things fetched per call.
      // Offset is how far forward you want to look into the database for results.
      // the closer an offset is to 0, the more recent it is
      const res = await fetch(
        `https://fox.exchange/api/cs/orders?count=${LIMIT}&start=${offset}`,
        {
          headers: {
            'x-api-key': apiKey,
            'x-secret-token': secretToken
          }
        }
      )
      if (res.ok) {
        txs = asFoxExchangeTxs(await res.json())
      }
    } catch (e) {
      datelog(e)
      throw e
    }

    for (const rawTx of txs.data.items) {
      if (asFoxExchangeRawTx(rawTx).status === 'complete') {
        const standardTx = processFoxExchangeTx(rawTx)
        standardTxs.push(standardTx)
        const createdAt = standardTx.timestamp * 1000
        if (createdAt > newestTimestamp) {
          newestTimestamp = createdAt
        }
        if (lastCheckedTimestamp > createdAt) {
          done = true
        }
      }
    }

    offset += LIMIT

    // this is if the end of the database is reached
    if (txs.data.items.length < LIMIT) {
      done = true
    }
  }

  const out: PluginResult = {
    settings: { lastCheckedTimestamp: newestTimestamp },
    transactions: standardTxs
  }
  return out
}

export const foxExchange: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryFoxExchange,
  // results in a PluginResult
  pluginName: 'FoxExchange',
  pluginId: 'foxExchange'
}

export function processFoxExchangeTx(rawTx: unknown): StandardTx {
  const tx = asFoxExchangeTx(rawTx)
  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.orderId,
    countryCode: null,
    depositTxid: undefined,
    depositAddress: tx.exchangeAddress.address,
    depositCurrency: tx.depositCoin.toUpperCase(),
    depositAmount: tx.depositCoinAmount,
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.outputTransactionHash,
    payoutAddress: tx.destinationAddress.address,
    payoutCurrency: tx.destinationCoin.toUpperCase(),
    payoutAmount: tx.destinationCoinAmount,
    timestamp: tx.createdAt / 1000,
    updateTime: new Date(),
    isoDate: new Date(tx.createdAt).toISOString(),
    usdValue: -1,
    rawTx
  }
  return standardTx
}
