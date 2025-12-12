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
import {
  datelog,
  retryFetch,
  safeParseFloat,
  smartIsoDateFromTimestamp
} from '../util'
import { createTokenId, EdgeTokenId, tokenTypes } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

const asChangeHeroStatus = asMaybe(asValue('finished', 'expired'), 'other')

const asChangeHeroTx = asObject({
  id: asString,
  status: asChangeHeroStatus,
  payinHash: asMaybe(asString, undefined),
  payoutHash: asMaybe(asString, undefined),
  payinAddress: asString,
  currencyFrom: asString,
  amountFrom: asString,
  payoutAddress: asString,
  currencyTo: asString,
  amountTo: asString,
  createdAt: asNumber,
  chainFrom: asOptional(asString),
  chainTo: asOptional(asString)
})

// Cleaner for currency data from getCurrenciesFull API
const asChangeHeroCurrency = asObject({
  name: asString, // ticker
  blockchain: asString, // chain name
  contractAddress: asEither(asString, asNull)
})

const asChangeHeroCurrenciesResult = asObject({
  result: asArray(asChangeHeroCurrency)
})

const asChangeHeroPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, '0')
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString)
  })
})

const asChangeHeroResult = asObject({
  result: asArray(asUnknown)
})

type ChangeHeroTx = ReturnType<typeof asChangeHeroTx>
type ChangeHeroStatus = ReturnType<typeof asChangeHeroStatus>

const API_URL = 'https://api.changehero.io/v2/'
const LIMIT = 300
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

// Date after which chainFrom/chainTo fields are required in rawTx
// Transactions before this date are allowed to skip asset info backfill
// Based on database analysis: newest tx without chain fields was 2023-12-03
const CHAIN_FIELDS_REQUIRED_DATE = '2023-12-04T00:00:00.000Z'

const statusMap: { [key in ChangeHeroStatus]: Status } = {
  finished: 'complete',
  expired: 'expired',
  other: 'other'
}

// Map Changehero chain names to Edge pluginIds
const CHANGEHERO_CHAIN_TO_PLUGIN_ID: Record<string, string> = {
  algorand: 'algorand',
  arbitrum: 'arbitrum',
  avalanche: 'avalanche',
  'avalanche_(c-chain)': 'avalanche',
  base: 'base',
  binance: 'binance',
  binance_smart_chain: 'binancesmartchain',
  binancesmartchain: 'binancesmartchain',
  bitcoin: 'bitcoin',
  bitcoincash: 'bitcoincash',
  bitcoinsv: 'bitcoinsv',
  cardano: 'cardano',
  cosmos: 'cosmoshub',
  dash: 'dash',
  digibyte: 'digibyte',
  dogecoin: 'dogecoin',
  ethereum: 'ethereum',
  ethereumclassic: 'ethereumclassic',
  hedera: 'hedera',
  hypeevm: 'hyperevm',
  litecoin: 'litecoin',
  monero: 'monero',
  optimism: 'optimism',
  polkadot: 'polkadot',
  polygon: 'polygon',
  qtum: 'qtum',
  ripple: 'ripple',
  solana: 'solana',
  stellar: 'stellar',
  sui: 'sui',
  tezos: 'tezos',
  ton: 'ton',
  tron: 'tron'
}

// Cache for currency contract addresses: key = "TICKER_chain" -> contractAddress
interface CurrencyInfo {
  contractAddress: string | null
}
let currencyCache: Map<string, CurrencyInfo> | null = null

function makeCurrencyCacheKey(ticker: string, chain: string): string {
  return `${ticker.toUpperCase()}_${chain.toLowerCase()}`
}

// Hardcoded fallback for currencies not in getCurrenciesFull API
// Key format: "TICKER_chain" (uppercase ticker, lowercase chain)
const MISSING_CURRENCIES: Record<string, CurrencyInfo> = {
  AVAX_avalanche: { contractAddress: null },
  BCH_bitcoincash: { contractAddress: null },
  BNB_binance: { contractAddress: null },
  BNB_binancesmartchain: { contractAddress: null },
  BSV_bitcoinsv: { contractAddress: null },
  BUSD_binance_smart_chain: {
    contractAddress: '0xe9e7cea3dedca5984780bafc599bd69add087d56'
  },
  BUSD_binancesmartchain: {
    contractAddress: '0xe9e7cea3dedca5984780bafc599bd69add087d56'
  },
  BUSD_ethereum: {
    contractAddress: '0x4fabb145d64652a948d72533023f6e7a623c7c53'
  },
  DOGE_dogecoin: { contractAddress: null },
  ETC_ethereumclassic: { contractAddress: null },
  FTM_ethereum: {
    contractAddress: '0x4e15361fd6b4bb609fa63c81a2be19d873717870'
  },
  GALA_ethereum: {
    contractAddress: '0xd1d2eb1b1e90b638588728b4130137d262c87cae'
  },
  KEY_ethereum: {
    contractAddress: '0x4cc19356f2d37338b9802aa8e8fc58b0373296e7'
  },
  MKR_ethereum: {
    contractAddress: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2'
  },
  OCEAN_ethereum: {
    contractAddress: '0x967da4048cd07ab37855c090aaf366e4ce1b9f48'
  },
  OMG_ethereum: {
    contractAddress: '0xd26114cd6ee289accf82350c8d8487fedb8a0c07'
  },
  USDC_binancesmartchain: {
    contractAddress: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'
  },
  USDT_binancesmartchain: {
    contractAddress: '0x55d398326f99059ff775485246999027b3197955'
  },
  XMR_monero: { contractAddress: null }
}

async function fetchCurrencyCache(apiKey: string): Promise<void> {
  if (currencyCache != null) return

  try {
    const response = await retryFetch(API_URL, {
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      method: 'POST',
      body: JSON.stringify({
        method: 'getCurrenciesFull',
        params: {}
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch currencies: ${response.status}`)
    }

    const result = await response.json()
    const currencies = asChangeHeroCurrenciesResult(result).result

    currencyCache = new Map()
    for (const currency of currencies) {
      const key = makeCurrencyCacheKey(currency.name, currency.blockchain)
      currencyCache.set(key, {
        contractAddress: currency.contractAddress
      })
    }

    // Add hardcoded fallbacks for currencies not in API
    for (const [key, info] of Object.entries(MISSING_CURRENCIES)) {
      if (!currencyCache.has(key)) {
        currencyCache.set(key, info)
      }
    }

    datelog(`Changehero: Cached ${currencyCache.size} currency entries`)
  } catch (e) {
    datelog(`Changehero: Failed to fetch currency cache: ${e}`)
    throw e
  }
}

interface AssetInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId
}

function getAssetInfo(
  chain: string | undefined,
  currencyCode: string,
  isoDate: string
): AssetInfo {
  const isBeforeCutoff = isoDate < CHAIN_FIELDS_REQUIRED_DATE

  // Get chainPluginId from chain - throw if unknown (unless before cutoff date)
  if (chain == null) {
    if (isBeforeCutoff) {
      // Allow older transactions to skip asset info
      return { chainPluginId: undefined, evmChainId: undefined, tokenId: null }
    }
    throw new Error(`Missing chain for currency ${currencyCode}`)
  }

  const chainPluginId = CHANGEHERO_CHAIN_TO_PLUGIN_ID[chain]
  if (chainPluginId == null) {
    throw new Error(
      `Unknown Changehero chain "${chain}" for currency ${currencyCode}. Add mapping to CHANGEHERO_CHAIN_TO_PLUGIN_ID.`
    )
  }

  // Get evmChainId if this is an EVM chain
  const evmChainId = EVM_CHAIN_IDS[chainPluginId]

  // Look up contract address from cache
  let tokenId: EdgeTokenId = null
  if (currencyCache == null) {
    throw new Error('Currency cache not initialized')
  }
  const key = makeCurrencyCacheKey(currencyCode, chain)
  const currencyInfo = currencyCache.get(key)
  if (currencyInfo == null) {
    throw new Error(`Currency info not found for ${currencyCode} on ${chain}`)
  }
  if (currencyInfo?.contractAddress != null) {
    const tokenType = tokenTypes[chainPluginId]
    if (tokenType == null) {
      throw new Error(
        `Unknown tokenType for chainPluginId "${chainPluginId}" (currency: ${currencyCode}, chain: ${chain}). Add tokenType to tokenTypes.`
      )
    }
    // createTokenId will throw if the chain doesn't support tokens
    tokenId = createTokenId(
      tokenType,
      currencyCode,
      currencyInfo.contractAddress
    )
  }

  return { chainPluginId, evmChainId, tokenId }
}

export async function queryChangeHero(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asChangeHeroPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let offset = 0
  let { latestIsoDate } = settings

  if (typeof apiKey !== 'string') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  // Fetch currency cache for contract address lookups
  await fetchCurrencyCache(apiKey)

  const standardTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  try {
    let done = false
    while (!done) {
      let oldestIsoDate = '999999999999999999999999999999999999'
      datelog(`Query changeHero offset: ${offset}`)

      const params = {
        id: '',
        currency: '',
        payoutAddress: '',
        offset,
        limit: LIMIT
      }

      const response = await retryFetch(API_URL, {
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        method: 'POST',
        body: JSON.stringify({
          method: 'getTransactions',
          params
        })
      })

      if (!response.ok) {
        const text = await response.text()
        datelog(text)
        throw new Error(text)
      }

      const result = await response.json()

      const txs = asChangeHeroResult(result).result
      if (txs.length === 0) {
        datelog(`ChangeHero done at offset ${offset}`)
        break
      }
      for (const rawTx of txs) {
        const standardTx = await processChangeHeroTx(rawTx, pluginParams)
        standardTxs.push(standardTx)

        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < oldestIsoDate) {
          oldestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < previousLatestIsoDate && !done) {
          datelog(
            `ChangeHero done: date ${standardTx.isoDate} < ${previousLatestIsoDate}`
          )
          done = true
        }
      }
      datelog(`Changehero oldestIsoDate ${oldestIsoDate}`)
      offset += LIMIT
    }
  } catch (e) {
    datelog(e)
  }
  const out = {
    settings: {
      latestIsoDate
    },
    transactions: standardTxs
  }
  return out
}

export const changehero: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryChangeHero,
  // results in a PluginResult
  pluginName: 'Changehero',
  pluginId: 'changehero'
}

export async function processChangeHeroTx(
  rawTx: unknown,
  pluginParams?: PluginParams
): Promise<StandardTx> {
  const tx: ChangeHeroTx = asChangeHeroTx(rawTx)

  // Ensure currency cache is populated (for backfill script usage)
  if (currencyCache == null && pluginParams != null) {
    const { apiKeys } = asChangeHeroPluginParams(pluginParams)
    if (apiKeys.apiKey != null) {
      await fetchCurrencyCache(apiKeys.apiKey)
    }
  }

  const isoDate = smartIsoDateFromTimestamp(tx.createdAt).isoDate

  // Get deposit asset info
  const depositAsset = getAssetInfo(tx.chainFrom, tx.currencyFrom, isoDate)

  // Get payout asset info
  const payoutAsset = getAssetInfo(tx.chainTo, tx.currencyTo, isoDate)

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.id,
    countryCode: null,
    depositTxid: tx.payinHash,
    depositAddress: tx.payinAddress,
    depositCurrency: tx.currencyFrom.toUpperCase(),
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: safeParseFloat(tx.amountFrom),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.payoutHash,
    payoutAddress: tx.payoutAddress,
    payoutCurrency: tx.currencyTo.toUpperCase(),
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: safeParseFloat(tx.amountTo),
    timestamp: tx.createdAt,
    isoDate,
    usdValue: -1,
    rawTx
  }

  return standardTx
}
