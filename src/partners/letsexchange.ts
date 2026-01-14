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
  ScopedLog,
  StandardTx,
  Status
} from '../types'
import { retryFetch, safeParseFloat, snooze } from '../util'
import { hashAddress } from '../util/addressHash'
import { createTokenId, EdgeTokenId, tokenTypes } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

const MAX_RETRIES = 5
const QUERY_INTERVAL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days in milliseconds
const LETSEXCHANGE_START_DATE = '2022-02-01T00:00:00.000Z'

/**
 * Max number of new transactions to save. This is to prevent overloading the db
 * write and potentially causing a timeout or failure. The query will be retried
 * starting from where it left off.
 */
const MAX_NEW_TRANSACTIONS = 20000

export const asLetsExchangePluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, LETSEXCHANGE_START_DATE)
  }),
  apiKeys: asObject({
    affiliateId: asString,
    apiKey: asString
  })
})

const asLetsExchangeStatus = asValue(
  'wait',
  'confirmation',
  'confirmed',
  'exchanging',
  'overdue',
  'refund',
  'sending',
  'transferring',
  'sending_confirmation',
  'success',
  'aml_check_failed',
  'overdue',
  'error',
  'canceled',
  'refund'
)

// Cleaner for the new v2 API response
const asLetsExchangeTx = asObject({
  status: asLetsExchangeStatus,
  transaction_id: asString,
  hash_in: asMaybe(asString, ''),
  deposit: asString,
  coin_from: asString,
  deposit_amount: asString,
  withdrawal: asString,
  coin_to: asString,
  withdrawal_amount: asString,
  created_at: asString,
  // Older network fields from v1 API
  network_from_code: asOptional(asEither(asString, asNull), null),
  network_to_code: asOptional(asEither(asString, asNull), null),
  // Network fields for asset info from v2 API
  coin_from_network: asOptional(asEither(asString, asNull), null),
  coin_to_network: asOptional(asEither(asString, asNull), null),
  // Contract addresses from v2 API
  coin_from_contract_address: asOptional(asEither(asString, asNull), null),
  coin_to_contract_address: asOptional(asEither(asString, asNull), null)
})

// Pagination response from v2 API
const asLetsExchangeV2Result = asObject({
  current_page: asNumber,
  last_page: asNumber,
  data: asArray(asUnknown)
})

// Cleaner for coins API response
const asLetsExchangeCoin = asObject({
  code: asString,
  network_code: asString,
  contract_address: asEither(asString, asNull),
  chain_id: asEither(asString, asNull)
})

const asLetsExchangeCoinsResult = asArray(asUnknown)

type LetsExchangeTxV2 = ReturnType<typeof asLetsExchangeTx>
type LetsExchangeStatus = ReturnType<typeof asLetsExchangeStatus>

const LIMIT = 1000

// Date when LetsExchange API started providing coin_from_network/coin_to_network fields.
// Based on direct API testing (Dec 2024), network fields are available for all
// transactions back to approximately Feb 23, 2022.
// Transactions before this date may be missing network fields and won't be backfilled.
// Transactions on or after this date MUST have network fields or will throw.
const NETWORK_FIELDS_AVAILABLE_DATE = '2022-02-24T00:00:00.000Z'

const statusMap: { [key in LetsExchangeStatus]: Status } = {
  wait: 'pending',
  confirmation: 'confirming',
  confirmed: 'processing',
  exchanging: 'processing',
  overdue: 'expired',
  refund: 'refunded',
  sending: 'processing',
  transferring: 'processing',
  sending_confirmation: 'withdrawing',
  success: 'complete',
  aml_check_failed: 'blocked',
  canceled: 'cancelled',
  error: 'failed'
}

// Map LetsExchange network codes to Edge pluginIds
// Values from coin_from_network / coin_to_network fields
const LETSEXCHANGE_NETWORK_TO_PLUGIN_ID: Record<string, string> = {
  ADA: 'cardano',
  ALGO: 'algorand',
  ARBITRUM: 'arbitrum',
  ARRR: 'piratechain',
  ATOM: 'cosmoshub',
  AVAX: 'avalanche',
  AVAXC: 'avalanche',
  BASE: 'base',
  BCH: 'bitcoincash',
  BEP2: 'binance',
  BEP20: 'binancesmartchain',
  BNB: 'binancesmartchain',
  BSV: 'bitcoinsv',
  BTC: 'bitcoin',
  BTG: 'bitcoingold',
  CELO: 'celo',
  CORE: 'coreum',
  COREUM: 'coreum',
  CTXC: 'cortex',
  DASH: 'dash',
  DGB: 'digibyte',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  EOS: 'eos',
  ERC20: 'ethereum',
  ETC: 'ethereumclassic',
  ETH: 'ethereum',
  ETHW: 'ethereumpow',
  EVER: 'everscale', // Everscale - not supported by Edge
  FIL: 'filecoin',
  FIO: 'fio',
  FIRO: 'zcoin',
  FTM: 'fantom',
  GRS: 'groestlcoin',
  HBAR: 'hedera',
  HYPEEVM: 'hyperevm',
  LTC: 'litecoin',
  MATIC: 'polygon',
  OPTIMISM: 'optimism',
  OSMO: 'osmosis',
  PIVX: 'pivx',
  QTUM: 'qtum',
  PLS: 'pulsechain',
  POL: 'polygon',
  RSK: 'rsk',
  RUNE: 'thorchainrune',
  RVN: 'ravencoin',
  SOL: 'solana',
  SONIC: 'sonic',
  SUI: 'sui',
  TLOS: 'telos',
  TON: 'ton',
  TRC20: 'tron',
  TRX: 'tron',
  WAXL: 'axelar',
  XEC: 'ecash',
  XLM: 'stellar',
  XMR: 'monero',
  XRP: 'ripple',
  XTZ: 'tezos',
  ZANO: 'zano',
  ZEC: 'zcash',
  ZKSERA: 'zksync',
  ZKSYNC: 'zksync'
}

// Native token placeholder addresses that should be treated as null (native coin)
// All values should be lowercase for case-insensitive matching
const NATIVE_TOKEN_ADDRESSES = new Set([
  '0', // Native token placeholder
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // Common EVM native placeholder
  'so11111111111111111111111111111111111111111', // Wrapped SOL (treat as native)
  'arbieth',
  'cchain',
  'eosio.token',
  'hjgfhj',
  'matic',
  'pol',
  'xmr1'
])

// In-memory cache for currency contract addresses
// Key format: `${code}_${network_code}` (both lowercase)
interface CoinInfo {
  contractAddress: string | null
  chainId: string | null
}

let coinCache: Map<string, CoinInfo> | null = null
let coinCacheApiKey: string | null = null

async function fetchCoinCache(apiKey: string, log: ScopedLog): Promise<void> {
  if (coinCache != null && coinCacheApiKey === apiKey) {
    return // Already cached
  }

  log('Fetching coins for cache...')

  const response = await retryFetch(
    'https://api.letsexchange.io/api/v1/coins',
    {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      method: 'GET'
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to fetch LetsExchange coins: ${text}`)
  }

  const result = await response.json()
  const coins = asLetsExchangeCoinsResult(result)

  coinCache = new Map()
  for (const rawCoin of coins) {
    try {
      const coin = asLetsExchangeCoin(rawCoin)
      // Create key from code and network_code (both lowercase)
      const key = `${coin.code.toLowerCase()}_${coin.network_code.toLowerCase()}`
      coinCache.set(key, {
        contractAddress: coin.contract_address,
        chainId: coin.chain_id
      })
    } catch {
      // Skip coins that don't match our cleaner
    }
  }

  coinCacheApiKey = apiKey
  log(`Cached ${coinCache.size} coins`)
}

interface AssetInfo {
  chainPluginId: string
  evmChainId: number | undefined
  tokenId: EdgeTokenId
}

function getAssetInfo(
  initialNetwork: string | null,
  currencyCode: string,
  contractAddress: string | null,
  log: ScopedLog
): AssetInfo | undefined {
  let network = initialNetwork
  if (network == null) {
    // Try using the currencyCode as the network
    network = currencyCode
    log(`Using currencyCode as network: ${network}`)
  }

  const networkUpper = network.toUpperCase()
  const chainPluginId = LETSEXCHANGE_NETWORK_TO_PLUGIN_ID[networkUpper]

  if (chainPluginId == null) {
    throw new Error(
      `Unknown network "${initialNetwork}" for currency ${currencyCode}. Add mapping to LETSEXCHANGE_NETWORK_TO_PLUGIN_ID.`
    )
  }

  // Get evmChainId if this is an EVM chain
  const evmChainId = EVM_CHAIN_IDS[chainPluginId]
  const tokenType = tokenTypes[chainPluginId]

  // Determine tokenId from the contract address in the response
  let tokenId: EdgeTokenId = null

  if (contractAddress == null) {
    // Try to lookup contract address from cache
    const key = `${currencyCode.toLowerCase()}_${network.toLowerCase()}`
    const coinInfo = coinCache?.get(key)
    if (coinInfo != null) {
      contractAddress = coinInfo.contractAddress
    } else {
      // Try appending the network to the currency code
      const backupKey = `${currencyCode.toLowerCase()}-${network.toLowerCase()}_${network.toLowerCase()}`
      const backupCoinInfo = coinCache?.get(backupKey)
      if (backupCoinInfo != null) {
        contractAddress = backupCoinInfo.contractAddress
      }
    }
  }

  if (
    contractAddress != null &&
    !NATIVE_TOKEN_ADDRESSES.has(contractAddress.toLowerCase()) &&
    contractAddress.toLowerCase() !== currencyCode.toLowerCase()
  ) {
    if (tokenType == null) {
      throw new Error(
        `Unknown tokenType for chainPluginId "${chainPluginId}" (currency: ${currencyCode}, contract: ${contractAddress}). Add tokenType to tokenTypes.`
      )
    }
    // createTokenId will throw if the chain doesn't support tokens
    tokenId = createTokenId(tokenType, currencyCode, contractAddress)
  }

  return { chainPluginId, evmChainId, tokenId }
}

export async function queryLetsExchange(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const { settings, apiKeys } = asLetsExchangePluginParams(pluginParams)
  const { affiliateId, apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null || affiliateId == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  const headers = {
    Authorization: 'Bearer ' + apiKey
  }

  // Query from the saved date forward in 30-day chunks (oldest to newest)
  let windowStart = new Date(latestIsoDate).getTime() - QUERY_INTERVAL_MS
  const now = Date.now()
  let done = false
  let newTxStart: number = 0

  // Outer loop: iterate over 30-day windows
  while (windowStart < now && !done) {
    const windowEnd = Math.min(windowStart + QUERY_INTERVAL_MS, now)
    const startTimestamp = Math.floor(windowStart / 1000)
    const endTimestamp = Math.floor(windowEnd / 1000)

    const windowStartIso = new Date(windowStart).toISOString()
    const windowEndIso = new Date(windowEnd).toISOString()
    log(`Querying ${windowStartIso} to ${windowEndIso}`)

    let page = 1
    let retry = 0

    // Inner loop: paginate through results within this window
    while (!done) {
      const url = `https://api.letsexchange.io/api/v2/transactions-list?limit=${LIMIT}&page=${page}&start_date=${startTimestamp}&end_date=${endTimestamp}`

      try {
        const result = await retryFetch(url, { headers, method: 'GET' })
        if (!result.ok) {
          const text = await result.text()
          log.error(`error at page ${page}: ${text}`)
          throw new Error(text)
        }
        const resultJSON = await result.json()
        const resultData = asLetsExchangeV2Result(resultJSON)
        const txs = resultData.data
        const currentPage = resultData.current_page
        const lastPage = resultData.last_page

        for (const rawTx of txs) {
          const standardTx = await processLetsExchangeTx(rawTx, pluginParams)
          standardTxs.push(standardTx)
          if (standardTx.isoDate > latestIsoDate) {
            if (newTxStart === 0) {
              newTxStart = standardTxs.length
            }
            latestIsoDate = standardTx.isoDate
          }
        }

        log(`page ${page}/${lastPage} latestIsoDate ${latestIsoDate}`)

        // Check if we've reached the last page for this window
        if (currentPage >= lastPage || txs.length === 0) {
          break
        }

        page++
        retry = 0
        if (standardTxs.length - newTxStart >= MAX_NEW_TRANSACTIONS) {
          latestIsoDate = windowStartIso
          log.warn(
            `Max new transactions reached, saving progress at ${latestIsoDate}`
          )
          done = true
          break
        }
      } catch (e) {
        log.error(String(e))
        // Retry a few times with time delay to prevent throttling
        retry++
        if (retry <= MAX_RETRIES) {
          log.warn(`Snoozing ${5 * retry}s`)
          await snooze(5000 * retry)
        } else {
          // We can safely save our progress since we go from oldest to newest.
          latestIsoDate = windowStartIso
          done = true
          log.error(`Max retries reached, saving progress at ${latestIsoDate}`)
        }
      }
    }

    // Move to the next 30-day window
    windowStart = windowEnd
  }

  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const letsexchange: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryLetsExchange,
  // results in a PluginResult
  pluginName: 'LetsExchange',
  pluginId: 'letsexchange'
}

export async function processLetsExchangeTx(
  rawTx: unknown,
  pluginParams: PluginParams
): Promise<StandardTx> {
  const { apiKeys } = asLetsExchangePluginParams(pluginParams)
  const { apiKey } = apiKeys
  const { log } = pluginParams

  await fetchCoinCache(apiKey, log)

  const tx = asLetsExchangeTx(rawTx)

  // created_at is in format "2025-12-13 07:22:50" (UTC assumed) or UNIX timestamp (10 digits)
  let date: Date
  if (/^\d{10}$/.test(tx.created_at)) {
    date = new Date(parseInt(tx.created_at) * 1000)
  } else {
    date = new Date(tx.created_at.replace(' ', 'T') + 'Z')
  }
  const timestamp = Math.floor(date.getTime() / 1000)
  const isoDate = date.toISOString()

  // Get deposit asset info using contract address from API response
  const depositAsset = getAssetInfo(
    tx.coin_from_network ?? tx.network_from_code,
    tx.coin_from,
    tx.coin_from_contract_address,
    log
  )
  // Get payout asset info using contract address from API response
  const payoutAsset = getAssetInfo(
    tx.coin_to_network ?? tx.network_to_code,
    tx.coin_to,
    tx.coin_to_contract_address,
    log
  )

  const status = statusMap[tx.status]
  if (status == null) {
    throw new Error(`Unknown LetsExchange status "${tx.status}"`)
  }

  const standardTx: StandardTx = {
    status,
    orderId: tx.transaction_id,
    countryCode: null,
    depositTxid: tx.hash_in,
    depositAddress: tx.deposit,
    depositAddressHash: hashAddress(tx.deposit),
    depositCurrency: tx.coin_from.toUpperCase(),
    depositChainPluginId: depositAsset?.chainPluginId,
    depositEvmChainId: depositAsset?.evmChainId,
    depositTokenId: depositAsset?.tokenId,
    depositAmount: safeParseFloat(tx.deposit_amount),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: undefined,
    payoutAddress: tx.withdrawal,
    payoutAddressHash: hashAddress(tx.withdrawal),
    payoutCurrency: tx.coin_to.toUpperCase(),
    payoutChainPluginId: payoutAsset?.chainPluginId,
    payoutEvmChainId: payoutAsset?.evmChainId,
    payoutTokenId: payoutAsset?.tokenId,
    payoutAmount: safeParseFloat(tx.withdrawal_amount),
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}
