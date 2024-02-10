import {
  asArray,
  asEither,
  asMaybe,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp } from '../util'

const asExolixPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, '0')
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString)
  })
})

const asExolixStatus = asMaybe(
  asValue(
    'success',
    'wait',
    'overdue',
    'refunded',
    'confirmed',
    'sending',
    'exchanging'
  ),
  'other'
)

const asExolixTx = asObject({
  id: asString,
  status: asExolixStatus,
  coinFrom: asObject({
    coinCode: asString
  }),
  coinTo: asObject({
    coinCode: asString
  }),
  amount: asNumber,
  amountTo: asNumber,
  depositAddress: asString,
  withdrawalAddress: asString,
  hashIn: asObject({
    hash: asEither(asString, asNull)
  }),
  hashOut: asObject({
    hash: asEither(asString, asNull)
  }),
  createdAt: asString
})

const asExolixResult = asObject({
  data: asArray(asUnknown)
})

const PAGE_LIMIT = 100
const QUERY_LOOKBACK = 60 * 60 * 24 * 3 // 3 days

type ExolixTx = ReturnType<typeof asExolixTx>
type ExolixStatus = ReturnType<typeof asExolixStatus>
const statusMap: { [key in ExolixStatus]: Status } = {
  success: 'complete',
  exchanging: 'processing',
  wait: 'pending',
  overdue: 'expired',
  refunded: 'refunded',
  confirmed: 'other',
  sending: 'processing',
  other: 'other'
}

type Response = ReturnType<typeof fetch>

export async function queryExolix(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asExolixPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const ssFormatTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let done = false
  let page = 1

  while (!done) {
    let oldestIsoDate = '999999999999999999999999999999999999'
    let result
    const request = `https://exolix.com/api/v2/transactions?page=${page}&size=${PAGE_LIMIT}`
    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${apiKey}`
      }
    }

    const response = await retryFetch(request, options)

    if (response.ok) {
      result = asExolixResult(await response.json())
    }

    const txs = result.data
    for (const rawTx of txs) {
      let tx: ExolixTx
      try {
        tx = asExolixTx(rawTx)
      } catch (e) {
        datelog(e)
        throw e
      }
      const dateInMillis = Date.parse(tx.createdAt)
      const { isoDate, timestamp } = smartIsoDateFromTimestamp(dateInMillis)
      const ssTx: StandardTx = {
        status: statusMap[tx.status],
        orderId: tx.id,
        depositTxid: tx.hashIn?.hash ?? '',
        depositAddress: tx.depositAddress,
        depositCurrency: tx.coinFrom.coinCode,
        depositAmount: tx.amount,
        payoutTxid: tx.hashOut?.hash ?? '',
        payoutAddress: tx.withdrawalAddress,
        payoutCurrency: tx.coinTo.coinCode,
        payoutAmount: tx.amountTo,
        timestamp,
        isoDate,
        usdValue: -1,
        rawTx
      }

      ssFormatTxs.push(ssTx)
      if (isoDate > latestIsoDate) {
        latestIsoDate = isoDate
      }
      if (isoDate < oldestIsoDate) {
        oldestIsoDate = isoDate
      }
      if (isoDate < previousLatestIsoDate && !done) {
        datelog(`Exolix done: date ${isoDate} < ${previousLatestIsoDate}`)
        done = true
      }
    }
    page++
    datelog(`Exolix oldestIsoDate ${oldestIsoDate}`)

    // reached end of database
    if (txs.length < PAGE_LIMIT) {
      done = true
    }
  }

  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: ssFormatTxs
  }
  return out
}

export const exolix: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryExolix,
  // results in a PluginResult
  pluginName: 'Exolix',
  pluginId: 'exolix'
}
