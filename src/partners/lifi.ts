import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue
} from 'cleaners'

import {
  asStandardPluginParams,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'

const asStatuses = asMaybe(asValue('DONE'), 'other')
const asToken = asObject({
  // address: asString,
  // chainId: asNumber,
  symbol: asString,
  decimals: asNumber
  // name: asString,
  // coinKey: asString,
  // logoURI: asString,
  // priceUSD: asString
})

const asTransaction = asObject({
  txHash: asString,
  // txLink: asString,
  amount: asString,
  token: asToken,
  // chainId: asNumber,
  // gasPrice: asString,
  // gasUsed: asString,
  // gasToken: asToken,
  // gasAmount: asString,
  // gasAmountUSD: asString,
  amountUSD: asOptional(asString),
  // value: asString,
  timestamp: asOptional(asNumber)
})

const asTransfer = asObject({
  // transactionId: asString,
  sending: asTransaction,
  receiving: asTransaction,
  // lifiExplorerLink: asString,
  // fromAddress: asString,
  toAddress: asString,
  // tool: asString,
  status: asString
  // substatus: asString,
  // substatusMessage: asString,
  // metadata: asObject({
  //   integrator: asString
  // })
})

// Define the cleaner for the whole JSON
const asTransfersResult = asObject({
  transfers: asArray(asTransfer)
})

type PartnerStatuses = ReturnType<typeof asStatuses>

const MAX_RETRIES = 5
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 30 // 30 days
const QUERY_TIME_BLOCK_MS = QUERY_LOOKBACK

const statusMap: { [key in PartnerStatuses]: Status } = {
  DONE: 'complete',
  other: 'other'
}

export async function queryLifi(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (latestIsoDate === '2018-01-01T00:00:00.000Z') {
    latestIsoDate = new Date('2023-01-01T00:00:00.000Z').toISOString()
  }

  let lastCheckedTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (lastCheckedTimestamp < 0) lastCheckedTimestamp = 0

  const ssFormatTxs: StandardTx[] = []
  let retry = 0
  let startTime = lastCheckedTimestamp

  while (true) {
    const endTime = startTime + QUERY_TIME_BLOCK_MS
    const now = Date.now()

    const startTimeS = startTime / 1000
    const endTimeS = endTime / 1000

    const url = `https://li.quest/v1/analytics/transfers?integrator=${apiKey}&fromTimestamp=${startTimeS}&toTimestamp=${endTimeS}`
    try {
      const response = await retryFetch(url)
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }
      const jsonObj = await response.json()
      const transferResults = asTransfersResult(jsonObj)
      for (const tx of transferResults.transfers) {
        const txTimestamp = tx.receiving.timestamp ?? tx.sending.timestamp ?? 0
        if (txTimestamp === 0) {
          throw new Error('No timestamp')
        }
        const { isoDate, timestamp } = smartIsoDateFromTimestamp(txTimestamp)

        const depositAmount =
          Number(tx.sending.amount) / 10 ** tx.sending.token.decimals

        const payoutAmount =
          Number(tx.receiving.amount) / 10 ** tx.receiving.token.decimals

        const ssTx: StandardTx = {
          status: statusMap[tx.status],
          orderId: tx.sending.txHash,
          depositTxid: tx.sending.txHash,
          depositAddress: undefined,
          depositCurrency: tx.sending.token.symbol,
          depositAmount,
          payoutTxid: undefined,
          payoutAddress: tx.toAddress,
          payoutCurrency: tx.receiving.token.symbol,
          payoutAmount,
          timestamp,
          isoDate,
          usdValue: Number(
            tx.receiving.amountUSD ?? tx.sending.amountUSD ?? '-1'
          ),
          rawTx: tx
        }
        ssFormatTxs.push(ssTx)
        if (ssTx.isoDate > latestIsoDate) {
          latestIsoDate = ssTx.isoDate
        }
      }
      const endDate = new Date(endTime)
      startTime = endTime
      datelog(
        `Lifi endDate:${endDate.toISOString()} latestIsoDate:${latestIsoDate}`
      )
      if (endTime > now) {
        break
      }
      retry = 0
    } catch (e) {
      datelog(e)
      // Retry a few times with time delay to prevent throttling
      retry++
      if (retry <= MAX_RETRIES) {
        datelog(`Snoozing ${60 * retry}s`)
        await snooze(60000 * retry)
      } else {
        // We can safely save our progress since we go from oldest to newest.
        break
      }
    }
    await snooze(3000)
  }

  const out = {
    settings: { latestIsoDate },
    transactions: ssFormatTxs
  }
  return out
}

export const lifi: PartnerPlugin = {
  queryFunc: queryLifi,
  pluginName: 'Li.Fi',
  pluginId: 'lifi'
}
