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
import URL from 'url-parse'

import {
  asStandardPluginParams,
  EDGE_APP_START_DATE,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'

const PLUGIN_START_DATE = '2023-09-01T00:00:00.000Z'
const asStatuses = asMaybe(
  asValue('created', 'completed', 'cancelled', 'payment_error', 'rejected'),
  'other'
)
type PartnerStatuses = ReturnType<typeof asStatuses>

// Basic structures
const asCurrencyCode = asString
const asAmount = asString
const asCurrency = asObject({
  amount: asAmount,
  currency: asCurrencyCode
})
// const asUserCountry = asObject({
//   name: asString,
//   code: asString
// })
// const asUser = asObject({
//   id: asString,
//   email: asString,
//   country: asUserCountry
// })
// const asExchangeRate = asObject({
//   currencyTo: asCurrency,
//   currencyFrom: asCurrency
// })
// const asFee = asObject({
//   amount: asOptional(asString), // Optional because some fees may be null
//   currency: asOptional(asString)
// })

// More complex structures
// const asBlockchain = asObject({
//   name: asString,
//   network: asString
// })
// const asCurrencyDetail = asObject({
//   id: asString,
//   name: asString,
//   currency: asObject({
//     code: asCurrencyCode
//   }),
//   blockchain: asOptional(asBlockchain)
// })
const asFromToStructure = asObject({
  // name: asString,
  // asset: asOptional(asCurrencyDetail),
  address: asOptional(asString)
  // destinationTag: asOptional(asString)
})
const asAmounts = asObject({
  spentOriginal: asCurrency,
  spentFiat: asCurrency,
  receivedOriginal: asCurrency,
  receivedFiat: asCurrency
})
// const asFees = asObject({
//   paybisFee: asFee,
//   paymentFee: asFee,
//   networkFee: asFee,
//   partnerFee: asFee,
//   partnerFeeFiat: asFee
// })
// const asRequest = asObject({
//   id: asString,
//   flow: asString,
//   createdAt: asDate
// })
const asTransaction = asObject({
  id: asString,
  gateway: asValue('crypto_to_fiat', 'fiat_to_crypto'),
  status: asString,
  from: asFromToStructure,
  to: asFromToStructure,
  // exchangeRate: asExchangeRate,
  hash: asOptional(asString),
  // explorerLink: asOptional(asString),
  createdAt: asDate,
  // paidAt: asOptional(asDate),
  // completedAt: asOptional(asDate),
  amounts: asAmounts
  // fees: asFees,
  // user: asUser,
  // request: asRequest
})
const asMeta = asObject({
  // limit: asNumber,
  // currentCursor: asOptional(asString),
  nextCursor: asOptional(asString)
})

// Cleaner for the entire structure
const asTransactions = asObject({
  data: asArray(asUnknown),
  meta: asMeta
})

/** Max fetch retries before bailing */
const MAX_RETRIES = 5

/** How many txs to query per fetch call */
const QUERY_LIMIT_TXS = 50

/**
 * How far to rollback from the last successful query
 * date when starting a new query
 */
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 30 // 30 days

/** Time period to query per loop */
const QUERY_TIME_BLOCK_MS = QUERY_LOOKBACK

const URLS = {
  prod: 'https://widget-api.paybis.com/v2/transactions',
  sandbox: 'https://widget-api.sandbox.paybis.com/v2/transactions'
}

const statusMap: { [key in PartnerStatuses]: Status } = {
  created: 'pending',
  cancelled: 'refunded',
  payment_error: 'refunded',
  completed: 'complete',
  rejected: 'refunded',
  other: 'other'
}

export async function queryPaybis(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (latestIsoDate === EDGE_APP_START_DATE) {
    latestIsoDate = new Date(PLUGIN_START_DATE).toISOString()
  }

  let lastCheckedTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (lastCheckedTimestamp < 0) lastCheckedTimestamp = 0

  const ssFormatTxs: StandardTx[] = []
  let retry = 0
  let startTime = lastCheckedTimestamp

  while (true) {
    const endTime = startTime + QUERY_TIME_BLOCK_MS
    const now = Date.now()

    try {
      let cursor: string | undefined

      while (true) {
        const urlObj = new URL(URLS.prod, true)

        const queryParams: any = {
          from: new Date(startTime).toISOString(),
          to: new Date(endTime).toISOString(),
          limit: QUERY_LIMIT_TXS
        }
        if (cursor != null) queryParams.cursor = cursor

        urlObj.set('query', queryParams)
        const url = urlObj.href

        const response = await retryFetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text)
        }
        const jsonObj = await response.json()
        const txs = asTransactions(jsonObj)
        cursor = txs.meta.nextCursor
        for (const rawTx of txs.data) {
          const tx = asTransaction(rawTx)
          const { amounts, createdAt, gateway, hash, id } = tx
          const { spentOriginal, receivedOriginal } = amounts

          const { isoDate, timestamp } = smartIsoDateFromTimestamp(
            createdAt.getTime()
          )

          const depositAmount = Number(spentOriginal.amount)
          const payoutAmount = Number(receivedOriginal.amount)
          const depositTxid = gateway === 'crypto_to_fiat' ? hash : undefined
          const payoutTxid = gateway === 'fiat_to_crypto' ? hash : undefined

          const ssTx: StandardTx = {
            status: statusMap[tx.status],
            orderId: id,
            depositTxid,
            depositAddress: undefined,
            depositCurrency: spentOriginal.currency,
            depositAmount,
            payoutTxid,
            payoutAddress: tx.to.address ?? undefined,
            payoutCurrency: receivedOriginal.currency,
            payoutAmount,
            timestamp,
            isoDate,
            usdValue: -1,
            rawTx
          }
          ssFormatTxs.push(ssTx)
          if (ssTx.isoDate > latestIsoDate) {
            latestIsoDate = ssTx.isoDate
          }
        }
        if (cursor == null) {
          break
        } else {
          datelog(`Get nextCursor: ${cursor}`)
        }
      }

      const endDate = new Date(endTime)
      startTime = endTime
      datelog(
        `Paybis endDate:${endDate.toISOString()} latestIsoDate:${latestIsoDate}`
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
    await snooze(1000)
  }

  const out = {
    settings: { latestIsoDate },
    transactions: ssFormatTxs
  }
  return out
}

export const paybis: PartnerPlugin = {
  queryFunc: queryPaybis,
  pluginName: 'Paybis',
  pluginId: 'paybis'
}
