import {
  asArray,
  asBoolean,
  asEither,
  asMaybe,
  asNull,
  asNumber,
  asObject,
  asString,
  asUnknown
} from 'cleaners'

import {
  asStandardPluginParams,
  EDGE_APP_START_DATE,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import {
  describeRawTx,
  retryFetch,
  smartIsoDateFromTimestamp,
  snooze
} from '../util'
import { createTokenId, EdgeTokenId, tokenTypes } from '../util/asEdgeTokenId'

const asMptradeToken = asObject({
  address: asString,
  symbol: asString,
  decimals: asNumber,
  // Base units
  amount: asString,
  chainId: asNumber,
  isNative: asMaybe(asBoolean)
})

const asMptradeOnchainTx = asObject({
  toAddress: asMaybe(asString),
  // Unix seconds. Older records carry it as a numeric string.
  timestamp: asEither(asNumber, asString),
  paymentToken: asMptradeToken
})

// Only txId and status are required outright. Every other block is read with
// asMaybe because MoonPay Trade leaves it null until the order reaches that
// stage (dstTx is null on pending and failed orders), and processMptradeTx
// decides which combinations are still reportable.
const asMptradeTx = asObject({
  txId: asString,
  status: asString,
  srcTxHash: asMaybe(asString),
  dstTxHash: asMaybe(asString),
  usdValue: asMaybe(asNumber),
  usdRates: asMaybe(asObject({ timestamp: asNumber })),
  srcTx: asMaybe(asMptradeOnchainTx),
  dstTx: asMaybe(asMptradeOnchainTx),
  actionRequest: asMaybe(asObject({ recipient: asMaybe(asString) })),
  // The quote the order was created from
  actionResponse: asMaybe(
    asObject({
      amountIn: asMaybe(asMptradeToken),
      amountOut: asMaybe(asMptradeToken)
    })
  )
})

const asMptradeResult = asObject({
  txs: asArray(asUnknown),
  cursor: asObject({
    next: asEither(asString, asNull)
  })
})

type MptradeTx = ReturnType<typeof asMptradeTx>
type MptradeToken = ReturnType<typeof asMptradeToken>

/**
 * Fetches one page of orders created between two Unix-second bounds and
 * returns the response body. Injectable so tests can drive the walk.
 */
export type FetchMptradePage = (
  apiKey: string,
  startDate: number,
  endDate: number,
  cursor: string | undefined
) => Promise<unknown>

interface BlockResult {
  standardTxs: StandardTx[]
  skipped: number
}

/**
 * 'failed' means the block could not be read; 'overflow' means it holds more
 * orders than the page cap allows.
 */
type BlockOutcome = BlockResult | 'failed' | 'overflow'

interface EdgeAsset {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

const API_URL = 'https://api-v2.swaps.xyz/api/getTransactions'
const PLUGIN_START_DATE = '2026-09-01T00:00:00.000Z'
const MAX_RETRIES = 5
// The API rejects a larger page
const LIMIT = 50
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const QUERY_TIME_BLOCK_MS = QUERY_LOOKBACK
const MIN_QUERY_TIME_BLOCK_MS = 1000 * 60 // 1 minute

// Hard ceiling on pages per time block. Paging already ends on the partner's
// own signal (a null cursor), which leaves termination up to the partner: a
// cursor that never runs out would spin the worker and grow the in-memory batch
// without bound. A block is returned newest first, so one that hits the cap
// cannot be resumed part way; the walk narrows the block and reads it again.
const MAX_PAGES = 200

// MoonPay Trade gives the native asset of every chain this address
const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000'

const statusMap: { [status: string]: Status | undefined } = {
  success: 'complete',
  completed: 'complete',
  submitted: 'processing',
  pending: 'pending',
  'not yet created': 'pending',
  'requires refund': 'refunded',
  refunded: 'refunded',
  failed: 'failed',
  expired: 'expired'
}

/**
 * MoonPay Trade chain id -> Edge currency pluginId. The ids are the real EVM
 * chain id where one exists and a synthetic id otherwise. Mirrors
 * src/mappings/mptrade.ts in edge-exchange-plugins, plus HyperCore, which
 * MoonPay Trade routes but Edge has no currency plugin for.
 *
 * REVERSE_EVM_CHAIN_IDS cannot stand in for this: MoonPay Trade's 314 is
 * native Filecoin, not Filecoin FEVM.
 */
const MPTRADE_CHAIN_IDS: Record<number, string> = {
  1: 'ethereum',
  10: 'optimism',
  30: 'rsk',
  56: 'binancesmartchain',
  61: 'ethereumclassic',
  137: 'polygon',
  143: 'monad',
  146: 'sonic',
  204: 'opbnb',
  250: 'fantom',
  295: 'hedera',
  314: 'filecoin',
  324: 'zksync',
  369: 'pulsechain',
  999: 'hyperevm',
  1337: 'hypercore',
  1816: 'cardano',
  2000: 'dogecoin',
  2741: 'abstract',
  3637: 'botanix',
  4663: 'robinhood',
  8453: 'base',
  10000: 'bitcoincash',
  10001: 'ethereumpow',
  42161: 'arbitrum',
  42220: 'celo',
  43114: 'avalanche',
  60808: 'bobevm',
  728126428: 'tron',
  999000301: 'digibyte',
  999000313: 'bitcoin',
  999000322: 'zcash',
  999000323: 'litecoin',
  999000331: 'bitcoinsv',
  999000337: 'ton',
  999000338: 'stellar',
  999000342: 'ravencoin',
  999000343: 'monero',
  999000346: 'ripple',
  999000358: 'tezos',
  999000416: 'dash',
  999000419: 'algorand',
  999000433: 'cosmoshub',
  999000446: 'osmosis',
  999000455: 'pivx',
  999000920: 'ecash',
  999000938: 'sui',
  999000955: 'qtum',
  1399811149: 'solana'
}

export const queryMptrade = async (
  pluginParams: PluginParams,
  fetchPage: FetchMptradePage = defaultFetchMptradePage
): Promise<PluginResult> => {
  const { log } = pluginParams
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  // An empty string is what an unprovisioned partner entry looks like in Couch,
  // so treat it as unconfigured rather than calling the API with no credential.
  if (apiKey == null || apiKey === '') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  if (latestIsoDate === EDGE_APP_START_DATE) {
    latestIsoDate = PLUGIN_START_DATE
  }

  // Keyed by order id: both ends of a time block are inclusive, so an order on
  // a boundary is returned by two blocks, and a duplicate order id would
  // conflict on the Couch bulk insert.
  const standardTxs = new Map<string, StandardTx>()
  // Orders dropped because they could not be processed, surfaced as a count
  // after the walk so a recurring mapping gap is visible.
  let skipped = 0

  // Freeze the upper time bound for the whole walk, so orders arriving
  // mid-walk cannot shift the block boundaries.
  const now = Date.now()
  let startTime = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (isNaN(startTime) || startTime < 0) startTime = 0

  // MoonPay Trade returns each block newest first, so blocks are walked oldest
  // to newest and progress advances one completed block at a time. A run that
  // fails part way keeps the blocks it finished.
  let blockMs = QUERY_TIME_BLOCK_MS
  while (startTime < now) {
    const endTime = Math.min(startTime + blockMs, now)
    const block = await queryBlock(
      apiKey,
      startTime,
      endTime,
      pluginParams,
      fetchPage
    )
    if (block === 'failed') break
    if (block === 'overflow') {
      const spanMs = endTime - startTime
      if (spanMs <= MIN_QUERY_TIME_BLOCK_MS) {
        log.error(
          `MoonPay Trade: more than ${MAX_PAGES} pages in a ${spanMs}ms block; progress is held at ${latestIsoDate}`
        )
        break
      }
      blockMs = Math.max(Math.floor(spanMs / 2), MIN_QUERY_TIME_BLOCK_MS)
      log.warn(
        `MoonPay Trade hit the ${MAX_PAGES}-page cap; narrowing the time block to ${blockMs}ms`
      )
      continue
    }

    for (const standardTx of block.standardTxs) {
      standardTxs.set(standardTx.orderId, standardTx)
    }
    skipped += block.skipped
    latestIsoDate = new Date(endTime).toISOString()
    startTime = endTime
    log(`MoonPay Trade latestIsoDate ${latestIsoDate}`)
  }

  if (skipped > 0) {
    log.error(
      `MoonPay Trade: ${skipped} order(s) skipped as unprocessable this run; each is logged above and needs a fix plus a backfill`
    )
  }

  return {
    settings: { latestIsoDate },
    transactions: [...standardTxs.values()]
  }
}

export const mptrade: PartnerPlugin = {
  queryFunc: async pluginParams => await queryMptrade(pluginParams),
  pluginName: 'MoonPay Trade',
  pluginId: 'mptrade'
}

/**
 * Process one page of MoonPay Trade orders, quarantining any order that cannot
 * be processed. Letting the error propagate would stall the partner: the query
 * retries the same page, gives up, and every later run dies on the same order,
 * so nothing newer is recorded. The order is dropped and logged loudly instead,
 * and the rest of the page is kept.
 */
export function processMptradeTxs(
  rawTxs: unknown[],
  pluginParams: PluginParams
): BlockResult {
  const { log } = pluginParams
  const standardTxs: StandardTx[] = []
  let skipped = 0
  for (const rawTx of rawTxs) {
    try {
      standardTxs.push(processMptradeTx(rawTx, pluginParams))
    } catch (e) {
      skipped++
      log.error(
        `MoonPay Trade: skipping unprocessable order, ingestion continues: ${String(
          e
        )}: ${describeRawTx(rawTx, ['txId'])}`
      )
    }
  }
  return { standardTxs, skipped }
}

export function processMptradeTx(
  rawTx: unknown,
  pluginParams: PluginParams
): StandardTx {
  const tx: MptradeTx = asMptradeTx(rawTx)

  // The on-chain legs report what actually moved. An order that has not
  // reached a leg yet falls back to the quoted amount for it.
  const depositToken = tx.srcTx?.paymentToken ?? tx.actionResponse?.amountIn
  const payoutToken = tx.dstTx?.paymentToken ?? tx.actionResponse?.amountOut
  if (depositToken == null || payoutToken == null) {
    throw new Error('Missing token details')
  }

  const { timestamp, isoDate } = smartIsoDateFromTimestamp(getTimestamp(tx))

  let status = statusMap[tx.status]
  if (status == null) {
    pluginParams.log.warn(`MoonPay Trade: unknown status "${tx.status}"`)
    status = 'other'
  }

  const depositAsset = getEdgeAsset(depositToken, pluginParams)
  const payoutAsset = getEdgeAsset(payoutToken, pluginParams)

  return {
    status,
    orderId: tx.txId,
    countryCode: null,

    depositTxid: tx.srcTxHash,
    depositAddress: tx.srcTx?.toAddress,
    depositCurrency: depositToken.symbol.toUpperCase(),
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: getAmount(depositToken),

    direction: null,
    exchangeType: 'swap',
    paymentType: null,

    payoutTxid: tx.dstTxHash,
    payoutAddress: tx.actionRequest?.recipient ?? tx.dstTx?.toAddress,
    payoutCurrency: payoutToken.symbol.toUpperCase(),
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: getAmount(payoutToken),

    timestamp,
    isoDate,

    usdValue: tx.usdValue != null && tx.usdValue > 0 ? tx.usdValue : -1,

    rawTx
  }
}

/**
 * Pages through every order in one time block. Anything other than a
 * BlockResult means the block was not read to the end, so the caller holds
 * progress before it.
 */
async function queryBlock(
  apiKey: string,
  startTime: number,
  endTime: number,
  pluginParams: PluginParams,
  fetchPage: FetchMptradePage
): Promise<BlockOutcome> {
  const { log } = pluginParams
  const standardTxs: StandardTx[] = []
  let skipped = 0
  let cursor: string | undefined
  let retry = 0

  for (let pageCount = 0; pageCount < MAX_PAGES; ) {
    let body: unknown
    try {
      body = await fetchPage(
        apiKey,
        Math.floor(startTime / 1000),
        Math.floor(endTime / 1000),
        cursor
      )
    } catch (e) {
      log.error(String(e))

      retry++
      if (retry > MAX_RETRIES) return 'failed'
      log.warn(`Snoozing ${5 * retry}s`)
      await snooze(5000 * retry)
      continue
    }

    // A response of the wrong shape will not improve on a retry
    let result: ReturnType<typeof asMptradeResult>
    try {
      result = asMptradeResult(body)
    } catch (e) {
      log.error(`MoonPay Trade: unexpected response shape: ${String(e)}`)
      return 'failed'
    }

    const page = processMptradeTxs(result.txs, pluginParams)
    standardTxs.push(...page.standardTxs)
    skipped += page.skipped

    if (result.cursor.next == null) return { standardTxs, skipped }

    cursor = result.cursor.next
    pageCount++
    retry = 0
  }

  return 'overflow'
}

const defaultFetchMptradePage: FetchMptradePage = async (
  apiKey,
  startDate,
  endDate,
  cursor
) => {
  const params = new URLSearchParams({
    limit: String(LIMIT),
    startDate: String(startDate),
    endDate: String(endDate)
  })
  if (cursor != null) params.set('cursor', cursor)

  const response = await retryFetch(`${API_URL}?${params.toString()}`, {
    headers: { 'x-api-key': apiKey }
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`MoonPay Trade error ${response.status}: ${text}`)
  }
  return await response.json()
}

function getTimestamp(tx: MptradeTx): number {
  const timestamp = Number(tx.srcTx?.timestamp ?? tx.usdRates?.timestamp)
  if (isNaN(timestamp) || timestamp <= 0) {
    throw new Error('No timestamp')
  }
  return timestamp
}

function getAmount(token: MptradeToken): number {
  return Number(token.amount) / 10 ** token.decimals
}

/**
 * Resolves a MoonPay Trade token to Edge's chain plugin id and token id. A
 * chain or token Edge cannot name leaves the field undefined rather than
 * dropping the order, whose amounts and USD value are still good.
 */
function getEdgeAsset(
  token: MptradeToken,
  pluginParams: PluginParams
): EdgeAsset {
  const { log } = pluginParams
  const chainPluginId = MPTRADE_CHAIN_IDS[token.chainId]
  if (chainPluginId == null) {
    log.warn(`MoonPay Trade: unknown chain id ${token.chainId}`)
    return { chainPluginId, evmChainId: undefined, tokenId: undefined }
  }

  const tokenType = tokenTypes[chainPluginId]
  // On EVM chains the MoonPay Trade chain id is the EVM chain id
  const evmChainId = tokenType === 'evm' ? token.chainId : undefined

  if (token.isNative === true || token.address === NATIVE_ADDRESS) {
    return { chainPluginId, evmChainId, tokenId: null }
  }
  // undefined, unlike null, means this server has no token id format for the chain
  if (tokenType === undefined) {
    return { chainPluginId, evmChainId, tokenId: undefined }
  }

  try {
    const tokenId = createTokenId(tokenType, token.symbol, token.address)
    return { chainPluginId, evmChainId, tokenId }
  } catch (e) {
    log.warn(
      `MoonPay Trade: no token id for ${
        token.symbol
      } on ${chainPluginId}: ${String(e)}`
    )
    return { chainPluginId, evmChainId, tokenId: undefined }
  }
}
