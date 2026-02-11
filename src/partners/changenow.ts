import {
  asArray,
  asMaybe,
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
import { retryFetch, snooze } from '../util'
import {
  ChainNameToPluginIdMapping,
  createTokenId,
  EdgeTokenId,
  tokenTypes
} from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

// Map ChangeNow network names to Edge pluginIds
const CHANGENOW_NETWORK_TO_PLUGIN_ID: ChainNameToPluginIdMapping = {
  btc: 'bitcoin',
  ltc: 'litecoin',
  eth: 'ethereum',
  xrp: 'ripple',
  xmr: 'monero',
  bch: 'bitcoincash',
  doge: 'dogecoin',
  xlm: 'stellar',
  trx: 'tron',
  bsc: 'binancesmartchain',
  sol: 'solana',
  ada: 'cardano',
  matic: 'polygon',
  arbitrum: 'arbitrum',
  base: 'base',
  hbar: 'hedera',
  algo: 'algorand',
  ton: 'ton',
  sui: 'sui',
  cchain: 'avalanche',
  avaxc: 'avalanche',
  zec: 'zcash',
  osmo: 'osmosis',
  etc: 'ethereumclassic',
  fil: 'filecoin',
  ftm: 'fantom',
  xtz: 'tezos',
  atom: 'cosmoshub',
  dot: 'polkadot',
  dash: 'dash',
  dgb: 'digibyte',
  rvn: 'ravencoin',
  bsv: 'bitcoinsv',
  pls: 'pulsechain',
  zksync: 'zksync',
  op: 'optimism',
  opbnb: 'opbnb',
  optimism: 'optimism',
  coreum: 'coreum',
  xec: 'ecash',
  pivx: 'pivx',
  pulse: 'pulsechain',
  sonic: 'sonic',
  fio: 'fio',
  qtum: 'qtum',
  celo: 'celo',
  one: 'harmony',
  ethw: 'ethereumpow',
  binance: 'binance',
  bnb: 'binance',
  firo: 'zcoin',
  axl: 'axelar',
  stx: 'stacks',
  btg: 'bitcoingold',
  rune: 'thorchain',
  eos: 'eos',
  grs: 'groestlcoin',
  xchain: 'avalanchexchain',
  vet: 'vechain',
  waxp: 'wax',
  theta: 'theta',
  ebst: 'eboost',
  vtc: 'vertcoin',
  smart: 'smartcash',
  xzc: 'zcoin',
  kin: 'kin',
  eurs: 'eurs',
  noah: 'noah',
  dgtx: 'dgtx',
  ptoy: 'ptoy',
  fct: 'factom'
}

// Cleaner for ChangeNow currency API response
const asChangeNowCurrency = asObject({
  ticker: asString,
  network: asString,
  tokenContract: asOptional(asString),
  legacyTicker: asOptional(asString)
})

const asChangeNowCurrencyArray = asArray(asChangeNowCurrency)

type ChangeNowCurrency = ReturnType<typeof asChangeNowCurrency>

// In-memory cache for currency lookups
// Key format: "ticker:network" -> tokenContract
interface CurrencyCache {
  currencies: Map<string, string | null> // ticker:network -> tokenContract
  loaded: boolean
}

const currencyCache: CurrencyCache = {
  currencies: new Map(),
  loaded: false
}

/**
 * Fetch all currencies from ChangeNow API and populate the cache
 */
async function loadCurrencyCache(
  log: ScopedLog,
  apiKey?: string
): Promise<void> {
  if (currencyCache.loaded) {
    return
  }

  try {
    // The exchange/currencies endpoint doesn't require authentication
    const url = 'https://api.changenow.io/v2/exchange/currencies?active=true'
    const response = await retryFetch(url, {
      method: 'GET'
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to fetch currencies: ${text}`)
    }

    const result = await response.json()
    const currencies = asChangeNowCurrencyArray(result)

    for (const currency of currencies) {
      const key = `${currency.ticker.toLowerCase()}:${currency.network.toLowerCase()}`
      currencyCache.currencies.set(key, currency.tokenContract ?? null)

      // Also cache by legacyTicker if different from ticker
      if (
        currency.legacyTicker != null &&
        currency.legacyTicker !== currency.ticker
      ) {
        const legacyKey = `${currency.legacyTicker.toLowerCase()}:${currency.network.toLowerCase()}`
        currencyCache.currencies.set(legacyKey, currency.tokenContract ?? null)
      }
    }

    currencyCache.loaded = true
    log(`Currency cache loaded with ${currencies.length} entries`)
  } catch (e) {
    log.error(`Error loading currency cache: ${e}`)
    throw e
  }
}

/**
 * Look up contract address from cache
 */
function getContractFromCache(
  ticker: string,
  network: string
): string | null | undefined {
  const key = `${ticker.toLowerCase()}:${network.toLowerCase()}`
  if (currencyCache.currencies.has(key)) {
    return currencyCache.currencies.get(key)
  }
  // Return undefined if not in cache (different from null which means native token)
  return undefined
}

const asChangeNowStatus = asMaybe(
  asValue('finished', 'waiting', 'expired'),
  'other'
)

const asChangeNowTx = asObject({
  createdAt: asString,
  requestId: asString,
  status: asChangeNowStatus,
  payin: asObject({
    currency: asString,
    network: asString,
    address: asString,
    amount: asOptional(asNumber),
    expectedAmount: asOptional(asNumber),
    hash: asOptional(asString)
  }),
  payout: asObject({
    currency: asString,
    network: asString,
    address: asString,
    amount: asOptional(asNumber),
    expectedAmount: asOptional(asNumber),
    hash: asOptional(asString)
  })
})

const asChangeNowResult = asObject({ exchanges: asArray(asUnknown) })

type ChangeNowTx = ReturnType<typeof asChangeNowTx>
type ChangeNowStatus = ReturnType<typeof asChangeNowStatus>

// Custom plugin params cleaner
const asChangeNowPluginParams = asObject({
  apiKeys: asObject({
    apiKey: asOptional(asString)
  }),
  settings: asObject({
    latestIsoDate: asOptional(asString, '1970-01-01T00:00:00.000Z')
  })
})

type ChangeNowPluginParams = ReturnType<typeof asChangeNowPluginParams>

const MAX_RETRIES = 5
const LIMIT = 200
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

const statusMap: { [key in ChangeNowStatus]: Status } = {
  finished: 'complete',
  waiting: 'pending',
  expired: 'expired',
  other: 'other'
}

export const queryChangeNow = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const { log } = pluginParams
  const cleanParams = asChangeNowPluginParams(pluginParams)
  const { apiKey } = cleanParams.apiKeys
  let { latestIsoDate } = cleanParams.settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let offset = 0
  let retry = 0
  while (true) {
    const url = `https://api.changenow.io/v2/exchanges?sortDirection=ASC&limit=${LIMIT}&dateFrom=${previousLatestIsoDate}&offset=${offset}`

    try {
      const response = await retryFetch(url, {
        method: 'GET',
        headers: {
          'x-changenow-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      })
      if (!response.ok) {
        const text = await response.text()
        log.error(`Error in offset:${offset}`)
        throw new Error(text)
      }
      const result = await response.json()
      const txs = asChangeNowResult(result).exchanges

      if (txs.length === 0) {
        break
      }
      for (const rawTx of txs) {
        const standardTx = await processChangeNowTx(rawTx, pluginParams)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
      }
      log(`offset ${offset} latestIsoDate ${latestIsoDate}`)
      offset += txs.length
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
  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const changenow: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryChangeNow,
  // results in a PluginResult
  pluginName: 'Changenow',
  pluginId: 'changenow'
}

interface EdgeAssetInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

/**
 * Get the Edge asset info for a given network and currency code.
 * Uses the cached currency data from the ChangeNow API.
 */
function getAssetInfo(network: string, currencyCode: string): EdgeAssetInfo {
  // Map network to pluginId
  const chainPluginId = CHANGENOW_NETWORK_TO_PLUGIN_ID[network.toLowerCase()]
  if (chainPluginId == null) {
    throw new Error(`Unknown network: ${network}`)
  }

  const evmChainId = EVM_CHAIN_IDS[chainPluginId]

  // Look up contract address from cache
  const contractAddress = getContractFromCache(currencyCode, network)

  // If not in cache or no contract address, it's a native token
  if (contractAddress == null) {
    return {
      chainPluginId,
      evmChainId,
      tokenId: null
    }
  }

  // Create tokenId from contract address
  const tokenType = tokenTypes[chainPluginId]
  if (tokenType == null) {
    // Chain doesn't support tokens, but we have a contract address
    // This shouldn't happen, but treat as native
    return {
      chainPluginId,
      evmChainId,
      tokenId: null
    }
  }

  try {
    const tokenId = createTokenId(
      tokenType,
      currencyCode.toUpperCase(),
      contractAddress
    )
    return {
      chainPluginId,
      evmChainId,
      tokenId
    }
  } catch (e) {
    // If tokenId creation fails, treat as native (no log available in this sync function)
    return {
      chainPluginId,
      evmChainId,
      tokenId: null
    }
  }
}

export async function processChangeNowTx(
  rawTx: unknown,
  pluginParams: PluginParams
): Promise<StandardTx> {
  const { log } = pluginParams
  // Load currency cache before processing transactions
  await loadCurrencyCache(log)

  const tx: ChangeNowTx = asChangeNowTx(rawTx)
  const date = new Date(
    tx.createdAt.endsWith('Z') ? tx.createdAt : tx.createdAt + 'Z'
  )
  const timestamp = date.getTime() / 1000

  // Get deposit asset info
  const depositAsset = getAssetInfo(tx.payin.network, tx.payin.currency)

  // Get payout asset info
  const payoutAsset = getAssetInfo(tx.payout.network, tx.payout.currency)

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.requestId,
    countryCode: null,
    depositTxid: tx.payin.hash,
    depositAddress: tx.payin.address,
    depositCurrency: tx.payin.currency.toUpperCase(),
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: tx.payin.amount ?? tx.payin.expectedAmount ?? 0,
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.payout.hash,
    payoutAddress: tx.payout.address,
    payoutCurrency: tx.payout.currency.toUpperCase(),
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: tx.payout.amount ?? tx.payout.expectedAmount ?? 0,
    timestamp,
    isoDate: date.toISOString(),
    usdValue: -1,
    rawTx
  }

  return standardTx
}
