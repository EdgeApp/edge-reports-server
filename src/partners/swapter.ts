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

// Only the fields consumed by processSwapterTx are required strictly. Fields
// that never feed StandardTx (info.type, info.link, deposit/withdraw.network,
// the partner block) use asMaybe so an unexpected encoding degrades that field
// instead of throwing out of the whole page (which would abort or, with the
// retry loop, re-fetch the page).
const asSwapterTx = asObject({
  info: asObject({
    uid: asString,
    status: asSwapterStatus,
    type: asMaybe(asString),
    link: asMaybe(asString),
    equivalent: asNumber
  }),
  deposit: asObject({
    coin: asString,
    network: asMaybe(asString),
    amount: asNumber,
    actual: asMaybe(asNumber),
    address: asString,
    memo: asMaybe(asString)
  }),
  withdraw: asObject({
    coin: asString,
    network: asMaybe(asString),
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
  partner: asMaybe(
    asObject({
      name: asMaybe(asString),
      profit: asMaybe(
        asObject({
          amount: asMaybe(asNumber),
          percent: asMaybe(asNumber)
        })
      )
    })
  )
})

const asSwapterResult = asObject({
  page: asNumber,
  total: asNumber,
  data: asArray(asUnknown)
})

type SwapterTx = ReturnType<typeof asSwapterTx>
type SwapterStatus = ReturnType<typeof asSwapterStatus>

const MAX_RETRIES = 5

// Hard ceiling on pages per run. Every loop below already terminates on the
// partner's own signal, but that makes termination the partner's decision: a
// stuck cursor or a page that never shortens would spin the worker and grow the
// in-memory batch without bound. Hitting the cap ends the run WITHOUT advancing
// progress, so the unread remainder is simply re-queried next cycle, exactly
// like the retry-exhaustion path.
const MAX_PAGES = 200
const LIMIT = 200
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

const statusMap: { [key in SwapterStatus]: Status } = {
  Waiting: 'pending',
  Confirmation: 'processing',
  Exchanging: 'processing',
  Sending: 'processing',
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
  const latestIsoDate =
    typeof settings.latestIsoDate === 'string'
      ? settings.latestIsoDate
      : new Date(0).toISOString()

  // An empty string is what an unprovisioned partner entry looks like in Couch,
  // so treat it as unconfigured exactly as nym, revolut and nexchange do rather
  // than calling Swapter every cycle with no credential.
  if (apiKey == null || apiKey === '') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  // Preserve the pre-run progress marker. latestIsoDate only advances once
  // pagination completes cleanly; if retries are exhausted mid-run we return
  // the original marker so the next cycle re-fetches the unfinished window
  // rather than skipping older, never-fetched pages.
  const startIsoDate = latestIsoDate
  let newLatestIsoDate = latestIsoDate
  let completed = false

  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0

  // Freeze the upper time bound for the whole pagination walk. Recomputing
  // Date.now() per page would shift the window and page boundaries if orders
  // arrive mid-walk, which can skip or duplicate rows before completion.
  const queryTimeTo = Date.now()

  let page = 1
  let retry = 0

  let pageCount = 0
  for (; pageCount < MAX_PAGES; pageCount++) {
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
            timeTo: queryTimeTo
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

      if (txs.length === 0) {
        completed = true
        break
      }

      // Buffer this page so a mid-page throw is retried idempotently: the
      // buffer is discarded on error, so already-processed rows are never
      // appended twice (which would create duplicate orderIds and Couch _id
      // conflicts on bulk insert).
      const pageTxs: StandardTx[] = []
      for (const rawTx of txs) {
        const standardTx = processSwapterTx(rawTx, pluginParams)
        pageTxs.push(standardTx)
        if (standardTx.isoDate > newLatestIsoDate) {
          newLatestIsoDate = standardTx.isoDate
        }
      }
      standardTxs.push(...pageTxs)

      log(`Swapter page ${page} latestIsoDate ${newLatestIsoDate}`)

      const loaded = page * LIMIT
      if (loaded >= result.total) {
        completed = true
        break
      }

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

  if (pageCount >= MAX_PAGES) {
    log.warn(
      `Swapter hit the ${MAX_PAGES}-page cap; progress is not advanced, so the remainder is re-queried next run`
    )
  }

  return {
    settings: { latestIsoDate: completed ? newLatestIsoDate : startIsoDate },
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
