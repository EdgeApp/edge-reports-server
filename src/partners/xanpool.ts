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

  const ssFormatTxs: StandardTx[] = []
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
        const {
          id,
          status,
          type,
          blockchainTxId,
          wallet,
          createdAt,
          currency,
          fiat,
          cryptoCurrency,
          crypto,
          depositWallets
        } = asXanpoolTx(rawTx)
        let ssTx: StandardTx | undefined
        if (type === 'buy') {
          ssTx = {
            status: status === 'completed' ? 'complete' : status,
            orderId: id,
            depositTxid: undefined,
            depositAddress: undefined,
            depositCurrency: currency,
            depositAmount: fiat,
            payoutTxid: blockchainTxId,
            payoutAddress: wallet,
            payoutCurrency: cryptoCurrency,
            payoutAmount: crypto,
            timestamp: smartIsoDateFromTimestamp(new Date(createdAt).getTime())
              .timestamp,
            isoDate: createdAt,
            usdValue: undefined,
            rawTx
          }
        } else if (type === 'sell') {
          ssTx = {
            status: status === 'completed' ? 'complete' : status,
            orderId: id,
            depositTxid: blockchainTxId,
            depositAddress: Object.values(depositWallets ?? {})[0],
            depositCurrency: cryptoCurrency,
            depositAmount: crypto,
            payoutTxid: undefined,
            payoutAddress: undefined,
            payoutCurrency: currency,
            payoutAmount: fiat,
            timestamp: smartIsoDateFromTimestamp(new Date(createdAt).getTime())
              .timestamp,
            isoDate: createdAt,
            usdValue: undefined,
            rawTx
          }
        } else {
          throw new Error(`Invalid tx type ${type}`)
        }
        ssFormatTxs.push(ssTx)
        if (ssTx.isoDate > latestIsoDate) {
          latestIsoDate = ssTx.isoDate
        }
        if (ssTx.isoDate < oldestIsoDate) {
          oldestIsoDate = ssTx.isoDate
        }
        if (ssTx.isoDate < previousLatestIsoDate && !done) {
          datelog(
            `Xanpool done: date ${ssTx.isoDate} < ${previousLatestIsoDate}`
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
    transactions: ssFormatTxs
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
