import {
  asArray,
  asEither,
  asJSON,
  asNull,
  asNumber,
  asObject,
  asString,
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

const API_URL = 'https://api.0x.org/trade-analytics/gasless'
const PLUGIN_START_DATE = '2024-05-05T00:00:00.000Z'
/** Max fetch retries before bailing */
const MAX_RETRIES = 5
/**
 * How far to rollback from the last successful query
 * date when starting a new query
 */
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 30 // 30 Days
/** Time period to query per loop */
const QUERY_TIME_BLOCK_MS = QUERY_LOOKBACK

type PartnerStatuses =
  | 'other'
  | 'created'
  | 'completed'
  | 'cancelled'
  | 'payment_error'
  | 'rejected'
const statusMap: { [key in PartnerStatuses]: Status } = {
  created: 'pending',
  cancelled: 'refunded',
  payment_error: 'refunded',
  completed: 'complete',
  rejected: 'refunded',
  other: 'other'
}

export async function query0xGasless(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)

  if (apiKeys.apiKey == null) {
    throw new Error('0xGasless: Missing 0xgasless API key')
  }
  const nowDate = new Date()
  const now = nowDate.getTime()

  let { latestIsoDate } = settings

  if (latestIsoDate === EDGE_APP_START_DATE) {
    latestIsoDate = new Date(PLUGIN_START_DATE).toISOString()
  }

  let lastCheckedTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (lastCheckedTimestamp < 0) lastCheckedTimestamp = 0

  const ssFormatTxs: StandardTx[] = []
  let retry = 0

  while (true) {
    let latestBlockIsoDate = latestIsoDate
    const startTimestamp = lastCheckedTimestamp
    const endTimestamp = lastCheckedTimestamp + QUERY_TIME_BLOCK_MS

    try {
      let cursor: string | undefined

      while (true) {
        const urlObj = new URL(API_URL, true)

        const queryParams: {
          startTimestamp: string
          endTimestamp: string
          cursor?: string
        } = {
          // API expects seconds-based unix timestamps
          startTimestamp: Math.floor(startTimestamp / 1000).toString(),
          endTimestamp: Math.floor(endTimestamp / 1000).toString()
        }
        if (cursor != null) queryParams.cursor = cursor
        urlObj.set('query', queryParams)

        datelog(
          `0xGasless Querying from:${new Date(
            startTimestamp
          ).toISOString()} to:${new Date(endTimestamp).toISOString()}`
        )

        const url = urlObj.href
        const response = await retryFetch(url, {
          headers: {
            '0x-api-key': apiKeys.apiKey,
            '0x-version': 'v2'
          }
        })
        const responseJson = await response.text()
        if (!response.ok) {
          throw new Error(`${url} response ${response.status}: ${responseJson}`)
        }
        const responseBody = asGetGaslessTradesResponse(responseJson)

        for (const trade of responseBody.trades) {
          const buySymbol = trade.tokens.find(t => t.address === trade.buyToken)
            ?.symbol
          const sellSymbol = trade.tokens.find(
            t => t.address === trade.sellToken
          )?.symbol

          if (buySymbol == null || sellSymbol == null) {
            throw new Error(
              `Could not find buy or sell symbol for trade ${trade.zid}; txid: ${trade.transactionHash}`
            )
          }

          const {
            isoDate: tradeIsoDate,
            timestamp: tradeTimestamp
          } = smartIsoDateFromTimestamp(trade.timestamp * 1000)

          // If trade is 2 days or older, then it's finalized according to 0x
          // documentation.
          const status: Status =
            tradeTimestamp + 2 * 24 * 60 * 60 * 1000 < now
              ? 'complete'
              : 'pending'

          const ssTx: StandardTx = {
            status,
            orderId: trade.zid,
            depositTxid: trade.transactionHash,
            depositAddress: undefined,
            depositCurrency: sellSymbol,
            depositAmount: Number(trade.sellAmount),
            payoutTxid: trade.transactionHash,
            payoutAddress: trade.taker ?? undefined,
            payoutCurrency: buySymbol,
            payoutAmount: Number(trade.buyAmount),
            timestamp: tradeTimestamp,
            isoDate: tradeIsoDate,
            usdValue: parseFloat(trade.volumeUsd),
            rawTx: trade
          }
          ssFormatTxs.push(ssTx)
          if (ssTx.isoDate > latestBlockIsoDate) {
            latestBlockIsoDate = ssTx.isoDate
          }
        }

        datelog(`0xGasless ${responseBody.trades.length} trades processed`)

        if (responseBody.nextCursor == null) {
          datelog(`0xGasless No cursor from API`)
          break
        } else {
          cursor = responseBody.nextCursor
          datelog(`0xGasless Get nextCursor: ${cursor}`)
        }
      }

      lastCheckedTimestamp = endTimestamp
      latestIsoDate = latestBlockIsoDate
      datelog(
        `0xGasless endDate:${new Date(
          lastCheckedTimestamp
        ).toISOString()} latestIsoDate:${latestIsoDate}`
      )
      if (lastCheckedTimestamp > now) {
        break
      }
      retry = 0
    } catch (error) {
      datelog(error)
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

    // Wait before next query, to prevent rate-limiting and thrashing
    await snooze(1000)
  }

  const out = {
    settings: { latestIsoDate },
    transactions: ssFormatTxs
  }
  return out
}

export const zeroxgasless: PartnerPlugin = {
  queryFunc: query0xGasless,
  pluginName: '0xGasless',
  pluginId: '0xgasless'
}

const asGetGaslessTradesResponse = asJSON(
  asObject({
    nextCursor: asEither(asString, asNull),
    trades: asArray(v => asGaslessTrade(v))
  })
)

const asGaslessTrade = asObject({
  appName: asString,
  blockNumber: asString,
  buyToken: asString,
  buyAmount: asString,
  chainId: asNumber,
  // Fee data is not used.
  // fees: {
  //   "integratorFee": null,
  //   "zeroExFee": null
  // },
  gasUsed: asString,
  protocolVersion: asString,
  sellToken: asString,
  sellAmount: asString,
  slippageBps: asEither(asString, asNull),
  taker: asString,
  timestamp: asNumber,
  tokens: asArray(v => asGaslessTradeToken(v)),
  transactionHash: asString,
  volumeUsd: asString,
  /** The 0x trade id */
  zid: asString,
  service: asValue('gasless')
})

const asGaslessTradeToken = asObject({
  address: asString,
  symbol: asString
})
