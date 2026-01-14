import {
  asArray,
  asMaybe,
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
  ScopedLog,
  StandardTx,
  Status
} from '../types'
import { retryFetch, safeParseFloat, smartIsoDateFromTimestamp } from '../util'
import { hashAddress } from '../util/addressHash'
import {
  ChainNameToPluginIdMapping,
  createTokenId,
  EdgeTokenId,
  tokenTypes
} from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

const asGodexPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, '0')
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString)
  })
})

// Godex started providing network_from_code/network_to_code fields on this date
// Transactions before this date are not required to have network codes
const GODEX_NETWORK_CODE_START_DATE = '2024-04-03T12:00:00.000Z'

// Godex network codes to Edge pluginIds
const GODEX_NETWORK_TO_PLUGINID: ChainNameToPluginIdMapping = {
  ADA: 'cardano',
  ALGO: 'algorand',
  ARBITRUM: 'arbitrum',
  ATOM: 'cosmoshub',
  AVAXC: 'avalanche',
  BASE: 'base',
  BCH: 'bitcoincash',
  BNB: 'binancesmartchain',
  BSC: 'binancesmartchain',
  BTC: 'bitcoin',
  BTG: 'bitcoingold',
  CELO: 'celo',
  DASH: 'dash',
  DGB: 'digibyte',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  EOS: 'eos',
  ETC: 'ethereumclassic',
  ETH: 'ethereum',
  ETHW: 'ethereumpow',
  FIL: 'filecoin',
  FIO: 'fio',
  FIRO: 'zcoin',
  FTM: 'fantom',
  HBAR: 'hedera',
  LTC: 'litecoin',
  MATIC: 'polygon',
  OP: 'optimism',
  OPTIMISM: 'optimism',
  OSMO: 'osmosis',
  PIVX: 'pivx',
  QTUM: 'qtum',
  RSK: 'rsk',
  RUNE: 'thorchainrune',
  RVN: 'ravencoin',
  SOL: 'solana',
  SUI: 'sui',
  TON: 'ton',
  TRX: 'tron',
  XEC: 'ecash',
  XLM: 'stellar',
  XMR: 'monero',
  XRP: 'ripple',
  XTZ: 'tezos',
  ZEC: 'zcash',
  ZKSYNC: 'zksync'
}

// Fallback for tokens that were delisted from Godex API but have historical transactions
const DELISTED_TOKENS: Record<string, GodexAssetInfo> = {
  'TNSR:SOL': { contractAddress: 'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6' }
}

// Cleaner for Godex coins API response
const asGodexCoinNetwork = asObject({
  code: asString,
  contract_address: asOptional(asString),
  chain_id: asOptional(asString)
})

const asGodexCoin = asObject({
  code: asString,
  networks: asArray(asGodexCoinNetwork)
})

const asGodexCoinsResponse = asArray(asGodexCoin)

// Cache for Godex coins data
interface GodexAssetInfo {
  contractAddress?: string
  chainId?: number
}

let godexCoinsCache: Map<string, GodexAssetInfo> | null = null

async function getGodexCoinsCache(
  log: ScopedLog
): Promise<Map<string, GodexAssetInfo>> {
  if (godexCoinsCache != null) {
    return godexCoinsCache
  }

  const cache = new Map<string, GodexAssetInfo>()

  // Add delisted tokens first (can be overwritten by API if re-listed)
  for (const [key, value] of Object.entries(DELISTED_TOKENS)) {
    cache.set(key, value)
  }

  try {
    const url = 'https://api.godex.io/api/v1/coins'
    const result = await retryFetch(url, { method: 'GET' })
    const json = await result.json()
    const coins = asGodexCoinsResponse(json)

    for (const coin of coins) {
      for (const network of coin.networks) {
        // Key format: "COIN_CODE:NETWORK_CODE" e.g. "USDT:TRX"
        const key = `${coin.code}:${network.code}`
        cache.set(key, {
          contractAddress: network.contract_address ?? undefined,
          chainId:
            network.chain_id != null
              ? parseInt(network.chain_id, 10)
              : undefined
        })
      }
    }
    log(`Coins cache loaded: ${cache.size} entries`)
  } catch (e) {
    log.error('Error loading coins cache:', e)
  }
  godexCoinsCache = cache
  return cache
}

interface GodexEdgeAssetInfo {
  pluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

async function getGodexEdgeAssetInfo(
  currencyCode: string,
  networkCode: string | undefined,
  isoDate: string,
  log: ScopedLog
): Promise<GodexEdgeAssetInfo> {
  const result: GodexEdgeAssetInfo = {
    pluginId: undefined,
    evmChainId: undefined,
    tokenId: undefined
  }

  if (networkCode == null) {
    // Only throw for transactions on or after the date when Godex started providing network codes
    if (isoDate >= GODEX_NETWORK_CODE_START_DATE) {
      throw new Error(`Godex: Missing network code for ${currencyCode}`)
    }
    // Older transactions without network codes cannot be backfilled
    return result
  }

  // Get pluginId from network code
  const pluginId = GODEX_NETWORK_TO_PLUGINID[networkCode]
  if (pluginId == null) {
    throw new Error(
      `Godex: Unknown network code '${networkCode}' for ${currencyCode}`
    )
  }
  result.pluginId = pluginId

  // Get evmChainId if applicable
  result.evmChainId = EVM_CHAIN_IDS[pluginId]

  // Get contract address from cache
  const cache = await getGodexCoinsCache(log)
  const key = `${currencyCode}:${networkCode}`
  const assetInfo = cache.get(key)

  if (assetInfo == null) {
    // Some native coins (like SOL) aren't in Godex's coins API
    // If currencyCode matches networkCode, assume it's a native coin
    if (currencyCode === networkCode) {
      result.tokenId = null
      return result
    }
    throw new Error(
      `Godex: Unknown currency code '${currencyCode}' for ${networkCode}`
    )
  }

  // Determine tokenId
  const tokenType = tokenTypes[pluginId]
  const contractAddress = assetInfo.contractAddress

  // For native assets (no contract address), tokenId is null
  // For tokens, use createTokenId
  if (contractAddress != null && contractAddress !== '') {
    // createTokenId will throw if token not supported on this chain
    result.tokenId = createTokenId(tokenType, currencyCode, contractAddress)
  } else {
    // Native asset, tokenId is null
    result.tokenId = null
  }

  return result
}

const asGodexStatus = asMaybe(
  asValue(
    'success',
    'wait',
    'overdue',
    'refund',
    'exchanging',
    'sending_confirmation',
    'other'
  ),
  'other'
)

const asGodexTx = asObject({
  status: asGodexStatus,
  transaction_id: asString,
  hash_in: asOptional(asString, ''),
  deposit: asString,
  coin_from: asString,
  deposit_amount: asString,
  withdrawal: asString,
  coin_to: asString,
  withdrawal_amount: asString,
  created_at: asString,
  network_from_code: asOptional(asString),
  network_to_code: asOptional(asString)
})

const asGodexResult = asArray(asUnknown)

type GodexTx = ReturnType<typeof asGodexTx>
type GodexStatus = ReturnType<typeof asGodexStatus>

const LIMIT = 100
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const statusMap: { [key in GodexStatus]: Status } = {
  success: 'complete',
  wait: 'pending',
  overdue: 'expired',
  refund: 'refunded',
  exchanging: 'processing',
  sending_confirmation: 'other',
  other: 'other'
}

export async function queryGodex(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const { settings, apiKeys } = asGodexPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings
  // let latestIsoDate = '2023-01-04T19:36:46.000Z'

  if (typeof apiKey !== 'string') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let done = false
  let offset = 0
  try {
    while (!done) {
      let oldestIsoDate = '999999999999999999999999999999999999'

      const url = `https://api.nrnb.io/api/v1/affiliate/history?limit=${LIMIT}&offset=${offset}`
      const headers = {
        'public-key': apiKey
      }

      const result = await retryFetch(url, { method: 'GET', headers: headers })
      const resultJSON = await result.json()
      const txs = asGodexResult(resultJSON)

      for (const rawTx of txs) {
        const standardTx = await processGodexTx(rawTx, pluginParams)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < oldestIsoDate) {
          oldestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < previousLatestIsoDate && !done) {
          log(`done: date ${standardTx.isoDate} < ${previousLatestIsoDate}`)
          done = true
        }
      }
      log(`oldestIsoDate ${oldestIsoDate}`)

      offset += LIMIT
      // this is if the end of the database is reached
      if (txs.length < LIMIT) {
        done = true
      }
    }
  } catch (e) {
    log.error(String(e))
    throw e
  }
  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}
export const godex: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryGodex,
  // results in a PluginResult
  pluginName: 'Godex',
  pluginId: 'godex'
}

export async function processGodexTx(
  rawTx: unknown,
  pluginParams: PluginParams
): Promise<StandardTx> {
  const { log } = pluginParams
  const tx: GodexTx = asGodexTx(rawTx)
  const ts = parseInt(tx.created_at)
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(ts)

  // Extract network codes from tx
  const networkFromCode = tx.network_from_code
  const networkToCode = tx.network_to_code

  // Get deposit asset info
  const depositCurrency = tx.coin_from.toUpperCase()
  const depositAssetInfo = await getGodexEdgeAssetInfo(
    depositCurrency,
    networkFromCode,
    isoDate,
    log
  )

  // Get payout asset info
  const payoutCurrency = tx.coin_to.toUpperCase()
  const payoutAssetInfo = await getGodexEdgeAssetInfo(
    payoutCurrency,
    networkToCode,
    isoDate,
    log
  )

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.transaction_id,
    countryCode: null,
    depositTxid: tx.hash_in,
    depositAddress: tx.deposit,
    depositAddressHash: hashAddress(tx.deposit),
    depositCurrency,
    depositChainPluginId: depositAssetInfo.pluginId,
    depositEvmChainId: depositAssetInfo.evmChainId,
    depositTokenId: depositAssetInfo.tokenId,
    depositAmount: safeParseFloat(tx.deposit_amount),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: undefined,
    payoutAddress: tx.withdrawal,
    payoutAddressHash: hashAddress(tx.withdrawal),
    payoutCurrency,
    payoutChainPluginId: payoutAssetInfo.pluginId,
    payoutEvmChainId: payoutAssetInfo.evmChainId,
    payoutTokenId: payoutAssetInfo.tokenId,
    payoutAmount: safeParseFloat(tx.withdrawal_amount),
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx: rawTx
  }
  return standardTx
}
