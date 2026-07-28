import {
  asArray,
  asMap,
  asMaybe,
  asNumber,
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
  ScopedLog,
  StandardTx,
  Status
} from '../types'
import { retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'
import {
  ChainNameToPluginIdMapping,
  createTokenId,
  EdgeTokenId,
  tokenTypes
} from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

// Map Sideshift network names to Edge pluginId
const SIDESHIFT_NETWORK_TO_PLUGIN_ID: ChainNameToPluginIdMapping = {
  algorand: 'algorand',
  arbitrum: 'arbitrum',
  avax: 'avalanche',
  base: 'base',
  bitcoin: 'bitcoin',
  bitcoincash: 'bitcoincash',
  bsc: 'binancesmartchain',
  bsv: 'bitcoinsv',
  cardano: 'cardano',
  cosmos: 'cosmoshub',
  dash: 'dash',
  doge: 'dogecoin',
  ethereum: 'ethereum',
  fantom: 'fantom',
  litecoin: 'litecoin',
  monad: 'monad',
  monero: 'monero',
  optimism: 'optimism',
  polkadot: 'polkadot',
  polygon: 'polygon',
  ripple: 'ripple',
  rootstock: 'rsk',
  solana: 'solana',
  sonic: 'sonic',
  stellar: 'stellar',
  sui: 'sui',
  ton: 'ton',
  tron: 'tron',
  xec: 'ecash',
  zcash: 'zcash',
  zksyncera: 'zksync'
}

// Some assets have different names in the API vs transaction data
// Map: `${txAsset}-${network}` -> API coin name
const ASSET_NAME_OVERRIDES: Record<string, string> = {
  'USDT-arbitrum': 'USDT0',
  'USDT-polygon': 'USDT0',
  'USDT-hyperevm': 'USDT0'
}

// Delisted coins that are no longer in the SideShift API
// Map: `${coin}-${network}` -> contract address (null for native gas tokens)
const DELISTED_COINS: Record<string, string | null> = {
  'BSV-bsv': null, // Native gas token
  'BUSD-bsc': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  'FTM-fantom': null, // Native gas token
  'MATIC-ethereum': '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
  'MATIC-polygon': null, // Native gas token (rebranded to POL)
  'MKR-ethereum': '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  'PYTH-solana': 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  'USDC-tron': 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
  'XMR-monero': null, // Native gas token
  'ZEC-zcash': null // Native gas token
}

// Cleaners for Sideshift coins API response
const asSideshiftTokenDetails = asObject({
  contractAddress: asString
})

const asSideshiftCoin = asObject({
  coin: asString,
  networks: asArray(asString),
  tokenDetails: asOptional(
    asObject((raw: unknown) => asSideshiftTokenDetails(raw))
  )
})

const asSideshiftCoinsResponse = asArray(asSideshiftCoin)

// Cache for Sideshift coins data
// Key: `${coin}-${network}` -> contract address or null for mainnet coins
let sideshiftCoinsCache: Map<string, string | null> | null = null
let sideshiftCoinsCacheTimestamp = 0
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

async function fetchSideshiftCoins(): Promise<Map<string, string | null>> {
  if (
    sideshiftCoinsCache != null &&
    Date.now() - sideshiftCoinsCacheTimestamp < CACHE_TTL_MS
  ) {
    return sideshiftCoinsCache
  }

  const cache = new Map<string, string | null>()

  const response = await retryFetch('https://sideshift.ai/api/v2/coins')
  if (!response.ok) {
    throw new Error(`Failed to fetch sideshift coins: ${response.status}`)
  }

  const coins = asSideshiftCoinsResponse(await response.json())

  for (const coin of coins) {
    for (const network of coin.networks) {
      const key = `${coin.coin.toUpperCase()}-${network}`
      // Get contract address from tokenDetails if available
      const tokenDetail = coin.tokenDetails?.[network]
      cache.set(key, tokenDetail?.contractAddress ?? null)
    }
  }

  sideshiftCoinsCache = cache
  sideshiftCoinsCacheTimestamp = Date.now()
  return cache
}

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
  depositNetwork: asOptional(asString),
  depositHash: asOptional(asString),
  depositContractAddress: asOptional(asString),
  // asMaybe so an unexpected encoding (e.g. a numeric string) degrades to
  // undefined instead of throwing and aborting the whole 5-day query block
  depositEvmChainId: asMaybe(asNumber),
  invoiceAmount: asString,
  settleAddress: asObject({
    address: asString
  }),
  settleAmount: asString,
  settleAsset: asString,
  settleNetwork: asOptional(asString),
  settleHash: asOptional(asString),
  settleContractAddress: asOptional(asString),
  settleEvmChainId: asMaybe(asNumber),
  createdAt: asString,
  settledAt: asOptional(asString)
})

// apiKeys reaching a partner plugin are a flat string->string map
// (see asPartnerInfo in types.ts), so additional accounts are carried as
// explicit string fields rather than a nested array. The primary
// sideshiftAffiliateId/Secret pair is the pre-existing account whose completed
// orders are already recorded, so it keeps its watermark and resumes
// incrementally. The optional sideshiftAffiliateId2/Secret2 pair is a
// newly-added affiliate account; it has no recorded history, so it backfills
// from epoch (see querySideshift). Backward compatible: when the *2 fields are
// absent only the primary pair is queried. Putting the established account in
// the primary slot is what keeps a rotation cheap: the account with years of
// history never re-scans from epoch.
const asSideshiftApiKeys = asObject({
  sideshiftAffiliateId: asString,
  sideshiftAffiliateSecret: asString,
  sideshiftAffiliateId2: asOptional(asString),
  sideshiftAffiliateSecret2: asOptional(asString)
})

const DEFAULT_LATEST_ISO_DATE = '1970-01-01T00:00:00.000Z'

// `accounts` is a per-affiliateId cursor map. Legacy progress docs only carry
// the top-level `latestIsoDate`; the primary account inherits it across the
// upgrade (so the existing single account keeps its watermark), while any
// newly-added account starts from the epoch default to backfill its full
// history. See querySideshift for the per-account fallback rationale.
const asSideshiftSettings = asObject({
  latestIsoDate: asOptional(asString, DEFAULT_LATEST_ISO_DATE),
  accounts: asOptional(asMap(asString), () => ({}))
})

const asSideshiftPluginParams = asObject({
  apiKeys: asSideshiftApiKeys,
  settings: asSideshiftSettings
})

interface SideshiftAccount {
  affiliateId: string
  affiliateSecret: string
}

type SideshiftApiKeys = ReturnType<typeof asSideshiftApiKeys>
type SideshiftTx = ReturnType<typeof asSideshiftTx>
type SideshiftStatus = ReturnType<typeof asSideshiftStatus>
const asSideshiftResult = asArray(asUnknown)

// Fetches one raw page of completed orders for an account, and processes a raw
// order into a StandardTx. Both are injectable so the multi-account merge and
// cursor logic can be exercised in tests without the live Sideshift API.
type FetchSideshiftOrders = (
  account: SideshiftAccount,
  startTime: number,
  now: number
) => Promise<unknown[]>
type ProcessSideshiftOrder = (rawTx: unknown) => Promise<StandardTx>

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

// Builds the list of affiliate accounts to query from the configured apiKeys.
// Returns the primary (pre-existing) account plus the optional newly-added
// account, deduped by affiliateId so a single-account config yields exactly one
// account. Order matters: the primary stays at index 0 because querySideshift
// gives index 0 the legacy watermark and backfills the rest from epoch.
export function getSideshiftAccounts(
  apiKeys: SideshiftApiKeys
): SideshiftAccount[] {
  const {
    sideshiftAffiliateId,
    sideshiftAffiliateSecret,
    sideshiftAffiliateId2,
    sideshiftAffiliateSecret2
  } = apiKeys

  const accounts: SideshiftAccount[] = [
    {
      affiliateId: sideshiftAffiliateId,
      affiliateSecret: sideshiftAffiliateSecret
    }
  ]

  // A half-configured pair means the operator intended a second account but
  // it would be silently skipped, so fail loudly instead.
  if ((sideshiftAffiliateId2 != null) !== (sideshiftAffiliateSecret2 != null)) {
    throw new Error(
      'Sideshift config error: sideshiftAffiliateId2 and sideshiftAffiliateSecret2 must both be set'
    )
  }

  if (
    sideshiftAffiliateId2 != null &&
    sideshiftAffiliateSecret2 != null &&
    sideshiftAffiliateId2 !== sideshiftAffiliateId
  ) {
    accounts.push({
      affiliateId: sideshiftAffiliateId2,
      affiliateSecret: sideshiftAffiliateSecret2
    })
  }

  return accounts
}

const defaultFetchSideshiftOrders: FetchSideshiftOrders = async (
  account,
  startTime,
  now
): Promise<unknown[]> => {
  const signature = affiliateSignature(
    account.affiliateId,
    account.affiliateSecret,
    now
  )
  const url = `https://sideshift.ai/api/affiliate/completedOrders?affiliateId=${account.affiliateId}&since=${startTime}&currentTime=${now}&signature=${signature}`
  const response = await retryFetch(url)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text)
  }
  const jsonObj = await response.json()
  return asSideshiftResult(jsonObj)
}

// Queries the completed orders for a single affiliate account, advancing its
// own cursor. Mirrors the original per-account query/signature/retry/time-block
// behavior exactly; only the fetch + per-order processing are abstracted so the
// merge can be tested without the live API.
async function querySideshiftAccount(
  account: SideshiftAccount,
  initialLatestIsoDate: string,
  fetchOrders: FetchSideshiftOrders,
  processOrder: ProcessSideshiftOrder,
  log: ScopedLog
): Promise<{ transactions: StandardTx[]; latestIsoDate: string }> {
  let latestIsoDate = initialLatestIsoDate

  let lastCheckedTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (lastCheckedTimestamp < 0) lastCheckedTimestamp = 0

  const standardTxs: StandardTx[] = []
  let retry = 0
  let startTime = lastCheckedTimestamp

  while (true) {
    const endTime = startTime + QUERY_TIME_BLOCK_MS
    const now = Date.now()

    try {
      const orders = await fetchOrders(account, startTime, now)
      if (orders.length === 0) {
        break
      }
      for (const rawTx of orders) {
        const standardTx = await processOrder(rawTx)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
      }
      startTime = new Date(latestIsoDate).getTime()
      log(`${account.affiliateId} latestIsoDate ${latestIsoDate}`)
      if (endTime > now) {
        break
      }
      retry = 0
    } catch (e) {
      log.error(String(e))
      // Retry a few times with time delay to prevent throttling
      retry++
      if (retry <= MAX_RETRIES) {
        log.warn(`Snoozing ${5 * retry}s`)
        await snooze(5000 * retry)
      } else {
        // We can safely save our progress since we go from oldest to newest.
        break
      }
    }
  }

  return { transactions: standardTxs, latestIsoDate }
}

export async function querySideshift(
  pluginParams: PluginParams,
  fetchOrders: FetchSideshiftOrders = defaultFetchSideshiftOrders,
  processOrder: ProcessSideshiftOrder = async rawTx =>
    await processSideshiftTx(rawTx, pluginParams)
): Promise<PluginResult> {
  const { log } = pluginParams
  const { settings, apiKeys } = asSideshiftPluginParams(pluginParams)
  const {
    latestIsoDate: legacyLatestIsoDate,
    accounts: accountCursors
  } = settings

  const accounts = getSideshiftAccounts(apiKeys)

  const standardTxs: StandardTx[] = []
  const newAccountCursors: { [affiliateId: string]: string } = {}
  let overallLatestIsoDate = legacyLatestIsoDate

  for (let index = 0; index < accounts.length; index++) {
    const account = accounts[index]
    // Resume from the account's own cursor when known. On the first run that an
    // account appears (no map entry), the PRIMARY account (index 0) inherits the
    // legacy single cursor so the pre-existing account keeps its watermark, while
    // a newly-added account starts from the epoch default to backfill its full
    // history. Inheriting the primary's advanced watermark would make a new
    // account skip every order older than that point permanently.
    const fallbackCursor =
      index === 0 ? legacyLatestIsoDate : DEFAULT_LATEST_ISO_DATE
    const startCursor = accountCursors[account.affiliateId] ?? fallbackCursor

    const { transactions, latestIsoDate } = await querySideshiftAccount(
      account,
      startCursor,
      fetchOrders,
      processOrder,
      log
    )

    standardTxs.push(...transactions)
    newAccountCursors[account.affiliateId] = latestIsoDate
    if (latestIsoDate > overallLatestIsoDate) {
      overallLatestIsoDate = latestIsoDate
    }
  }

  const out = {
    settings: {
      latestIsoDate: overallLatestIsoDate,
      accounts: newAccountCursors
    },
    transactions: standardTxs
  }
  return out
}

export const sideshift: PartnerPlugin = {
  queryFunc: querySideshift,
  pluginName: 'SideShift.ai',
  pluginId: 'sideshift'
}

interface EdgeAssetInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId
}

/**
 * Process network and asset info to extract Edge asset info
 */
async function getAssetInfo(
  network: string | undefined,
  asset: string
): Promise<EdgeAssetInfo> {
  if (network == null) {
    throw new Error(`Missing network for asset: ${asset}`)
  }

  const chainPluginId = SIDESHIFT_NETWORK_TO_PLUGIN_ID[network]
  if (chainPluginId == null) {
    throw new Error(`Unknown network: ${network}`)
  }

  // Get evmChainId if this is an EVM chain
  const evmChainId = EVM_CHAIN_IDS[chainPluginId]

  // Get contract address from cache
  const coinsCache = await fetchSideshiftCoins()

  // Check for asset name overrides (e.g., USDT -> USDT0 on certain networks)
  const overrideKey = `${asset.toUpperCase()}-${network}`
  const apiCoinName = ASSET_NAME_OVERRIDES[overrideKey] ?? asset.toUpperCase()
  const cacheKey = `${apiCoinName}-${network}`

  // Check cache first, then fall back to delisted coins mapping
  let contractAddress: string | null | undefined
  if (coinsCache.has(cacheKey)) {
    contractAddress = coinsCache.get(cacheKey)
  } else if (overrideKey in DELISTED_COINS) {
    contractAddress = DELISTED_COINS[overrideKey]
  } else {
    throw new Error(`Unknown coin: ${asset} on network ${network}`)
  }

  // Determine tokenId
  // contractAddress === null means mainnet coin (tokenId = null)
  // contractAddress === string means token (tokenId = createTokenId(...))
  let tokenId: EdgeTokenId = null
  if (contractAddress != null) {
    const tokenType = tokenTypes[chainPluginId]
    if (tokenType == null) {
      throw new Error(
        `Unknown tokenType for chainPluginId ${chainPluginId} (asset: ${asset})`
      )
    }
    tokenId = createTokenId(tokenType, asset.toUpperCase(), contractAddress)
  }

  return { chainPluginId, evmChainId, tokenId }
}

export async function processSideshiftTx(
  rawTx: unknown,
  pluginParams: PluginParams
): Promise<StandardTx> {
  const tx: SideshiftTx = asSideshiftTx(rawTx)
  const depositAddress =
    tx.depositAddress?.address ?? tx.prevDepositAddresses?.address
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(tx.createdAt)

  // Get asset info for deposit and payout
  const depositAsset = await getAssetInfo(tx.depositNetwork, tx.depositAsset)
  const payoutAsset = await getAssetInfo(tx.settleNetwork, tx.settleAsset)

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.id,
    countryCode: null,
    // On EVM networks, TRON, Aptos, Sui, NEAR, and Algorand, SideShift's
    // depositHash is the internal sweep transaction (deposit contract to
    // their wallet), not the customer's own deposit transaction. The API
    // exposes no better field, so treat this as an order reference, not a
    // pointer to the customer's on-chain payment.
    depositTxid: tx.depositHash,
    depositAddress,
    depositCurrency: tx.depositAsset,
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: Number(tx.invoiceAmount),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.settleHash,
    payoutAddress: tx.settleAddress.address,
    payoutCurrency: tx.settleAsset,
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: Number(tx.settleAmount),
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}
