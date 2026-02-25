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

async function fetchSideshiftCoins(): Promise<Map<string, string | null>> {
  if (sideshiftCoinsCache != null) {
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
  invoiceAmount: asString,
  settleAddress: asObject({
    address: asString
  }),
  settleAmount: asString,
  settleAsset: asString,
  settleNetwork: asOptional(asString),
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
  const { log } = pluginParams
  const { settings, apiKeys } = asSideshiftPluginParams(pluginParams)
  const { sideshiftAffiliateId, sideshiftAffiliateSecret } = apiKeys
  let { latestIsoDate } = settings

  let lastCheckedTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (lastCheckedTimestamp < 0) lastCheckedTimestamp = 0

  const standardTxs: StandardTx[] = []
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
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }
      const jsonObj = await response.json()
      const orders = asSideshiftResult(jsonObj)
      if (orders.length === 0) {
        break
      }
      for (const rawTx of orders) {
        const standardTx = await processSideshiftTx(rawTx, pluginParams)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
      }
      startTime = new Date(latestIsoDate).getTime()
      log(`latestIsoDate ${latestIsoDate}`)
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

  const out = {
    settings: { latestIsoDate },
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
    depositTxid: undefined,
    depositAddress,
    depositCurrency: tx.depositAsset,
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: Number(tx.invoiceAmount),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: undefined,
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
