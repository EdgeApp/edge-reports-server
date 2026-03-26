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
import crypto from 'crypto'
import { Response } from 'node-fetch'

import {
  EDGE_APP_START_DATE,
  FiatPaymentType,
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
import { EVM_CHAIN_IDS, REVERSE_EVM_CHAIN_IDS } from '../util/chainIds'

// Map Banxa blockchain.id (from v2 API) to Edge pluginId
// First we try to use the numeric chain ID from the 'network' field,
// falling back to this mapping for non-EVM chains
const BANXA_BLOCKCHAIN_TO_PLUGIN_ID: ChainNameToPluginIdMapping = {
  ALGO: 'algorand',
  ARB: 'arbitrum',
  AVAX: 'avalanche',
  'AVAX-C': 'avalanche',
  BASE: 'base',
  BCH: 'bitcoincash',
  BOB: 'bobevm',
  BSC: 'binancesmartchain',
  BTC: 'bitcoin',
  CELO: 'celo',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  ETC: 'ethereumclassic',
  ETH: 'ethereum',
  FTM: 'fantom',
  HBAR: 'hedera',
  LN: 'bitcoin', // Lightning Network maps to bitcoin
  LTC: 'litecoin',
  MATIC: 'polygon',
  OP: 'optimism',
  OPTIMISM: 'optimism',
  POL: 'polygon',
  SOL: 'solana',
  SUI: 'sui',
  TON: 'ton',
  TRX: 'tron',
  XLM: 'stellar',
  XRP: 'ripple',
  XTZ: 'tezos',
  ZEC: 'zcash',
  ZKSYNC: 'zksync',
  ZKSYNC2: 'zksync'
}

// Cleaner for Banxa v2 API blockchain
const asBanxaBlockchain = asObject({
  id: asString,
  address: asOptional(asString),
  network: asOptional(asString)
})

// Cleaner for Banxa v2 API coin
const asBanxaCoin = asObject({
  id: asString,
  blockchains: asArray(asBanxaBlockchain)
})

// Cleaner for Banxa v2 API response (array of coins)
const asBanxaCryptoResponse = asArray(asBanxaCoin)

// Cache for Banxa coins data from v2 API
// Key: `${coinId}-${blockchainId}` -> { contractAddress, pluginId }
interface CachedAssetInfo {
  contractAddress: string | null
  pluginId: string | undefined
}
let banxaCoinsCache: Map<string, CachedAssetInfo> | null = null
let banxaCoinsCacheTimestamp = 0
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Static fallback for historical coins no longer in the v2 API
const BANXA_HISTORICAL_COINS: Record<string, CachedAssetInfo> = {
  // MATIC was renamed to POL
  'MATIC-MATIC': { contractAddress: null, pluginId: 'polygon' },
  'MATIC-ETH': {
    contractAddress: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
    pluginId: 'ethereum'
  },
  // OMG (OmiseGO) delisted
  'OMG-ETH': {
    contractAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
    pluginId: 'ethereum'
  },
  // RLUSD on XRP Ledger
  'RLUSD-XRP': {
    contractAddress: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
    pluginId: 'ripple'
  }
}

/**
 * Fetch coins from Banxa v2 API and build cache
 */
async function fetchBanxaCoins(
  partnerId: string,
  apiKeyV2: string,
  log: ScopedLog
): Promise<Map<string, CachedAssetInfo>> {
  if (
    banxaCoinsCache != null &&
    Date.now() - banxaCoinsCacheTimestamp < CACHE_TTL_MS
  ) {
    return banxaCoinsCache
  }

  const cache = new Map<string, CachedAssetInfo>()

  // Fetch both buy and sell to get all coins
  for (const orderType of ['buy', 'sell']) {
    const url = `https://api.banxa.com/${partnerId}/v2/crypto/${orderType}`
    const response = await retryFetch(url, {
      headers: {
        'x-api-key': apiKeyV2,
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Failed to fetch Banxa ${orderType} coins: ${response.status} - ${errorText}`
      )
    }

    const rawCoins = await response.json()
    const coins = asBanxaCryptoResponse(rawCoins)

    for (const coin of coins) {
      for (const blockchain of coin.blockchains) {
        const key = `${coin.id.toUpperCase()}-${blockchain.id.toUpperCase()}`

        // Skip if already cached
        if (cache.has(key)) continue

        // Determine pluginId from network (chain ID) or blockchain id
        let pluginId: string | undefined
        const networkId = blockchain.network
        if (networkId != null) {
          // Try to parse as numeric chain ID
          const chainIdNum = parseInt(networkId, 10)
          if (!isNaN(chainIdNum)) {
            pluginId = REVERSE_EVM_CHAIN_IDS[chainIdNum]
          }
        }
        // Fall back to blockchain ID mapping
        if (pluginId == null) {
          pluginId = BANXA_BLOCKCHAIN_TO_PLUGIN_ID[blockchain.id.toUpperCase()]
        }

        if (pluginId == null) {
          continue
        }

        // Determine contract address
        // null, empty, "0x0000...", or non-hex addresses (like bip122:...) mean native gas token
        // Also, if coin ID matches blockchain ID (e.g. HBAR-HBAR), it's the native coin
        let contractAddress: string | null = null
        const isNativeCoin =
          coin.id.toUpperCase() === blockchain.id.toUpperCase()
        if (
          !isNativeCoin &&
          blockchain.address != null &&
          blockchain.address !== '' &&
          blockchain.address !== '0x0000000000000000000000000000000000000000' &&
          blockchain.address.startsWith('0x') // Only EVM-style addresses are contracts
        ) {
          contractAddress = blockchain.address
        }

        cache.set(key, { contractAddress, pluginId })
      }
    }
  }

  banxaCoinsCache = cache
  banxaCoinsCacheTimestamp = Date.now()
  log(`Loaded ${cache.size} coin/blockchain combinations from API`)
  return cache
}

interface EdgeAssetInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId
}

/**
 * Get Edge asset info from Banxa blockchain code and coin code
 * Uses cached data from v2 API
 */
function getAssetInfo(blockchainCode: string, coinCode: string): EdgeAssetInfo {
  const cacheKey = `${coinCode.toUpperCase()}-${blockchainCode.toUpperCase()}`

  // Try API cache first, then historical fallback
  let cachedInfo = banxaCoinsCache?.get(cacheKey)
  if (cachedInfo == null) {
    cachedInfo = BANXA_HISTORICAL_COINS[cacheKey]
  }
  if (cachedInfo == null) {
    throw new Error(
      `Unknown Banxa coin/blockchain: ${coinCode} on ${blockchainCode}`
    )
  }

  const { contractAddress, pluginId: chainPluginId } = cachedInfo

  if (chainPluginId == null) {
    throw new Error(`Unknown Banxa blockchain: ${blockchainCode}`)
  }

  // Get evmChainId if this is an EVM chain
  const evmChainId = EVM_CHAIN_IDS[chainPluginId]

  // Determine tokenId
  let tokenId: EdgeTokenId = null
  if (contractAddress != null) {
    const tokenType = tokenTypes[chainPluginId]
    if (tokenType == null) {
      throw new Error(
        `Unknown tokenType for chainPluginId ${chainPluginId} (coin: ${coinCode})`
      )
    }
    tokenId = createTokenId(tokenType, coinCode.toUpperCase(), contractAddress)
  }

  return { chainPluginId, evmChainId, tokenId }
}

export const asBanxaParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, EDGE_APP_START_DATE)
  }),
  apiKeys: asObject({
    apiKey: asString,
    partnerId: asString,
    apiKeyV2: asString,
    secret: asString,
    partnerUrl: asString
  })
})

type BanxaStatus = ReturnType<typeof asBanxaStatus>
const asBanxaStatus = asMaybe(
  asValue(
    'complete',
    'pendingPayment',
    'cancelled',
    'expired',
    'declined',
    'refunded'
  ),
  'other'
)

type BanxaTx = ReturnType<typeof asBanxaTx>
const asBanxaTx = asObject({
  id: asString,
  status: asBanxaStatus,
  created_at: asString,
  country: asEither(asString, asNull),
  fiat_amount: asNumber,
  fiat_code: asString,
  coin_amount: asNumber,
  coin_code: asString,
  order_type: asString,
  payment_type: asString,
  wallet_address: asMaybe(asString, ''),
  blockchain: asObject({
    code: asString,
    description: asString
  })
})

const asBanxaResult = asObject({
  data: asObject({
    orders: asArray(asUnknown)
  })
})

const MAX_ATTEMPTS = 1
const PAGE_LIMIT = 200
const ONE_DAY_MS = 1000 * 60 * 60 * 24
const ROLLBACK = ONE_DAY_MS * 7 // 7 days

const statusMap: { [key in BanxaStatus]: Status } = {
  complete: 'complete',
  expired: 'expired',
  cancelled: 'other',
  declined: 'blocked',
  refunded: 'refunded',
  pendingPayment: 'pending',
  other: 'other'
}

export async function queryBanxa(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const ssFormatTxs: StandardTx[] = []
  const { settings, apiKeys } = asBanxaParams(pluginParams)
  const { apiKey, partnerId, partnerUrl, secret } = apiKeys
  const { latestIsoDate } = settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const today = new Date().toISOString()
  let startDate = new Date(
    new Date(latestIsoDate).getTime() - ROLLBACK
  ).toISOString()

  let endDate = startDate
  while (startDate < today) {
    endDate = new Date(new Date(startDate).getTime() + ROLLBACK).toISOString()
    if (endDate > today) {
      endDate = today
    }

    let page = 1
    let attempt = 0
    try {
      while (true) {
        log(
          `Querying ${startDate}->${endDate}, limit=${PAGE_LIMIT} page=${page} attempt=${attempt}`
        )
        const response = await fetchBanxaAPI(
          partnerUrl,
          startDate,
          endDate,
          PAGE_LIMIT,
          page,
          apiKey,
          secret
        )

        // Handle the situation where the API is rate limiting the requests
        if (!response.ok) {
          attempt++
          const delay = 2000 * attempt
          log.warn(
            `Response code ${response.status}. Retrying after ${delay /
              1000} second snooze...`
          )
          await snooze(delay)
          if (attempt === MAX_ATTEMPTS) {
            log.error(`Retry Limit reached for date ${startDate}.`)

            const text = await response.text()
            throw new Error(text)
          }
          continue
        }

        const reply = await response.json()
        const jsonObj = asBanxaResult(reply)
        const txs = jsonObj.data.orders
        await processBanxaOrders(txs, ssFormatTxs, pluginParams, log)
        if (txs.length < PAGE_LIMIT) {
          break
        }
        page++
      }
      const newStartTs = new Date(endDate).getTime()
      startDate = new Date(newStartTs).toISOString()
    } catch (e) {
      log.error(String(e))
      endDate = startDate

      // We can safely save our progress since we go from oldest to newest.
      break
    }
  }

  const out: PluginResult = {
    settings: { latestIsoDate: endDate },
    transactions: ssFormatTxs
  }
  return out
}

export const banxa: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryBanxa,
  // results in a PluginResult
  pluginName: 'Banxa',
  pluginId: 'banxa'
}

async function fetchBanxaAPI(
  partnerUrl: string,
  startDate: string,
  endDate: string,
  pageLimit: number,
  page: number,
  apiKey: string,
  secret: string
): Promise<Response> {
  const nonce = Math.floor(new Date().getTime() / 1000)

  const apiQuery = `/api/orders?start_date=${startDate}&end_date=${endDate}&per_page=${pageLimit}&page=${page}`

  const text = `GET\n${apiQuery}\n${nonce}`
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(text)
    .digest('hex')
  const authHeader = `${apiKey}:${hmac}:${nonce}`

  const headers = {
    Authorization: 'Bearer ' + authHeader,
    'Content-Type': 'application/json'
  }

  return await retryFetch(`${partnerUrl}${apiQuery}`, { headers: headers })
}

async function processBanxaOrders(
  rawtxs: unknown[],
  ssFormatTxs: StandardTx[],
  pluginParams: PluginParams,
  log: ScopedLog
): Promise<void> {
  let numComplete = 0
  let newestIsoDate = new Date(0).toISOString()
  let oldestIsoDate = new Date(9999999999999).toISOString()
  for (const rawTx of rawtxs) {
    let standardTx: StandardTx
    try {
      standardTx = await processBanxaTx(rawTx, pluginParams)
    } catch (e) {
      log.error(String(e))
      throw e
    }

    ssFormatTxs.push(standardTx)

    if (standardTx.status === 'complete') {
      numComplete++
    }
    if (standardTx.isoDate > newestIsoDate) {
      newestIsoDate = standardTx.isoDate
    }
    if (standardTx.isoDate < oldestIsoDate) {
      oldestIsoDate = standardTx.isoDate
    }
  }
  if (rawtxs.length > 1) {
    log(
      `Processed ${
        rawtxs.length
      }, #complete=${numComplete} oldest=${oldestIsoDate.slice(
        0,
        16
      )} newest=${newestIsoDate.slice(0, 16)}`
    )
  } else {
    log(`Processed ${rawtxs.length}`)
  }
}

export async function processBanxaTx(
  rawTx: unknown,
  pluginParams: PluginParams
): Promise<StandardTx> {
  const { log } = pluginParams
  const banxaTx: BanxaTx = asBanxaTx(rawTx)
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(banxaTx.created_at)
  const { apiKeys } = asBanxaParams(pluginParams)
  const { apiKeyV2, partnerId } = apiKeys

  // Get apiKeyV2 from pluginParams (banxa3 partner)
  // For backfillAssetInfo, this comes from the banxa3 partner config
  if (apiKeyV2 == null || partnerId == null) {
    throw new Error('Banxa apiKeyV2 required for asset info lookup')
  }

  // Flip the amounts if the order is a SELL
  let payoutAddress
  let inputAmount = banxaTx.fiat_amount
  let inputCurrency = banxaTx.fiat_code
  let outputAmount = banxaTx.coin_amount
  let outputCurrency = banxaTx.coin_code
  if (banxaTx.order_type === 'CRYPTO-SELL') {
    inputAmount = banxaTx.coin_amount
    inputCurrency = banxaTx.coin_code
    outputAmount = banxaTx.fiat_amount
    outputCurrency = banxaTx.fiat_code
  } else {
    payoutAddress = banxaTx.wallet_address
  }

  const direction = banxaTx.order_type === 'CRYPTO-SELL' ? 'sell' : 'buy'

  const paymentType = getFiatPaymentType(banxaTx)

  // Get asset info for the crypto side
  // For buy: payout is crypto
  // For sell: deposit is crypto
  const blockchainCode = banxaTx.blockchain.code
  const coinCode = banxaTx.coin_code

  await fetchBanxaCoins(partnerId, apiKeyV2, log)

  const cryptoAssetInfo = getAssetInfo(blockchainCode, coinCode)

  // For buy transactions: deposit is fiat (no crypto info), payout is crypto
  // For sell transactions: deposit is crypto, payout is fiat (no crypto info)
  const depositAsset =
    direction === 'sell'
      ? cryptoAssetInfo
      : { chainPluginId: undefined, evmChainId: undefined, tokenId: undefined }

  const payoutAsset =
    direction === 'buy'
      ? cryptoAssetInfo
      : { chainPluginId: undefined, evmChainId: undefined, tokenId: undefined }

  const standardTx: StandardTx = {
    status: statusMap[banxaTx.status],
    orderId: banxaTx.id,
    countryCode: banxaTx.country,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: inputCurrency,
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: inputAmount,
    direction,
    exchangeType: 'fiat',
    paymentType,
    payoutTxid: undefined,
    payoutAddress,
    payoutCurrency: outputCurrency,
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: outputAmount,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }

  return standardTx
}

function getFiatPaymentType(tx: BanxaTx): FiatPaymentType {
  switch (tx.payment_type) {
    case 'AusPost Retail':
      return 'auspost'
    case 'BPay':
      return 'bpay'
    case 'Blueshyft Online':
      return 'blueshyft'
    case 'POLi Transfer':
      return 'poli'
    case 'Sofort Transfer':
      return 'sofort'
    case 'Checkout Credit Card':
    case 'Primer Credit Card':
    case 'WorldPay Credit Card':
      return 'credit'
    case 'ClearJunction Fast Pay':
    case 'ClearJunction Sell Fast Pay':
      return 'fasterpayments'
    case 'ClearJunction Sepa':
    case 'Ten31 Sepa':
      return 'sepa'
    case 'DCBank Interac':
    case 'DCBank Interac Sell':
      return 'interac'
    case 'Enumis Transfer':
      return 'fasterpayments'
    case 'Monoova Sell':
      return 'banktransfer'
    case 'NPP PayID':
    case 'PayID via Monoova':
      return 'payid'
    case 'WorldPay ApplePay':
    case 'Primer Apple Pay':
      return 'applepay'
    case 'WorldPay GooglePay':
      return 'googlepay'
    case 'iDEAL Transfer':
      return 'ideal'
    case 'ZeroHash ACH Sell':
    case 'Fortress/Plaid ACH':
      return 'ach'
    case 'Manual Payment (Turkey)':
      return 'turkishbank'
    case 'ClearJunction Sell Sepa':
      return 'sepa'
    case 'Dlocal Brazil PIX':
      return 'pix'
    case 'DLocal South Africa IO':
      return 'ozow'
    default:
      throw new Error(`Unknown payment method: ${tx.payment_type} for ${tx.id}`)
  }
}
