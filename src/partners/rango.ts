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
import { retryFetch } from '../util'
import { EVM_CHAIN_IDS } from '../util/chainIds'

// Start date for Rango transactions (first Edge transaction was 2024-06-23)
const RANGO_START_DATE = '2024-06-01T00:00:00.000Z'

const asRangoPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, RANGO_START_DATE)
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString),
    secret: asOptional(asString)
  })
})

const asRangoStatus = asMaybe(
  asValue('success', 'failed', 'running', 'pending'),
  'other'
)

const asBlockchainData = asObject({
  blockchain: asString,
  type: asOptional(asString),
  displayName: asOptional(asString)
})

const asToken = asObject({
  blockchainData: asBlockchainData,
  symbol: asString,
  address: asOptional(asEither(asString, asNull)),
  decimals: asNumber,
  expectedAmount: asOptional(asNumber),
  realAmount: asOptional(asNumber)
})

const asStepSummary = asObject({
  swapper: asObject({
    swapperId: asString,
    swapperTitle: asOptional(asString)
  }),
  fromToken: asToken,
  toToken: asToken,
  status: asRangoStatus,
  stepNumber: asNumber,
  sender: asOptional(asString),
  recipient: asOptional(asString),
  affiliates: asOptional(asArray(asUnknown))
})

const asRangoTx = asObject({
  requestId: asString,
  transactionTime: asString,
  status: asRangoStatus,
  stepsSummary: asArray(asStepSummary),
  feeUsd: asOptional(asNumber),
  referrerCode: asOptional(asString)
})

const asRangoResult = asObject({
  page: asOptional(asNumber),
  offset: asOptional(asNumber),
  total: asNumber,
  transactions: asArray(asUnknown)
})

const PAGE_LIMIT = 20 // API max is 20 per page
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 3 // 3 days

type RangoTx = ReturnType<typeof asRangoTx>
type RangoStatus = ReturnType<typeof asRangoStatus>

const statusMap: { [key in RangoStatus]: Status } = {
  success: 'complete',
  failed: 'failed',
  running: 'processing',
  pending: 'pending',
  other: 'other'
}

// Map Rango blockchain names to Edge pluginIds
const RANGO_BLOCKCHAIN_TO_PLUGIN_ID: Record<string, string> = {
  ARBITRUM: 'arbitrum',
  AVAX_CCHAIN: 'avalanche',
  BASE: 'base',
  BCH: 'bitcoincash',
  BINANCE: 'binance',
  BSC: 'binancesmartchain',
  BTC: 'bitcoin',
  CELO: 'celo',
  COSMOS: 'cosmoshub',
  DOGE: 'dogecoin',
  ETH: 'ethereum',
  FANTOM: 'fantom',
  LTC: 'litecoin',
  MATIC: 'polygon',
  OPTIMISM: 'optimism',
  OSMOSIS: 'osmosis',
  POLYGON: 'polygon',
  SOLANA: 'solana',
  TRON: 'tron',
  ZKSYNC: 'zksync'
}

export async function queryRango(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const { settings, apiKeys } = asRangoPluginParams(pluginParams)
  const { apiKey, secret } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null || secret == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  let startMs = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (startMs < 0) startMs = 0

  let done = false
  let page = 1

  try {
    while (!done) {
      // API: https://api-docs.rango.exchange/reference/filtertransactions
      // Endpoint: GET https://api.rango.exchange/scanner/tx/filter
      // Auth: apiKey and token (secret) in query params
      // Date range: start/end in milliseconds
      const queryParams = new URLSearchParams({
        apiKey,
        token: secret,
        limit: String(PAGE_LIMIT),
        page: String(page),
        order: 'asc', // Oldest to newest
        start: String(startMs)
      })

      const request = `https://api.rango.exchange/scanner/tx/filter?${queryParams.toString()}`

      const response = await retryFetch(request, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Rango API error ${response.status}: ${text}`)
      }

      const json = await response.json()
      const result = asRangoResult(json)

      const txs = result.transactions
      let processedCount = 0

      for (const rawTx of txs) {
        try {
          const standardTx = processRangoTx(rawTx, pluginParams)
          standardTxs.push(standardTx)
          processedCount++

          if (standardTx.isoDate > latestIsoDate) {
            latestIsoDate = standardTx.isoDate
          }
        } catch (e) {
          // Log but continue processing other transactions
          log.warn(`Failed to process tx: ${String(e)}`)
        }
      }

      const currentOffset = (page - 1) * PAGE_LIMIT + txs.length
      log(
        `Page ${page} (offset ${currentOffset}/${result.total}): processed ${processedCount}, latestIsoDate ${latestIsoDate}`
      )

      page++

      // Reached end of results
      if (txs.length < PAGE_LIMIT || currentOffset >= result.total) {
        done = true
      }
    }
  } catch (e) {
    log.error(String(e))
    // Do not throw - save progress since we query from oldest to newest
    // This ensures we don't lose transactions on transient failures
  }

  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const rango: PartnerPlugin = {
  queryFunc: queryRango,
  pluginName: 'Rango',
  pluginId: 'rango'
}

export function processRangoTx(
  rawTx: unknown,
  pluginParams: PluginParams
): StandardTx {
  const { log } = pluginParams
  const tx: RangoTx = asRangoTx(rawTx)

  // Parse the ISO date string (e.g., "2025-12-24T15:43:46.926+00:00")
  const date = new Date(tx.transactionTime)
  const timestamp = Math.floor(date.getTime() / 1000)
  const isoDate = date.toISOString()

  // Get first and last steps for deposit/payout info
  const firstStep = tx.stepsSummary[0]
  const lastStep = tx.stepsSummary[tx.stepsSummary.length - 1]

  if (firstStep == null || lastStep == null) {
    throw new Error(`Transaction ${tx.requestId} has no steps`)
  }

  // Deposit info from first step
  const depositBlockchain = firstStep.fromToken.blockchainData.blockchain
  const depositChainPluginId = RANGO_BLOCKCHAIN_TO_PLUGIN_ID[depositBlockchain]
  if (depositChainPluginId == null) {
    throw new Error(
      `Unknown Rango blockchain "${depositBlockchain}". Add mapping to RANGO_BLOCKCHAIN_TO_PLUGIN_ID.`
    )
  }
  const depositEvmChainId = EVM_CHAIN_IDS[depositChainPluginId]

  // Payout info from last step
  const payoutBlockchain = lastStep.toToken.blockchainData.blockchain
  const payoutChainPluginId = RANGO_BLOCKCHAIN_TO_PLUGIN_ID[payoutBlockchain]
  if (payoutChainPluginId == null) {
    throw new Error(
      `Unknown Rango blockchain "${payoutBlockchain}". Add mapping to RANGO_BLOCKCHAIN_TO_PLUGIN_ID.`
    )
  }
  const payoutEvmChainId = EVM_CHAIN_IDS[payoutChainPluginId]

  // Get amounts - prefer realAmount, fall back to expectedAmount
  const depositAmount =
    firstStep.fromToken.realAmount ?? firstStep.fromToken.expectedAmount ?? 0
  const payoutAmount =
    lastStep.toToken.realAmount ?? lastStep.toToken.expectedAmount ?? 0

  const dateStr = isoDate.split('T')[0]
  const depositCurrency = firstStep.fromToken.symbol
  const depositTokenId = firstStep.fromToken.address ?? null
  const payoutCurrency = lastStep.toToken.symbol
  const payoutTokenId = lastStep.toToken.address ?? null

  log(
    `${dateStr} ${depositCurrency} ${depositAmount} ${depositChainPluginId}${
      depositTokenId != null ? ` ${depositTokenId}` : ''
    } -> ${payoutCurrency} ${payoutAmount} ${payoutChainPluginId}${
      payoutTokenId != null ? ` ${payoutTokenId}` : ''
    }`
  )

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.requestId,
    countryCode: null,
    depositTxid: undefined,
    depositAddress: firstStep.sender,
    depositCurrency: firstStep.fromToken.symbol,
    depositChainPluginId,
    depositEvmChainId,
    depositTokenId,
    depositAmount,
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: undefined,
    payoutAddress: lastStep.recipient,
    payoutCurrency: lastStep.toToken.symbol,
    payoutChainPluginId,
    payoutEvmChainId,
    payoutTokenId: lastStep.toToken.address ?? null,
    payoutAmount,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }

  return standardTx
}
