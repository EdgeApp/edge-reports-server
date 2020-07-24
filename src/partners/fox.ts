import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'
import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asFoxTx = asObject({
    orderId: asString,
    depositCoin: asString,
    depositCoinAmount: asNumber,
    exchangeAddress: asObject({ address: asString }),
    destinationCoin: asString,
    destinationCoinAmount: asNumber,
    destinationAddress: asObject({ address: asString }),
    createdAt: asNumber
})

const asFoxTxs = asObject({
    data: asObject({
        items: asArray(asFoxTx)
    })
})  

const LIMIT = 100
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

export async function queryFox(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey
  let secretToken
  let lastCheckedTimestamp
  if (typeof pluginParams.settings.offset !== 'number') {
    lastCheckedTimestamp = Date.now() - QUERY_LOOKBACK 
  } else {
    lastCheckedTimestamp = pluginParams.settings.lastCheckedTimestamp
  }
  if (typeof pluginParams.apiKeys.apiKey === 'string' && typeof pluginParams.apiKeys.secretToken === 'string') {
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
  while (!done) {
    let txs: ReturnType<typeof asFoxTxs>
    txs = { data: { items: []}}
    try {
        const res = await fetch(`https://fox.exchange/api/cs/orders?count=${LIMIT}&start=${offset}`, {
            headers: {
            'x-api-key': apiKey,
            'x-secret-token': secretToken
            }
        })
        if (res.ok) {
            txs = asFoxTxs(await res.json()) 
        }
    } catch (e) {
        console.log(e)
        break
    }    

    for (const tx of txs.data.items) {       
        const ssTx: StandardTx = {
        status: 'complete',
        inputTXID: tx.orderId,
        inputAddress: tx.exchangeAddress.address,
        inputCurrency: tx.depositCoin.toUpperCase(),
        inputAmount: tx.depositCoinAmount,
        outputAddress: tx.destinationAddress.address,
        outputCurrency: tx.destinationCoin.toUpperCase(),
        outputAmount: tx.destinationCoinAmount,
        timestamp: tx.createdAt / 1000,
        isoDate: (new Date(tx.createdAt)).toISOString()
        }
        ssFormatTxs.push(ssTx)
        if (tx.createdAt > newestTimestamp) {
        newestTimestamp = tx.createdAt
        }
        if (lastCheckedTimestamp > tx.createdAt) {
        done = true;
        }
    }

    offset += 100  

    if (txs.data.items.length < 100) {
        done = true
    }
  }

  const out: PluginResult = {
    settings: { lastCheckedTimestamp: newestTimestamp },
    transactions: ssFormatTxs
  }
  return out
}

export const fox: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryFox,
  // results in a PluginResult
  pluginName: 'Fox',
  pluginId: 'fox'
}