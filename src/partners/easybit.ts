import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
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
import { datelog, retryFetch, snooze, smartIsoDateFromTimestamp } from '../util'

// Map EasyBit's status values to Edge's status values
const asEasyBitStatus = asMaybe(
  asValue('Awaiting Deposit', 'Confirming Deposit', 'Exchanging', 'Sending', 'Complete', 'Refund', 'Failed', 'Volatility Protection', 'Action Request', 'Request Overdue'),
  'other'
)

const asEasyBitTx = asObject({
  id: asString,
  send: asString,
  receive: asString,
  sendNetwork: asString,
  receiveNetwork: asString,
  sendAmount: asString,
  receiveAmount: asString,
  sendAddress: asString,
  receiveAddress: asString,
  refundAddress: asOptional(asString),
  status: asEasyBitStatus,
  hashIn: asOptional(asArray(asString)),
  hashOut: asOptional(asArray(asString)),
  createdAt: asNumber,
  updatedAt: asNumber
})

const asEasyBitResult = asObject({
  success: asNumber,
  data: asArray(asUnknown)
})

type EasyBitTx = ReturnType<typeof asEasyBitTx>
type EasyBitStatus = ReturnType<typeof asEasyBitStatus>

const MAX_RETRIES = 5
const LIMIT = 2000
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5
const API_BASE = 'https://api.easybit.com'

const statusMap: { [key in EasyBitStatus]: Status } = {
  'Complete': 'complete',
  'Awaiting Deposit': 'pending',
  'Confirming Deposit': 'processing',
  'Exchanging': 'processing',
  'Sending': 'processing',
  'Request Overdue': 'expired',
  'Refund': 'refunded',
  'Failed': 'expired',
  'Volatility Protection': 'expired',
  'Action Request': 'blocked',
  'other': 'other'
}

export const queryEasyBit = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []

  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  let previousLatestTimestamp = previousTimestamp

  let retry = 0
  let hasMore = true
  let lastCreatedAt: number | null = null

  while (hasMore) {
    try {
      const params = new URLSearchParams()
      params.append('limit', String(LIMIT))
      params.append('dateFrom', String(previousLatestTimestamp))

      const url = `${API_BASE}/orders?${params.toString()}`

      datelog(`EasyBit querying from timestamp: ${previousLatestTimestamp}`)

      const response = await retryFetch(url, {
        method: 'GET',
        headers: {
          'API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const text = await response.text()
        datelog(`EasyBit error:`, response.status, text)
        throw new Error(`EasyBit API error: ${response.status} - ${text}`)
      }

      const result = await response.json()
      const parsedResult = asEasyBitResult(result)

      if (parsedResult.success !== 1) {
        datelog(`EasyBit API returned error:`, result)
        throw new Error('EasyBit API returned error response')
      }

      const txs = parsedResult.data

      if (txs.length === 0) {
        datelog('EasyBit: No more transactions')
        hasMore = false
        break
      }

      for (const rawTx of txs) {
        try {
          const standardTx = processEasyBitTx(rawTx)
          standardTxs.push(standardTx)

          if (standardTx.isoDate > latestIsoDate) {
            latestIsoDate = standardTx.isoDate
          }

          const tx = asEasyBitTx(rawTx)
          if (lastCreatedAt == null || tx.createdAt > lastCreatedAt) {
            lastCreatedAt = tx.createdAt
          }
        } catch (e) {
          datelog('EasyBit: Error processing transaction:', e, rawTx)
        }
      }

      datelog(
        `EasyBit fetched ${txs.length} transactions, latestIsoDate: ${latestIsoDate}`
      )

      if (txs.length < LIMIT) {
        hasMore = false
      } else {
        if (lastCreatedAt != null) {
          previousLatestTimestamp = lastCreatedAt + 1
        } else {
          const lastTx = asEasyBitTx(txs[txs.length - 1])
          previousLatestTimestamp = lastTx.createdAt + 1
        }
      }

      retry = 0
    } catch (e) {
      datelog('EasyBit query error:', e)
      retry++
      if (retry <= MAX_RETRIES) {
        const delayMs = 5000 * retry
        datelog(`EasyBit: Retrying in ${delayMs / 1000}s (attempt ${retry}/${MAX_RETRIES})`)
        await snooze(delayMs)
      } else {
        datelog('EasyBit: Max retries reached, saving progress')
        break
      }
    }
  }

  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const easybit: PartnerPlugin = {
  queryFunc: queryEasyBit,
  pluginName: 'EasyBit',
  pluginId: 'easybit'
}

export function processEasyBitTx(rawTx: unknown): StandardTx {
  const tx: EasyBitTx = asEasyBitTx(rawTx)
  const dateInfo = smartIsoDateFromTimestamp(tx.createdAt)
  const depositTxid =
    tx.hashIn != null && tx.hashIn.length > 0 ? tx.hashIn[0] : undefined
  const payoutTxid =
    tx.hashOut != null && tx.hashOut.length > 0 ? tx.hashOut[0] : undefined

  const depositAmount = parseFloat(tx.sendAmount) || 0
  const payoutAmount = parseFloat(tx.receiveAmount) || 0

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.id,
    countryCode: null,
    depositTxid,
    depositAddress: tx.sendAddress,
    depositCurrency: tx.send.toUpperCase(),
    depositAmount,
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid,
    payoutAddress: tx.receiveAddress,
    payoutCurrency: tx.receive.toUpperCase(),
    payoutAmount,
    timestamp: dateInfo.timestamp,
    isoDate: dateInfo.isoDate,
    usdValue: -1,
    rawTx
  }

  return standardTx
}