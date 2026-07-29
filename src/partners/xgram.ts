import {
  asArray,
  asEither,
  asMap,
  asMaybe,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  asStandardPluginParams,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { retryFetch, safeParseFloat, snooze } from '../util'
import { createTokenId, EdgeTokenId, tokenTypes } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

const asXgramStatus = asMaybe(
  asValue(
    'x-new',
    'x-awaiting_funds',
    'x-funds_received',
    'x-processing_exchange',
    'x-transferring',
    'x-completed',
    'x-timeout',
    'x-error',
    'x-transfer_error',
    'x-returned'
  ),
  'other'
)

const asXgramAmount = asMaybe(asEither(asNumber, asString), null)

const asXgramTx = asObject({
  date: asString,
  id: asString,
  'x-status': asXgramStatus,
  'x-fromCcy': asString,
  'x-toCcy': asString,
  'x-ccyDepositAddress': asString,
  'x-ccyDepositHash': asMaybe(asString, undefined),
  'x-ccyExpectedAmountFrom': asNumber,
  'x-ccyExpectedAmountTo': asNumber,
  'x-ccyAmountFrom': asXgramAmount,
  'x-ccyDestinationAddress': asString,
  'x-ccyAmountTo': asXgramAmount,
  txId: asMaybe(asString, undefined)
})

const asXgramResult = asObject({ exchanges: asArray(asUnknown) })
const asXgramCurrency = asObject({
  coinName: asString,
  network: asString,
  contract: asOptional(asString, '')
})
const asXgramCurrencies = asMap(asXgramCurrency)

type XgramTxTx = ReturnType<typeof asXgramTx>
type XgramStatus = ReturnType<typeof asXgramStatus>
export type XgramCurrencies = ReturnType<typeof asXgramCurrencies>

interface EdgeAssetInfo {
  chainPluginId: string
  evmChainId: number | undefined
  tokenId: EdgeTokenId
}

const MAX_RETRIES = 5
const LIMIT = 50
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

const statusMap: { [key in XgramStatus]: Status } = {
  'x-new': 'pending',
  'x-awaiting_funds': 'confirming',
  'x-funds_received': 'processing',
  'x-processing_exchange': 'processing',
  'x-transferring': 'withdrawing',
  'x-completed': 'complete',
  'x-timeout': 'expired',
  'x-error': 'failed',
  'x-transfer_error': 'failed',
  'x-returned': 'refunded',
  other: 'other'
}

const XGRAM_NETWORK_TO_PLUGIN_ID: Record<string, string> = {
  ADA: 'cardano',
  Algorand: 'algorand',
  ARBITRUM: 'arbitrum',
  AVAX: 'avalanche',
  'AVAX C-Chain': 'avalanche',
  AVAXC: 'avalanche',
  BASE: 'base',
  BEP20: 'binancesmartchain',
  Bitcoin: 'bitcoin',
  BitcoinCash: 'bitcoincash',
  'Bitcoin SV': 'bitcoinsv',
  BitcoinGold: 'bitcoingold',
  CELO: 'celo',
  Cosmos: 'cosmoshub',
  'Digital Cash': 'dash',
  EOS: 'eos',
  ERC20: 'ethereum',
  ETH: 'ethereum',
  EthereumPoW: 'ethereumpow',
  Fantom: 'fantom',
  Filecoin: 'filecoin',
  FIO: 'fio',
  Hedera: 'hedera',
  Litecoin: 'litecoin',
  Monero: 'monero',
  OPTIMISM: 'optimism',
  Polkadot: 'polkadot',
  POLYGON: 'polygon',
  Quantum: 'qtum',
  Ravencoin: 'ravencoin',
  RBTC: 'rsk',
  Ripple: 'ripple',
  SOL: 'solana',
  'Stellar Lumens': 'stellar',
  SUI: 'sui',
  Tezos: 'tezos',
  TON: 'ton',
  TRC20: 'tron',
  Vertcoin: 'vertcoin',
  Wax: 'wax',
  XEC: 'ecash',
  ZANO: 'zano',
  Zcash: 'zcash',
  Zcoin: 'zcoin',
  ZKSYNC: 'zksync'
}

const NATIVE_TICKERS: Record<string, Set<string>> = {
  algorand: new Set(['ALGO']),
  arbitrum: new Set(['ETH']),
  avalanche: new Set(['AVAX']),
  base: new Set(['ETH']),
  binancesmartchain: new Set(['BNB']),
  bitcoin: new Set(['BTC']),
  bitcoincash: new Set(['BCH']),
  bitcoingold: new Set(['BTG']),
  bitcoinsv: new Set(['BSV']),
  cardano: new Set(['ADA']),
  celo: new Set(['CELO']),
  cosmoshub: new Set(['ATOM']),
  dash: new Set(['DASH']),
  ecash: new Set(['XEC']),
  eos: new Set(['EOS']),
  ethereum: new Set(['ETH']),
  ethereumpow: new Set(['ETHW']),
  fantom: new Set(['FTM']),
  filecoin: new Set(['FIL']),
  fio: new Set(['FIO']),
  hedera: new Set(['HBAR']),
  litecoin: new Set(['LTC']),
  monero: new Set(['XMR']),
  optimism: new Set(['ETH']),
  polkadot: new Set(['DOT']),
  polygon: new Set(['MATIC', 'POL']),
  qtum: new Set(['QTUM']),
  ravencoin: new Set(['RVN']),
  rsk: new Set(['RBTC']),
  ripple: new Set(['XRP']),
  solana: new Set(['SOL']),
  stellar: new Set(['XLM']),
  sui: new Set(['SUI']),
  tezos: new Set(['XTZ']),
  ton: new Set(['TON']),
  tron: new Set(['TRX']),
  vertcoin: new Set(['VTC']),
  wax: new Set(['WAXP']),
  zano: new Set(['ZANO']),
  zcash: new Set(['ZEC']),
  zcoin: new Set(['XZC']),
  zksync: new Set(['ETHZKSYNC'])
}

const GASTOKEN_CONTRACTS = new Set([
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'So11111111111111111111111111111111111111111',
  'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'
])

let currencyCache: XgramCurrencies | undefined
let currencyCacheTimestamp = 0

const MISSING_CURRENCIES: XgramCurrencies = {
  ADA: {
    coinName: 'Cardano',
    network: 'ADA',
    contract: ''
  },
  ATOM: {
    coinName: 'Cosmos',
    network: 'Cosmos',
    contract: ''
  },
  LINK: {
    coinName: 'Chainlink',
    network: 'ERC20',
    contract: '0x514910771af9ca656af840dff83e8264ecf986ca'
  },
  USDC: {
    coinName: 'USD Coin',
    network: 'ERC20',
    contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
  },
  USDCSOLANA: {
    coinName: 'USD Coin',
    network: 'SOL',
    contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  },
  USDT: {
    coinName: 'Tether',
    network: 'ERC20',
    contract: '0xdac17f958d2ee523a2206206994597c13d831ec7'
  },
  USDTSOLANA: {
    coinName: 'Tether',
    network: 'SOL',
    contract: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  },
  USDTTRC20: {
    coinName: 'Tether',
    network: 'TRC20',
    contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
  },
  ZEC: {
    coinName: 'Zcash',
    network: 'Zcash',
    contract: ''
  }
}

async function fetchCurrencyCache(
  apiKey: string,
  log: PluginParams['log']
): Promise<XgramCurrencies> {
  if (
    currencyCache != null &&
    Date.now() - currencyCacheTimestamp < CACHE_TTL_MS
  ) {
    return currencyCache
  }

  const response = await retryFetch(
    'https://xgram.io/api/v1/list-currency-options',
    {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    }
  )
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Xgram currency list error ${response.status}: ${text}`)
  }

  const result = await response.json()
  // Hardcoded fallbacks first so the live catalog can correct/overwrite them.
  currencyCache = {
    ...MISSING_CURRENCIES,
    ...asXgramCurrencies(result)
  }
  currencyCacheTimestamp = Date.now()
  log(`Cached ${Object.keys(currencyCache).length} Xgram currencies`)
  return currencyCache
}

function isNativeTicker(chainPluginId: string, currencyCode: string): boolean {
  return NATIVE_TICKERS[chainPluginId]?.has(currencyCode.toUpperCase()) ?? false
}

function isGasTokenContract(contract: string): boolean {
  return (
    GASTOKEN_CONTRACTS.has(contract) ||
    GASTOKEN_CONTRACTS.has(contract.toLowerCase())
  )
}

function getAssetInfo(
  currencyCode: string,
  currencies: XgramCurrencies
): EdgeAssetInfo {
  const currency = currencies[currencyCode]
  if (currency == null) {
    throw new Error(`Unknown Xgram currency: ${currencyCode}`)
  }

  const chainPluginId = XGRAM_NETWORK_TO_PLUGIN_ID[currency.network]
  if (chainPluginId == null) {
    throw new Error(
      `Unknown Xgram network "${currency.network}" for ${currencyCode}`
    )
  }

  const evmChainId = EVM_CHAIN_IDS[chainPluginId]
  const contract = (currency.contract ?? '').trim()
  const isNative =
    isNativeTicker(chainPluginId, currencyCode) || isGasTokenContract(contract)

  if (contract === '' || isNative) {
    if (isNative) {
      return { chainPluginId, evmChainId, tokenId: null }
    }
    throw new Error(
      `Missing Xgram contract for non-native ${currencyCode} on ${currency.network}`
    )
  }

  const tokenType = tokenTypes[chainPluginId]
  if (tokenType == null) {
    throw new Error(
      `Unknown tokenType for ${chainPluginId} (${currencyCode} on ${currency.network})`
    )
  }

  return {
    chainPluginId,
    evmChainId,
    tokenId: createTokenId(tokenType, currencyCode, contract)
  }
}

function parseAmount(
  amount: ReturnType<typeof asXgramAmount>,
  fallback: number
): number {
  if (amount == null) return fallback
  if (typeof amount === 'number') return amount
  return safeParseFloat(amount)
}

function parseXgramDate(date: string): { isoDate: string; timestamp: number } {
  const match = date.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}:\d{2})$/)
  if (match == null) {
    throw new Error(`Unexpected Xgram date format: ${date}`)
  }
  const [, day, month, year, time] = match
  const parsed = new Date(`${year}-${month}-${day}T${time}Z`)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid Xgram date: ${date}`)
  }
  return { isoDate: parsed.toISOString(), timestamp: parsed.getTime() / 1000 }
}

export const queryXgram = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const { log } = pluginParams
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  const { latestIsoDate } = settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const targetIsoDate = new Date(previousTimestamp).toISOString()

  const currencies = await fetchCurrencyCache(apiKey, log)

  // Because Xgram pages from newest to oldest, the watermark can only be
  // advanced once the entire newer-than-target range has been fetched and
  // processed without error. Track the candidate watermark separately and only
  // return it when the run completes cleanly; bailing out early (e.g. a
  // permanent fetch failure) must leave the persisted watermark untouched so
  // the next run re-queries the same range instead of skipping the orders that
  // were never reached.
  let newLatestIsoDate = latestIsoDate
  let completed = false
  let page = 0
  let retry = 0
  let done = false
  while (!done) {
    const url = `https://xgram.io/api/v1/exchange-history?page=${page}&limit=${LIMIT}`
    let txs
    try {
      const response = await retryFetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Xgram history error ${response.status}: ${text}`)
      }
      const result = await response.json()
      txs = asXgramResult(result).exchanges
    } catch (e) {
      log.error(String(e))
      // Retry a few times with time delay to prevent throttling
      retry++
      if (retry <= MAX_RETRIES) {
        log.warn(`Snoozing ${5 * retry}s`)
        await snooze(5000 * retry)
        continue
      } else {
        // Permanent fetch failure: stop without advancing the watermark.
        break
      }
    }

    if (txs.length === 0) {
      // Reached the end of Xgram's history: the full range was fetched.
      completed = true
      break
    }
    let oldestIsoDate = '999999999999999999999999999999999999'
    for (const rawTx of txs) {
      const standardTx = processXgramTx(rawTx, currencies)
      if (standardTx.isoDate < oldestIsoDate) {
        oldestIsoDate = standardTx.isoDate
      }
      if (standardTx.isoDate < targetIsoDate) {
        // Reached the lookback boundary: every order newer than the target has
        // been processed, so the run is complete.
        completed = true
        done = true
        break
      }
      standardTxs.push(standardTx)
      if (standardTx.isoDate > newLatestIsoDate) {
        newLatestIsoDate = standardTx.isoDate
      }
    }
    log(
      `Xgram page ${page} oldestIsoDate ${oldestIsoDate} targetIsoDate ${targetIsoDate}`
    )
    page += 1
    retry = 0
  }
  const out: PluginResult = {
    settings: { latestIsoDate: completed ? newLatestIsoDate : latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const xgram: PartnerPlugin = {
  queryFunc: queryXgram,
  pluginName: 'xgram',
  pluginId: 'xgram'
}

export function processXgramTx(
  rawTx: unknown,
  currencies: XgramCurrencies
): StandardTx {
  const tx: XgramTxTx = asXgramTx(rawTx)
  const { isoDate, timestamp } = parseXgramDate(tx.date)
  const depositCurrency = tx['x-fromCcy'].toUpperCase()
  const payoutCurrency = tx['x-toCcy'].toUpperCase()
  const depositAsset = getAssetInfo(depositCurrency, currencies)
  const payoutAsset = getAssetInfo(payoutCurrency, currencies)
  const standardTx: StandardTx = {
    status: statusMap[tx['x-status']],
    orderId: tx.id,
    countryCode: null,
    depositTxid: tx['x-ccyDepositHash'],
    depositAddress: tx['x-ccyDepositAddress'],
    depositCurrency,
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: parseAmount(
      tx['x-ccyAmountFrom'],
      tx['x-ccyExpectedAmountFrom']
    ),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.txId,
    payoutAddress: tx['x-ccyDestinationAddress'],
    payoutCurrency,
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: parseAmount(tx['x-ccyAmountTo'], tx['x-ccyExpectedAmountTo']),
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }

  return standardTx
}
