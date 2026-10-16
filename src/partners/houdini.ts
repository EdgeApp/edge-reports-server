import {
  asArray,
  asBoolean,
  asEither,
  asMaybe,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'

import {
  EDGE_APP_START_DATE,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { describeRawTx, retryFetch, snooze } from '../util'
import { createTokenId, EdgeTokenId, tokenTypes } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

const asHoudiniPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, EDGE_APP_START_DATE)
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString),
    apiSecret: asOptional(asString)
  })
})

const asHoudiniToken = asObject({
  // Null for a chain's native coin
  address: asMaybe(asString),
  // Houdini chain short name, such as 'ethereum' or 'bsc'
  chain: asString,
  symbol: asString,
  mainnet: asMaybe(asBoolean),
  chainData: asMaybe(
    asObject({
      // EVM chain id, null on non-EVM chains
      chainId: asMaybe(asNumber)
    })
  )
})

// Houdini lists inToken and outToken as required, but its own sample order
// leaves them out, so they are read with asMaybe and the order falls back to
// inSymbol / outSymbol with no chain when they are missing.
const asHoudiniOrder = asObject({
  houdiniId: asString,
  status: asNumber,
  // ISO 8601
  created: asString,
  // Decimal amounts in the token's own units
  inAmount: asNumber,
  outAmount: asNumber,
  // Houdini's own ticker, chain-suffixed for tokens ('USDTTRON', 'USDCSOL').
  // The token's symbol is the plain one and is preferred.
  inSymbol: asString,
  outSymbol: asString,
  inAmountUsd: asMaybe(asNumber),
  inToken: asMaybe(asHoudiniToken),
  outToken: asMaybe(asHoudiniToken),
  receiverAddress: asMaybe(asString),
  // Omitted on multiswap orders whose per-order setup did not complete
  depositAddress: asMaybe(asString),
  // Empty until the deposit is seen
  inHash: asMaybe(asString),
  // The payout on a finished order, the refund on a refunded one
  transactionHash: asMaybe(asString)
})

const asHoudiniPage = asObject({
  orders: asArray(asUnknown),
  totalPages: asOptional(asEither(asNumber, asNull))
})

type HoudiniOrder = ReturnType<typeof asHoudiniOrder>
type HoudiniToken = ReturnType<typeof asHoudiniToken>

/**
 * Fetches one page of orders created between two ISO dates and returns the
 * response body. Injectable so tests can drive the walk.
 */
export type FetchHoudiniPage = (
  apiKey: string,
  apiSecret: string,
  from: string,
  to: string,
  page: number
) => Promise<unknown>

interface PageResult {
  standardTxs: StandardTx[]
  skipped: number
}

interface EdgeAsset {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

const API_URL = 'https://api-partner.houdiniswap.com/v2/orders'
const MAX_RETRIES = 5
// The API rejects a larger page
const PAGE_SIZE = 100

// GET /orders only returns orders created in the last 48 hours; anything older
// drops out of the API entirely. Every run reads the whole window so status
// changes on recent orders are picked up, and progress must never fall further
// behind than this or the orders in between are lost.
const RETENTION_MS = 1000 * 60 * 60 * 48

// Hard ceiling on pages per run (20,000 orders), so a page count that never
// runs out cannot spin the worker or grow the batch without bound.
const MAX_PAGES = 200

const statusMap: { [status: number]: Status | undefined } = {
  [-2]: 'pending', // initializing
  [-1]: 'pending', // created
  0: 'pending', // waiting for the deposit
  1: 'confirming', // confirming the deposit
  2: 'processing', // exchanging
  3: 'processing', // anonymizing, private orders only
  4: 'complete',
  5: 'expired',
  6: 'failed',
  7: 'refunded',
  8: 'cancelled' // deleted
}

/**
 * Houdini chain short name -> Edge currency pluginId. Mirrors
 * src/mappings/houdini.ts in edge-exchange-plugins.
 */
const HOUDINI_CHAINS: Record<string, string> = {
  algorand: 'algorand',
  arbitrum: 'arbitrum',
  avalanche: 'avalanche',
  base: 'base',
  bitcoin: 'bitcoin',
  bitcoincash: 'bitcoincash',
  bsc: 'binancesmartchain',
  bsv: 'bitcoinsv',
  cardano: 'cardano',
  celo: 'celo',
  'cosmoshub-4': 'cosmoshub',
  dash: 'dash',
  doge: 'dogecoin',
  eCash: 'ecash',
  ethereum: 'ethereum',
  fantom: 'fantom',
  hedera: 'hedera',
  hyperevm: 'hyperevm',
  litecoin: 'litecoin',
  MON: 'monad',
  monero: 'monero',
  opbnb: 'opbnb',
  optimism: 'optimism',
  pivx: 'pivx',
  polkadot: 'polkadot',
  polygon: 'polygon',
  pulsechain: 'pulsechain',
  ripple: 'ripple',
  Robinhood: 'robinhood',
  rootstock: 'rsk',
  solana: 'solana',
  sonic: 'sonic',
  sui: 'sui',
  telos: 'telos',
  thorchain: 'thorchainrune',
  ton: 'ton',
  tron: 'tron',
  xlm: 'stellar',
  Zcash: 'zcash',
  'zksync-era': 'zksync'
}

/**
 * Houdini orders cover every route Edge sends through it: standard swaps,
 * private (anonymous) swaps, private same-token sends to another address
 * (stealth send), DEX routes and multiswap batches. All of them come back from
 * the one orders endpoint, so none is filtered out.
 */
export const queryHoudini = async (
  pluginParams: PluginParams,
  fetchPage: FetchHoudiniPage = defaultFetchHoudiniPage
): Promise<PluginResult> => {
  const { log } = pluginParams
  const { settings, apiKeys } = asHoudiniPluginParams(pluginParams)
  const { apiKey, apiSecret } = apiKeys
  const { latestIsoDate } = settings

  // An empty string is what an unprovisioned partner entry looks like in Couch,
  // so treat it as unconfigured rather than calling the API with no credential.
  if (
    apiKey == null ||
    apiKey === '' ||
    apiSecret == null ||
    apiSecret === ''
  ) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  // Freeze the window for the whole walk. Orders are read newest first up to a
  // fixed end, so a new order cannot shift the pages, and orders leaving the
  // 48-hour window only drop off the last page.
  const now = Date.now()
  const windowStart = now - RETENTION_MS
  const from = new Date(windowStart).toISOString()
  const to = new Date(now).toISOString()

  if (latestIsoDate === EDGE_APP_START_DATE) {
    log.warn(
      `Houdini: first run; orders created before ${from} are outside the API's 48-hour window and are not reported`
    )
  } else if (new Date(latestIsoDate).getTime() < windowStart) {
    log.error(
      `Houdini: last complete read was ${latestIsoDate}, older than the API's 48-hour window; orders created from then until ${from} are lost`
    )
  }

  // Keyed by order id: an order can move between pages while the walk runs
  const standardTxs = new Map<string, StandardTx>()
  let skipped = 0
  let complete = false
  let retry = 0

  for (let page = 1; page <= MAX_PAGES; ) {
    let body: unknown
    try {
      body = await fetchPage(apiKey, apiSecret, from, to, page)
    } catch (e) {
      log.error(String(e))

      retry++
      if (retry > MAX_RETRIES) break
      log.warn(`Snoozing ${5 * retry}s`)
      await snooze(5000 * retry)
      continue
    }

    // A response of the wrong shape will not improve on a retry
    let result: ReturnType<typeof asHoudiniPage>
    try {
      result = asHoudiniPage(body)
    } catch (e) {
      log.error(`Houdini: unexpected response shape: ${String(e)}`)
      break
    }

    const pageResult = processHoudiniOrders(result.orders, pluginParams)
    for (const standardTx of pageResult.standardTxs) {
      standardTxs.set(standardTx.orderId, standardTx)
    }
    skipped += pageResult.skipped

    // Stop only when the page is short and totalPages agrees: a full page
    // always gets a next read, even if totalPages says it was the last one
    const lastPage =
      result.orders.length < PAGE_SIZE &&
      (result.totalPages == null || page >= result.totalPages)
    if (lastPage || result.orders.length === 0) {
      complete = true
      break
    }
    page++
    retry = 0
  }

  if (!complete) {
    log.error(
      `Houdini: the order window was not read to the end; progress is held at ${latestIsoDate}`
    )
  }
  if (skipped > 0) {
    log.error(
      `Houdini: ${skipped} order(s) skipped as unprocessable this run; each is logged above and needs a fix before it leaves the 48-hour window`
    )
  }

  return {
    // Progress marks the end of the last fully read window, so the next run
    // can tell whether it fell behind the 48-hour retention.
    settings: { latestIsoDate: complete ? to : latestIsoDate },
    transactions: [...standardTxs.values()]
  }
}

export const houdini: PartnerPlugin = {
  queryFunc: async pluginParams => await queryHoudini(pluginParams),
  pluginName: 'HoudiniSwap',
  pluginId: 'houdini'
}

/**
 * Process one page of Houdini orders, quarantining any order that cannot be
 * processed so it does not take the rest of the page down with it.
 */
export function processHoudiniOrders(
  rawTxs: unknown[],
  pluginParams: PluginParams
): PageResult {
  const { log } = pluginParams
  const standardTxs: StandardTx[] = []
  let skipped = 0
  for (const rawTx of rawTxs) {
    try {
      standardTxs.push(processHoudiniOrder(rawTx, pluginParams))
    } catch (e) {
      skipped++
      log.error(
        `Houdini: skipping unprocessable order, ingestion continues: ${String(
          e
        )}: ${describeRawTx(rawTx, ['houdiniId'])}`
      )
    }
  }
  return { standardTxs, skipped }
}

export function processHoudiniOrder(
  rawTx: unknown,
  pluginParams: PluginParams
): StandardTx {
  const order: HoudiniOrder = asHoudiniOrder(rawTx)

  const created = new Date(order.created)
  if (isNaN(created.getTime())) {
    throw new Error(`Bad created date ${order.created}`)
  }

  let status = statusMap[order.status]
  if (status == null) {
    pluginParams.log.warn(`Houdini: unknown status ${order.status}`)
    status = 'other'
  }

  const depositAsset = getEdgeAsset(order.inToken, pluginParams)
  const payoutAsset = getEdgeAsset(order.outToken, pluginParams)

  return {
    status,
    orderId: order.houdiniId,
    countryCode: null,

    depositTxid: emptyToUndefined(order.inHash),
    depositAddress: order.depositAddress,
    depositCurrency: (order.inToken?.symbol ?? order.inSymbol).toUpperCase(),
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: order.inAmount,

    direction: null,
    exchangeType: 'swap',
    paymentType: null,

    // On a refunded order transactionHash is the refund, not a payout
    payoutTxid:
      status === 'complete'
        ? emptyToUndefined(order.transactionHash)
        : undefined,
    payoutAddress: order.receiverAddress,
    payoutCurrency: (order.outToken?.symbol ?? order.outSymbol).toUpperCase(),
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: order.outAmount,

    timestamp: created.getTime() / 1000,
    isoDate: created.toISOString(),

    usdValue:
      order.inAmountUsd != null && order.inAmountUsd > 0
        ? order.inAmountUsd
        : -1,

    rawTx
  }
}

const defaultFetchHoudiniPage: FetchHoudiniPage = async (
  apiKey,
  apiSecret,
  from,
  to,
  page
) => {
  const params = new URLSearchParams({
    from,
    to,
    page: String(page),
    pageSize: String(PAGE_SIZE),
    sortBy: 'created',
    sortOrder: 'desc'
  })
  const response = await retryFetch(`${API_URL}?${params.toString()}`, {
    headers: { Authorization: `${apiKey}:${apiSecret}` }
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Houdini error ${response.status}: ${text}`)
  }
  return await response.json()
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value == null || value === '' ? undefined : value
}

/**
 * Resolves a Houdini token to Edge's chain plugin id and token id. A chain or
 * token Edge cannot name leaves the field undefined rather than dropping the
 * order, whose amounts and USD value are still good.
 */
function getEdgeAsset(
  token: HoudiniToken | undefined,
  pluginParams: PluginParams
): EdgeAsset {
  const { log } = pluginParams
  if (token == null) {
    return {
      chainPluginId: undefined,
      evmChainId: undefined,
      tokenId: undefined
    }
  }

  const chainPluginId = HOUDINI_CHAINS[token.chain]
  if (chainPluginId == null) {
    log.warn(`Houdini: unknown chain ${token.chain}`)
    return { chainPluginId, evmChainId: undefined, tokenId: undefined }
  }

  const tokenType = tokenTypes[chainPluginId]
  // The server's table is canonical; the order's chainId only fills a chain
  // the table lacks, such as monad
  const evmChainId =
    tokenType === 'evm'
      ? EVM_CHAIN_IDS[chainPluginId] ?? token.chainData?.chainId
      : undefined

  if (token.mainnet === true || token.address == null) {
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
      `Houdini: no token id for ${token.symbol} on ${chainPluginId}: ${String(
        e
      )}`
    )
    return { chainPluginId, evmChainId, tokenId: undefined }
  }
}
