import {
  asArray,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue
} from 'cleaners'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asRangoPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, '0')
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString)
  })
})

const asSwapperType = asValue('DEX', 'BRIDGE', 'AGGREGATOR', 'OFF_CHAIN')

const asSwapperData = asObject({
  swapperId: asString,
  swapperLogo: asString,
  swapperTitle: asString,
  swapperType: asSwapperType
})

const asBlockchainData = asObject({
  blockchain: asString,
  displayName: asString,
  logo: asString,
  shortName: asString,
  type: asString
})

const asTokenData = asObject({
  blockchainData: asBlockchainData,
  symbol: asString,
  decimals: asNumber,
  name: asOptional(asString),
  expectedAmount: asNumber,
  logo: asString,
  price: asOptional(asNumber),
  realAmount: asNumber
})

const asSwapStatus = asValue('running', 'failed', 'success', 'unknown')
const asStepSummary = asObject({
  feeUsd: asNumber,
  status: asSwapStatus,
  stepNumber: asNumber,
  fromToken: asTokenData,
  toToken: asTokenData,
  swapper: asOptional(asSwapperData)
})

const asTransaction = asObject({
  requestId: asString,
  transactionTime: asString,
  status: asSwapStatus,
  stepsSummary: asArray(asStepSummary)
})

const asRangoResult = asObject({ transactions: asArray(asTransaction) })

type RangoResult = ReturnType<typeof asRangoResult>

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const OFFSET = 50

export const queryRango = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const ssFormatTxs: StandardTx[] = []

  const { settings, apiKeys } = asRangoPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let done = false
  let oldestIsoDate = new Date(99999999999999).toISOString()

  let page = 0

  while (!done) {
    const url = `https://api.rango.exchange/scanner/tx/filter?offset=${OFFSET}&page=${page}&apiKey=${apiKey}`
    let jsonObj: RangoResult
    try {
      const result = await fetch(url, {
        method: 'GET'
      })
      const resultJson: ReturnType<typeof asRangoResult> = await result.json()
      jsonObj = asRangoResult(resultJson)
    } catch (e) {
      datelog(e)
      break
    }
    const txs = jsonObj.transactions
    for (const rawTx of txs) {
      const { requestId, status, stepsSummary, transactionTime } = rawTx

      if (status !== 'success') {
        continue
      }
      const time = new Date(transactionTime)

      const depositToken = stepsSummary[0].fromToken
      const payoutToken = stepsSummary[stepsSummary.length - 1].toToken
      const payoutUsdValue =
        payoutToken.price != null
          ? payoutToken.realAmount * payoutToken.price
          : -1

      const ssTx: StandardTx = {
        status: 'complete',
        orderId: requestId,
        depositTxid: undefined,
        depositAddress: undefined,
        depositCurrency: depositToken.symbol,
        depositAmount: depositToken.realAmount,
        payoutTxid: undefined,
        payoutAddress: undefined,
        payoutCurrency: payoutToken.symbol,
        payoutAmount: payoutToken.realAmount,
        timestamp: time.getTime(),
        isoDate: time.toISOString(),
        usdValue: payoutUsdValue,
        rawTx
      }

      ssFormatTxs.push(ssTx)

      if (ssTx.isoDate > latestIsoDate) {
        latestIsoDate = ssTx.isoDate
      }
      if (ssTx.isoDate < oldestIsoDate) {
        oldestIsoDate = ssTx.isoDate
      }
      if (ssTx.isoDate < previousLatestIsoDate && !done) {
        datelog(`rango done: date ${ssTx.isoDate} < ${previousLatestIsoDate}`)
        done = true
      }
    }

    if (txs.length < OFFSET) {
      break
    }
    page++
  }
  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: ssFormatTxs
  }
  return out
}

export const rango: PartnerPlugin = {
  queryFunc: queryRango,
  pluginName: 'Rango Exchange',
  pluginId: 'rango'
}
