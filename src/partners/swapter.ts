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
import { retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'

const asSwapterStatus = asMaybe(
  asValue(
    'Waiting',
    'Confirmation',
    'Exchanging',
    'Sending',
    'Success',
    'Frozen',
    'Refunded',
    'Overdue',
    'Suspended'
  ),
  'other'
)

const asSwapterTx = asObject({
  info: asObject({
    uid: asString,
    status: asSwapterStatus,
    type: asString,
    link: asString,
    equivalent: asNumber
  }),
  deposit: asObject({
    coin: asString,
    network: asString,
    amount: asNumber,
    actual: asMaybe(asNumber),
    address: asString,
    memo: asMaybe(asString)
  }),
  withdraw: asObject({
    coin: asString,
    network: asString,
    amount: asNumber,
    address: asString,
    memo: asMaybe(asString)
  }),
  time: asObject({
    create: asNumber,
    confirmation: asMaybe(asNumber),
    exchanging: asMaybe(asNumber),
    send: asMaybe(asNumber),
    success: asMaybe(asNumber),
    overdue: asMaybe(asNumber)
  }),
  partner: asObject({
    name: asString,
    profit: asObject({
      amount: asNumber,
      percent: asNumber
    })
  })
})

const asSwapterResult = asObject({
  page: asNumber,
  total: asNumber,
  data: asArray(asUnknown)
})

type SwapterTx = ReturnType<typeof asSwapterTx>
type SwapterStatus = ReturnType<typeof asSwapterStatus>

const MAX_RETRIES = 5
const LIMIT = 200
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

const statusMap: { [key in SwapterStatus]: Status } = {
  Waiting: 'pending',
  Confirmation: 'pending',
  Exchanging: 'pending',
  Sending: 'pending',
  Success: 'complete',
  Overdue: 'expired',
  Refunded: 'refunded',
  Frozen: 'other',
  Suspended: 'other',
  other: 'other'
}

export const querySwapter = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const { log } = pluginParams
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let latestIsoDate =
    typeof settings.latestIsoDate === 'string'
      ? settings.latestIsoDate
      : new Date(0).toISOString()

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []

  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0

  let page = 1
  let retry = 0

  while (true) {
    try {
      const response = await retryFetch(
        'https://api.swapter.io/personal/exchange/tool-history',
        {
          method: 'POST',
          headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            page,
            items: LIMIT,
            timeFrom: previousTimestamp,
            timeTo: Date.now()
          })
        }
      )

      if (!response.ok) {
        const text = await response.text()
        log.error(`Swapter error on page:${page}`)
        throw new Error(text)
      }

      const result = asSwapterResult(await response.json())
      const txs = result.data

      if (txs.length === 0) break

      for (const rawTx of txs) {
        const standardTx = processSwapterTx(rawTx, pluginParams)

        standardTxs.push(standardTx)

        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
      }

      log(`Swapter page ${page} latestIsoDate ${latestIsoDate}`)

      const loaded = page * LIMIT
      if (loaded >= result.total) break

      page++
      retry = 0
    } catch (e) {
      log.error(String(e))

      retry++
      if (retry <= MAX_RETRIES) {
        log.warn(`Snoozing ${5 * retry}s`)
        await snooze(5000 * retry)
      } else {
        break
      }
    }
  }

  return {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
}

export const swapter: PartnerPlugin = {
  queryFunc: querySwapter,
  pluginName: 'Swapter',
  pluginId: 'swapter'
}

export function processSwapterTx(
  rawTx: unknown,
  pluginParams: PluginParams
): StandardTx {
  const tx: SwapterTx = asSwapterTx(rawTx)

  const { timestamp, isoDate } = smartIsoDateFromTimestamp(tx.time.create)

  return {
    status: statusMap[tx.info.status],
    orderId: tx.info.uid,
    countryCode: null,

    depositTxid: undefined,
    depositAddress: tx.deposit.address,
    depositCurrency: tx.deposit.coin.toUpperCase(),
    depositChainPluginId: undefined,
    depositEvmChainId: undefined,
    depositTokenId: undefined,
    depositAmount: tx.deposit.actual ?? tx.deposit.amount,

    direction: null,
    exchangeType: 'swap',
    paymentType: null,

    payoutTxid: undefined,
    payoutAddress: tx.withdraw.address,
    payoutCurrency: tx.withdraw.coin.toUpperCase(),
    payoutChainPluginId: undefined,
    payoutEvmChainId: undefined,
    payoutTokenId: undefined,
    payoutAmount: tx.withdraw.amount,

    timestamp,
    isoDate,

    usdValue: tx.info.equivalent > 0 ? tx.info.equivalent : -1,

    rawTx
  }
}
