import {
  asArray,
  asMaybe,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'
import crypto from 'crypto'

import {
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'

const asSideshiftStatus = asMaybe(
  asValue(
    'pending',
    'processing',
    'settling',
    'settled',
    'refund',
    'refunding',
    'refunded',
    'dead',
    'review',
    'waiting'
  ),
  'other'
)

const asSideshiftTx = asObject({
  id: asString,
  status: asSideshiftStatus,
  depositAddress: asMaybe(asObject({ address: asMaybe(asString) })),
  prevDepositAddresses: asMaybe(asObject({ address: asMaybe(asString) })),
  depositAsset: asString,
  // depositMethodId: asString,
  invoiceAmount: asString,
  settleAddress: asObject({
    address: asString
  }),
  // settleMethodId: asString,
  settleAmount: asString,
  settleAsset: asString,
  createdAt: asString
})

const asSideshiftPluginParams = asObject({
  apiKeys: asObject({
    sideshiftAffiliateId: asString,
    sideshiftAffiliateSecret: asString
  }),
  settings: asObject({
    latestIsoDate: asOptional(asString, '1970-01-01T00:00:00.000Z')
  })
})

type SideshiftTx = ReturnType<typeof asSideshiftTx>
type SideshiftStatus = ReturnType<typeof asSideshiftStatus>
const asSideshiftResult = asArray(asUnknown)

const MAX_RETRIES = 5
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const QUERY_TIME_BLOCK_MS = QUERY_LOOKBACK

const statusMap: { [key in SideshiftStatus]: Status } = {
  pending: 'pending',
  processing: 'processing',
  settling: 'processing',
  settled: 'complete',
  refund: 'refunded',
  refunding: 'refunded',
  refunded: 'refunded',
  dead: 'other',
  review: 'blocked',
  waiting: 'pending',
  other: 'other'
}

function affiliateSignature(
  affiliateId: string,
  affiliateSecret: string,
  time: number
): string {
  return crypto
    .createHmac('sha1', affiliateSecret)
    .update(`${affiliateId}${time}`)
    .digest('hex')
}

export async function querySideshift(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asSideshiftPluginParams(pluginParams)
  const { sideshiftAffiliateId, sideshiftAffiliateSecret } = apiKeys
  let { latestIsoDate } = settings

  let lastCheckedTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (lastCheckedTimestamp < 0) lastCheckedTimestamp = 0

  const ssFormatTxs: StandardTx[] = []
  let retry = 0
  let startTime = lastCheckedTimestamp

  while (true) {
    const endTime = startTime + QUERY_TIME_BLOCK_MS
    const now = Date.now()

    const signature = affiliateSignature(
      sideshiftAffiliateId,
      sideshiftAffiliateSecret,
      now
    )

    const url = `https://sideshift.ai/api/affiliate/completedOrders?affiliateId=${sideshiftAffiliateId}&since=${startTime}&currentTime=${now}&signature=${signature}`
    try {
      const response = await retryFetch(url)
      if (response.ok === false) {
        const text = await response.text()
        throw new Error(text)
      }
      const jsonObj = await response.json()
      const orders = asSideshiftResult(jsonObj)
      if (orders.length === 0) {
        break
      }
      for (const order of orders) {
        let tx: SideshiftTx
        try {
          tx = asSideshiftTx(order)
        } catch (e) {
          datelog(e)
          throw e
        }
        const depositAddress =
          tx.depositAddress?.address ?? tx.prevDepositAddresses?.address
        const { isoDate, timestamp } = smartIsoDateFromTimestamp(tx.createdAt)

        const ssTx: StandardTx = {
          status: statusMap[tx.status],
          orderId: tx.id,
          depositTxid: undefined,
          depositAddress,
          depositCurrency: tx.depositAsset,
          depositAmount: Number(tx.invoiceAmount),
          payoutTxid: undefined,
          payoutAddress: tx.settleAddress.address,
          payoutCurrency: tx.settleAsset,
          payoutAmount: Number(tx.settleAmount),
          timestamp,
          isoDate,
          usdValue: undefined,
          rawTx: order
        }
        ssFormatTxs.push(ssTx)
        if (ssTx.isoDate > latestIsoDate) {
          latestIsoDate = ssTx.isoDate
        }
      }
      startTime = new Date(latestIsoDate).getTime()
      datelog(`Sideshift latestIsoDate ${latestIsoDate}`)
      if (endTime > now) {
        break
      }
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

  const out = {
    settings: { latestIsoDate },
    transactions: ssFormatTxs
  }
  return out
}

export const sideshift: PartnerPlugin = {
  queryFunc: querySideshift,
  pluginName: 'SideShift.ai',
  pluginId: 'sideshift'
}
