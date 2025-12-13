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
import { datelog, retryFetch, smartIsoDateFromTimestamp } from '../util'
import { createTokenId, EdgeTokenId, tokenTypes } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

// Start date for Exolix transactions
const EXOLIX_START_DATE = '2020-01-01T00:00:00.000Z'

const asExolixPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, EXOLIX_START_DATE)
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString)
  })
})

const asExolixStatus = asMaybe(
  asValue(
    'success',
    'wait',
    'overdue',
    'refunded',
    'confirmed',
    'sending',
    'exchanging'
  ),
  'other'
)

const asExolixTx = asObject({
  id: asString,
  status: asExolixStatus,
  coinFrom: asObject({
    coinCode: asString,
    network: asOptional(asString),
    contract: asMaybe(asEither(asString, asNull), null)
  }),
  coinTo: asObject({
    coinCode: asString,
    network: asOptional(asString),
    contract: asMaybe(asEither(asString, asNull), null)
  }),
  amount: asNumber,
  amountTo: asNumber,
  depositAddress: asString,
  withdrawalAddress: asString,
  hashIn: asObject({
    hash: asEither(asString, asNull)
  }),
  hashOut: asObject({
    hash: asEither(asString, asNull)
  }),
  createdAt: asString
})

const asExolixResult = asObject({
  data: asArray(asUnknown)
})

const PAGE_LIMIT = 100
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 3 // 3 days

// Date after which network fields are required in rawTx
// Transactions before this date are allowed to skip asset info backfill
// Based on database analysis: network fields started appearing around 2022-07-15
// with the last transaction without network on 2022-08-12
const NETWORK_FIELDS_REQUIRED_DATE = '2022-09-01T00:00:00.000Z'

type ExolixTx = ReturnType<typeof asExolixTx>
type ExolixStatus = ReturnType<typeof asExolixStatus>
const statusMap: { [key in ExolixStatus]: Status } = {
  success: 'complete',
  exchanging: 'processing',
  wait: 'pending',
  overdue: 'expired',
  refunded: 'refunded',
  confirmed: 'other',
  sending: 'processing',
  other: 'other'
}

// Map Exolix network names to Edge pluginIds
const EXOLIX_NETWORK_TO_PLUGIN_ID: Record<string, string> = {
  ADA: 'cardano',
  ALGO: 'algorand',
  ARBITRUM: 'arbitrum',
  ARRR: 'piratechain',
  ATOM: 'cosmoshub',
  AVAX: 'avalanche',
  AVAXC: 'avalanche',
  BASE: 'base',
  BCH: 'bitcoincash',
  BNB: 'binance',
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
  FIL: 'filecoin',
  FIO: 'fio',
  FTM: 'fantom',
  HBAR: 'hedera',
  HYPE: 'hyperevm',
  LTC: 'litecoin',
  MATIC: 'polygon',
  OPTIMISM: 'optimism',
  OSMO: 'osmosis',
  PIVX: 'pivx',
  POLYGON: 'polygon',
  QTUM: 'qtum',
  RUNE: 'thorchainrune',
  RVN: 'ravencoin',
  SOL: 'solana',
  SUI: 'sui',
  TELOS: 'telos',
  TEZOS: 'tezos',
  TON: 'ton',
  TRX: 'tron',
  XEC: 'ecash',
  XLM: 'stellar',
  XMR: 'monero',
  XRP: 'ripple',
  XTZ: 'tezos',
  ZANO: 'zano',
  ZEC: 'zcash',
  ZKSYNCERA: 'zksync'
}

// Contract addresses that represent native/gas tokens (not actual token contracts)
// These should be skipped when creating tokenId. Ideally providers should leave contracts empty for native tokens.
const GASTOKEN_CONTRACTS = [
  '0', // ALGO, TRX placeholder
  '0x0d01dc56dcaaca66ad901c959b4011ec', // HYPE native
  '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a', // ETC wrapped
  '0x471ece3750da237f93b8e339c536989b8978a438', // CELO native token
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // ETH native placeholder
  'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c', // TON native
  'So11111111111111111111111111111111111111111', // SOL native wrapped
  'Tez', // XTZ native
  'lovelace', // ADA native unit
  'uosmo', // OSMO native denom
  'xrp' // XRP native
]

interface AssetInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId
}

function getAssetInfo(
  network: string | undefined,
  currencyCode: string,
  contract: string | null,
  isoDate: string
): AssetInfo {
  const isBeforeCutoff = isoDate < NETWORK_FIELDS_REQUIRED_DATE

  // Get chainPluginId from network - throw if unknown (unless before cutoff date)
  if (network == null) {
    if (isBeforeCutoff) {
      // Allow older transactions to skip asset info
      return { chainPluginId: undefined, evmChainId: undefined, tokenId: null }
    }
    throw new Error(`Missing network for currency ${currencyCode}`)
  }

  const chainPluginId = EXOLIX_NETWORK_TO_PLUGIN_ID[network]
  if (chainPluginId == null) {
    throw new Error(
      `Unknown Exolix network "${network}" for currency ${currencyCode}. Add mapping to EXOLIX_NETWORK_TO_PLUGIN_ID.`
    )
  }

  // Get evmChainId if this is an EVM chain
  const evmChainId = EVM_CHAIN_IDS[chainPluginId]

  // Look up tokenId from contract address
  let tokenId: EdgeTokenId = null
  if (contract != null) {
    if (GASTOKEN_CONTRACTS.includes(contract) && network === currencyCode) {
      tokenId = null
    } else {
      const tokenType = tokenTypes[chainPluginId]
      if (tokenType == null) {
        throw new Error(
          `Unknown tokenType for chainPluginId "${chainPluginId}" (currency: ${currencyCode}, network: ${network}, contract: ${contract}). Add tokenType to tokenTypes.`
        )
      }
      tokenId = createTokenId(tokenType, currencyCode, contract)
    }
  }

  return { chainPluginId, evmChainId, tokenId }
}

type Response = ReturnType<typeof fetch>

export async function queryExolix(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asExolixPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let done = false
  let page = 1

  try {
    while (!done) {
      const request = `https://exolix.com/api/v2/transactions?order=asc&page=${page}&size=${PAGE_LIMIT}&dateFrom=${previousLatestIsoDate}`
      const options = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${apiKey}`
        }
      }

      const response = await retryFetch(request, options)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }
      const json = await response.json()
      const result = asExolixResult(json)

      const txs = result.data
      for (const rawTx of txs) {
        const standardTx = processExolixTx(rawTx)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
      }
      page++
      datelog(`Exolix latestIsoDate ${latestIsoDate}`)

      // reached end of database
      if (txs.length < PAGE_LIMIT) {
        done = true
      }
    }
  } catch (e) {
    datelog(e)
    // Do not throw as we can just exit and save our progress since the API allows querying
    // from oldest to newest.
  }

  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const exolix: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryExolix,
  // results in a PluginResult
  pluginName: 'Exolix',
  pluginId: 'exolix'
}

export function processExolixTx(rawTx: unknown): StandardTx {
  const tx: ExolixTx = asExolixTx(rawTx)
  const dateInMillis = Date.parse(tx.createdAt)
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(dateInMillis)

  // Get deposit asset info
  const depositAsset = getAssetInfo(
    tx.coinFrom.network,
    tx.coinFrom.coinCode,
    tx.coinFrom.contract,
    isoDate
  )

  // Get payout asset info
  const payoutAsset = getAssetInfo(
    tx.coinTo.network,
    tx.coinTo.coinCode,
    tx.coinTo.contract,
    isoDate
  )

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.id,
    countryCode: null,
    depositTxid: tx.hashIn?.hash ?? '',
    depositAddress: tx.depositAddress,
    depositCurrency: tx.coinFrom.coinCode,
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: tx.amount,
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.hashOut?.hash ?? '',
    payoutAddress: tx.withdrawalAddress,
    payoutCurrency: tx.coinTo.coinCode,
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: tx.amountTo,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}
