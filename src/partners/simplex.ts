import {
  asArray,
  asDate,
  asMaybe,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  FiatPaymentType,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  ScopedLog,
  StandardTx,
  Status
} from '../types'
import { describeRawTx, fetchWithBackoff, retryFetch, snooze } from '../util'

const REPORTING_URL =
  'https://backend-wallet-api.simplexcc.com/reporting/v1/payments'
const API_START_DATE = new Date('2020-08-10T00:00:00.000Z').getTime() / 1000
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days
const QUERY_WINDOW = 60 * 60 * 24 * 30 // 30 days
const LIMIT = 100
// Bounds both the response and its body. A connection cut partway through a body
// otherwise never settles, which would hold the app's whole query loop.
const REQUEST_TIMEOUT_MS = 1000 * 60

/**
 * The API documents amounts as numbers, but Simplex's previous API returned its
 * documented numbers as strings, so this accepts both.
 */
const asAmount = (raw: unknown): number => {
  const amount = typeof raw === 'string' ? parseFloat(raw) : asNumber(raw)
  if (isNaN(amount)) throw new TypeError(`Expected an amount, got ${raw}`)
  return amount
}

const asSimplexStatus = asMaybe(asValue('approved', 'refunded'), 'other')
type SimplexStatus = ReturnType<typeof asSimplexStatus>

const asSimplexPayment = asObject({
  payment_id: asString,
  created_at: asDate,
  payment_status: asSimplexStatus,
  blockchain_txn_id: asOptional(asString),
  payment_method: asOptional(asString),
  fiat_total: asObject({
    amount: asAmount,
    amount_usd: asAmount,
    currency: asString
  }),
  crypto_total: asObject({
    amount: asAmount,
    currency: asString
  }),
  references: asOptional(
    asObject({
      order_id: asOptional(asString)
    })
  ),
  country: asOptional(asString)
})

const asSimplexPage = asObject({
  data: asArray(asUnknown),
  paging: asOptional(
    asObject({
      cursors: asOptional(
        asObject({
          after: asOptional(asString)
        })
      )
    })
  )
})

const asSimplexParams = asObject({
  apiKeys: asObject({
    apiKey: asOptional(asString)
  }),
  settings: asObject({
    lastTimestamp: asOptional(asNumber, API_START_DATE)
  })
})

const statusMap: { [key in SimplexStatus]: Status } = {
  approved: 'complete',
  refunded: 'refunded',
  other: 'other'
}

const paymentTypeMap: { [key: string]: FiatPaymentType } = {
  credit_card: 'credit'
}

/** The network and timer calls the plugin makes, so tests can replace them. */
export interface SimplexIo {
  fetch: typeof retryFetch
  snooze: typeof snooze
}

const defaultSimplexIo: SimplexIo = { fetch: retryFetch, snooze }

interface WindowResult {
  standardTxs: StandardTx[]
  skipped: number
}

export async function querySimplex(
  pluginParams: PluginParams,
  io: SimplexIo = defaultSimplexIo
): Promise<PluginResult> {
  const { log } = pluginParams
  const { apiKeys, settings } = asSimplexParams(pluginParams)
  const { apiKey } = apiKeys
  const { lastTimestamp } = settings

  if (apiKey == null) {
    return { settings: { lastTimestamp }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  const now = Date.now() / 1000
  let startTime = Math.max(lastTimestamp - QUERY_LOOKBACK, API_START_DATE)

  // Each query re-reads the lookback so refunds reach recent payments, so its
  // start is not progress. Only a completed window moves this, never backward.
  let progress = lastTimestamp
  let skipped = 0
  let queryError: string | undefined
  while (startTime < now) {
    const endTime = Math.min(startTime + QUERY_WINDOW, now)
    try {
      const window = await queryWindow(startTime, endTime, apiKey, log, io)
      standardTxs.push(...window.standardTxs)
      skipped += window.skipped
      progress = Math.max(progress, endTime)
      startTime = endTime
    } catch (e) {
      queryError = String(e)
      log.error(queryError)

      // The completed windows are safe to save, since windows run oldest first.
      // Pages run newest first, so a partial window would skip its older pages.
      break
    }
  }

  if (skipped > 0 && queryError == null) {
    queryError = `Simplex: ${skipped} payment(s) skipped as unprocessable this run; each is logged above and needs a mapping fix plus a backfill`
    log.error(queryError)
  }

  return {
    settings: { lastTimestamp: progress },
    transactions: standardTxs,
    error: queryError
  }
}

async function queryWindow(
  startTime: number,
  endTime: number,
  apiKey: string,
  log: ScopedLog,
  io: SimplexIo
): Promise<WindowResult> {
  const standardTxs: StandardTx[] = []
  let skipped = 0
  const startAt = new Date(startTime * 1000).toISOString()
  const endAt = new Date(endTime * 1000).toISOString()

  let cursor: string | undefined
  while (true) {
    const params = new URLSearchParams({
      start_at: startAt,
      end_at: endAt,
      limit: String(LIMIT)
    })
    if (cursor != null) params.set('cursor', cursor)
    const url = `${REPORTING_URL}?${params.toString()}`

    log(`Querying ${startAt}->${endAt}, limit=${LIMIT}`)
    const response = await fetchWithBackoff(
      async () =>
        await io.fetch(url, {
          headers: { Authorization: `ApiKey ${apiKey}` },
          timeout: REQUEST_TIMEOUT_MS
        }),
      `Failed to fetch Simplex payments from ${startAt}`,
      log,
      io.snooze
    )

    const page = asSimplexPage(await response.json())
    for (const rawTx of page.data) {
      // The API only guarantees payment_id on a row. Quarantine one it cannot
      // process, since throwing would fail the same row on every later run and
      // stop anything newer from being recorded.
      try {
        standardTxs.push(processSimplexTx(rawTx, log))
      } catch (e) {
        skipped++
        log.error(
          `Simplex: skipping unprocessable payment, ingestion continues: ${String(
            e
          )}: ${describeRawTx(rawTx, ['payment_id'])}`
        )
      }
    }

    cursor = page.paging?.cursors?.after
    if (cursor == null || cursor === '' || page.data.length === 0) break
  }
  return { standardTxs, skipped }
}

export const simplex: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: async pluginParams => await querySimplex(pluginParams),
  // results in a PluginResult
  pluginName: 'Simplex',
  pluginId: 'simplex'
}

export function processSimplexTx(rawTx: unknown, log: ScopedLog): StandardTx {
  const tx = asSimplexPayment(rawTx)

  let paymentType: FiatPaymentType | null = null
  if (tx.payment_method != null) {
    paymentType = paymentTypeMap[tx.payment_method] ?? null
    if (paymentType == null) {
      log.warn(
        `Unknown Simplex payment_method ${tx.payment_method} on ${tx.payment_id}`
      )
    }
  }

  // Older documents are keyed by the order id, so it stays the id when present.
  // A blank id cannot key a document and would fail the whole insert.
  const referenceId = tx.references?.order_id?.trim() ?? ''
  const orderId = referenceId !== '' ? referenceId : tx.payment_id.trim()
  if (orderId === '') throw new Error('Simplex payment has a blank id')

  const standardTx: StandardTx = {
    status: statusMap[tx.payment_status],
    orderId,
    countryCode: tx.country ?? null,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: tx.fiat_total.currency,
    depositChainPluginId: undefined,
    depositEvmChainId: undefined,
    depositTokenId: undefined,
    depositAmount: tx.fiat_total.amount,
    direction: 'buy',
    exchangeType: 'fiat',
    paymentType,
    payoutTxid: tx.blockchain_txn_id,
    payoutAddress: undefined,
    payoutCurrency: tx.crypto_total.currency,
    payoutChainPluginId: undefined,
    payoutEvmChainId: undefined,
    payoutTokenId: undefined,
    payoutAmount: tx.crypto_total.amount,
    timestamp: tx.created_at.getTime() / 1000,
    isoDate: tx.created_at.toISOString(),
    usdValue: tx.fiat_total.amount_usd,
    rawTx
  }
  return standardTx
}
