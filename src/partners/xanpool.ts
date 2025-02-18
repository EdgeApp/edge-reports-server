import {
  asArray,
  asMap,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog, smartIsoDateFromTimestamp } from '../util'

const asXanpoolTx = asObject({
  id: asString,
  type: asValue('buy', 'sell'),
  status: asString,
  method: asString,
  crypto: asNumber,
  fiat: asNumber,
  total: asNumber,
  currency: asString,
  cryptoCurrency: asString,
  serviceCharge: asNumber,
  cryptoPrice: asNumber,
  cryptoPriceUsd: asNumber,
  blockchainTxId: asOptional(asString),
  wallet: asOptional(asString),
  userCountry: asString,
  depositWallets: asOptional(asMap(asString)),
  createdAt: asString
})

const asXanpoolPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, '0')
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString),
    apiSecret: asOptional(asString)
  })
})

const asXanpoolResult = asObject({
  data: asArray(asUnknown)
})

const LIMIT = 100
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

async function queryXanpool(pluginParams: PluginParams): Promise<PluginResult> {
  const { settings, apiKeys } = asXanpoolPluginParams(pluginParams)
  const { apiKey, apiSecret } = apiKeys
  let offset = 0
  let { latestIsoDate } = settings

  if (typeof apiKey !== 'string') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  try {
    let done = false
    while (!done) {
      let oldestIsoDate = '999999999999999999999999999999999999'
      datelog(`Query Xanpool offset: ${offset}`)

      const response = await fetch(
        `https://${apiKey}:${apiSecret}@xanpool.com/api/v2/transactions?pageSize=${LIMIT}&page=${offset}`
      )
      const result = await response.json()

      const txs = asXanpoolResult(result).data
      if (txs.length === 0) {
        datelog(`ChangeHero done at offset ${offset}`)
        break
      }
      for (const rawTx of txs) {
        const standardTx = processXanpoolTx(rawTx)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < oldestIsoDate) {
          oldestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < previousLatestIsoDate && !done) {
          datelog(
            `Xanpool done: date ${standardTx.isoDate} < ${previousLatestIsoDate}`
          )
          done = true
        }
      }
      datelog(`oldestIsoDate ${oldestIsoDate}`)
      offset += LIMIT
    }
  } catch (e) {
    datelog(e)
  }
  const out = {
    settings: {
      latestIsoDate
    },
    transactions: standardTxs
  }
  return out
}

export const xanpool: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryXanpool,
  // results in a PluginResult
  pluginName: 'Xanpool',
  pluginId: 'xanpool'
}

export function processXanpoolTx(rawTx: unknown): StandardTx {
  const tx = asXanpoolTx(rawTx)
  if (tx.type === 'buy') {
    return {
      status: tx.status === 'completed' ? 'complete' : 'expired',
      orderId: tx.id,
      countryCode: tx.userCountry,
      depositTxid: undefined,
      depositAddress: undefined,
      depositCurrency: tx.currency,
      depositAmount: tx.fiat,
      direction: 'buy',
      exchangeType: 'fiat',
      paymentType: null, // Or whatever tx.method === 'paynow' means?
      payoutTxid: tx.blockchainTxId,
      payoutAddress: tx.wallet,
      payoutCurrency: tx.cryptoCurrency,
      payoutAmount: tx.crypto,
      timestamp: smartIsoDateFromTimestamp(new Date(tx.createdAt).getTime())
        .timestamp,
      isoDate: tx.createdAt,
      usdValue: -1,
      rawTx
    }
  } else if (tx.type === 'sell') {
    return {
      status: tx.status === 'completed' ? 'complete' : 'expired',
      orderId: tx.id,
      countryCode: tx.userCountry,
      depositTxid: tx.blockchainTxId,
      depositAddress: Object.values(tx.depositWallets ?? {})[0],
      depositCurrency: tx.cryptoCurrency,
      depositAmount: tx.crypto,
      direction: 'sell',
      exchangeType: 'fiat',
      paymentType: 'paynow', // Or whatever tx.method === 'paynow' means?
      payoutTxid: undefined,
      payoutAddress: undefined,
      payoutCurrency: tx.currency,
      payoutAmount: tx.fiat,
      timestamp: smartIsoDateFromTimestamp(new Date(tx.createdAt).getTime())
        .timestamp,
      isoDate: tx.createdAt,
      usdValue: -1,
      rawTx
    }
  } else {
    throw new Error(`Invalid tx type ${tx.type} for ${tx.id}`)
  }
}
