import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
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
import { datelog, retryFetch, snooze } from '../util'

const asXgramStatus = asMaybe(
  asValue('finished', 'waiting', 'time_expired'),
  'other'
)

const asXgramTx = asObject({
  date: asString,
  id: asString,
  status: asString,
  amountFrom: asMaybe(asNumber, null),
  amountTo: asMaybe(asNumber, null),
  depositAddress: asString,
  depositHash:  asMaybe(asString, undefined),
  depositTag: asMaybe(asString, null),
  destinationAddress: asString,
  destinationTag: asMaybe(asString, null),
  expectedAmountFrom: asNumber,
  expectedAmountTo: asNumber,
  from: asString,
  refundAddress: asMaybe(asString, null),
  refundTag: asMaybe(asString, null),
  to: asString,
  txId: asMaybe(asString, undefined)
})

const asXgramResult = asObject({ exchanges: asArray(asUnknown) })

type XgramTxTx = ReturnType<typeof asXgramTx>
type XgramStatus = ReturnType<typeof asXgramStatus>

const MAX_RETRIES = 5
const LIMIT = 5
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

const statusMap: { [key in XgramStatus]: Status } = {
  finished: 'complete',
  waiting: 'pending',
  time_expired: 'expired',
  other: 'other'
}

export const queryXgram = async (
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
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let offset = 1
  let retry = 0
  while (true) {
    const url = `https://xgram.io/api/v1/exchange-history?page=${offset}&limit=${LIMIT}`
    try {
      const response = await retryFetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      })
      const result = await response.json()
      const txs = asXgramResult(result).exchanges

      if (txs.length === 0) {
        break
      }
      for (const rawTx of txs) {
        const standardTx = processXgramTx(rawTx)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
      }
      datelog(`Xgram offset ${offset} latestIsoDate ${latestIsoDate}`)
      offset += txs.length
      retry = 0
    } catch (e) {
      datelog(e)
      // Retry a few times with time delay to prevent throttling
      retry++
      if (retry <= MAX_RETRIES) {
        datelog(`Snoozing ${5 * retry}s`)
        await snooze(5000 * retry)
      } else {
        // We can safely save our progress since we go from oldest to newest.
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

export const xgram: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryXgram,
  // results in a PluginResult
  pluginName: 'xgram',
  pluginId: 'xgram'
}

export function processXgramTx(rawTx: unknown): StandardTx {
  const tx: XgramTxTx = asXgramTx(rawTx)
  const [date, time] = tx.date.split(" ");
const [day, month, year] = date.split(".");
const dateN = new Date(`${year}-${month}-${day}T${time}`)
const isoString = dateN.toISOString();
  const timestamp = dateN.getTime() / 1000
  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.id,
    countryCode: null,
    depositTxid: tx.depositHash,
    depositAddress: tx.depositAddress,
    depositCurrency: tx.to.toUpperCase(),
    depositAmount: tx.amountTo ?? tx.expectedAmountTo ?? 0,
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.txId,
    payoutAddress: tx.destinationAddress,
    payoutCurrency: tx.from.toUpperCase(),
    payoutAmount: tx.amountFrom ?? tx.expectedAmountFrom ?? 0,
    timestamp,
    isoDate: isoString,
    usdValue: -1,
    rawTx
  }

  return standardTx
}
