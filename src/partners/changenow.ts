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
import { datelog, retryFetch, snooze } from '../util'

const asChangeNowStatus = asMaybe(
  asValue('finished', 'waiting', 'expired'),
  'other'
)

const asChangeNowTx = asObject({
  createdAt: asString,
  requestId: asString,
  status: asChangeNowStatus,
  payin: asObject({
    currency: asString,
    address: asString,
    amount: asOptional(asNumber),
    expectedAmount: asOptional(asNumber),
    hash: asOptional(asString)
  }),
  payout: asObject({
    currency: asString,
    address: asString,
    amount: asOptional(asNumber),
    expectedAmount: asOptional(asNumber),
    hash: asOptional(asString)
  })
})

const asChangeNowResult = asObject({ exchanges: asArray(asUnknown) })

type ChangeNowTx = ReturnType<typeof asChangeNowTx>
type ChangeNowStatus = ReturnType<typeof asChangeNowStatus>

const MAX_RETRIES = 5
const LIMIT = 200
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

const statusMap: { [key in ChangeNowStatus]: Status } = {
  finished: 'complete',
  waiting: 'pending',
  expired: 'expired',
  other: 'other'
}

export const queryChangeNow = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const ssFormatTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let offset = 0
  let retry = 0
  while (true) {
    const url = `https://api.changenow.io/v2/exchanges?sortDirection=ASC&limit=${LIMIT}&dateFrom=${previousLatestIsoDate}&offset=${offset}`

    try {
      const response = await retryFetch(url, {
        method: 'GET',
        headers: {
          'x-changenow-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      })
      if (!response.ok) {
        const text = await response.text()
        datelog(`Error in offset:${offset}`)
        throw new Error(text)
      }
      const result = await response.json()
      const txs = asChangeNowResult(result).exchanges

      if (txs.length === 0) {
        break
      }
      for (const rawTx of txs) {
        let tx: ChangeNowTx
        try {
          tx = asChangeNowTx(rawTx)
        } catch (e) {
          datelog(e)
          throw e
        }
        const date = new Date(
          tx.createdAt.endsWith('Z') ? tx.createdAt : tx.createdAt + 'Z'
        )
        const timestamp = date.getTime() / 1000
        const ssTx: StandardTx = {
          status: statusMap[tx.status],
          orderId: tx.requestId,
          depositTxid: tx.payin.hash,
          depositAddress: tx.payin.address,
          depositCurrency: tx.payin.currency.toUpperCase(),
          depositAmount: tx.payin.amount ?? tx.payin.expectedAmount ?? 0,
          payoutTxid: tx.payout.hash,
          payoutAddress: tx.payout.address,
          payoutCurrency: tx.payout.currency.toUpperCase(),
          payoutAmount: tx.payout.amount ?? tx.payout.expectedAmount ?? 0,
          timestamp,
          isoDate: date.toISOString(),
          usdValue: -1,
          rawTx
        }
        ssFormatTxs.push(ssTx)
        if (ssTx.isoDate > latestIsoDate) {
          latestIsoDate = ssTx.isoDate
        }
      }
      datelog(`ChangeNow offset ${offset} latestIsoDate ${latestIsoDate}`)
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
    transactions: ssFormatTxs
  }
  return out
}

export const changenow: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryChangeNow,
  // results in a PluginResult
  pluginName: 'Changenow',
  pluginId: 'changenow'
}
