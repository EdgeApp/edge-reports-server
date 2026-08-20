import {
  asArray,
  asDate,
  asEither,
  asMaybe,
  asNull,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'
import URL from 'url-parse'

import {
  asStandardPluginParams,
  EDGE_APP_START_DATE,
  FiatPaymentType,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'
import { ChainNameToPluginIdMapping, EdgeTokenId } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

const PLUGIN_START_DATE = '2023-09-01T00:00:00.000Z'
const asStatuses = asMaybe(
  asValue('created', 'completed', 'cancelled', 'payment_error', 'rejected'),
  'other'
)
type PartnerStatuses = ReturnType<typeof asStatuses>

// Basic structures
const asCurrencyCode = asString
const asAmount = asString
const asCurrency = asObject({
  amount: asAmount,
  currency: asCurrencyCode
})
const asUserCountry = asObject({
  name: asString,
  code: asString
})
const asUser = asObject({
  // id: asString,
  // email: asString,
  country: asEither(asUserCountry, asNull)
})
// const asExchangeRate = asObject({
//   currencyTo: asCurrency,
//   currencyFrom: asCurrency
// })
// const asFee = asObject({
//   amount: asOptional(asString), // Optional because some fees may be null
//   currency: asOptional(asString)
// })

// Paybis `to.asset.blockchain.name` / `from.asset.blockchain.name` values
// observed on live orders. `network` is mainnet/testnet, not the chain.
export const PAYBIS_BLOCKCHAIN_TO_PLUGIN_ID: ChainNameToPluginIdMapping = {
  bitcoin: 'bitcoin',
  'bitcoin-cash': 'bitcoincash',
  bitcoincash: 'bitcoincash',
  dogecoin: 'dogecoin',
  ethereum: 'ethereum',
  litecoin: 'litecoin',
  polygon: 'polygon',
  ripple: 'ripple',
  solana: 'solana',
  tron: 'tron'
}

const asPaybisBlockchain = asObject({
  name: asString,
  network: asOptional(asString)
})
const asPaybisAsset = asObject({
  id: asOptional(asString),
  name: asOptional(asString),
  blockchain: asOptional(asPaybisBlockchain)
})
const asFromToStructure = asObject({
  name: asString,
  asset: asMaybe(asPaybisAsset),
  address: asOptional(asString)
  // destinationTag: asOptional(asString)
})
const asAmounts = asObject({
  spentOriginal: asCurrency,
  spentFiat: asCurrency,
  receivedOriginal: asCurrency,
  receivedFiat: asCurrency
})
// const asFees = asObject({
//   paybisFee: asFee,
//   paymentFee: asFee,
//   networkFee: asFee,
//   partnerFee: asFee,
//   partnerFeeFiat: asFee
// })
// const asRequest = asObject({
//   id: asString,
//   flow: asString,
//   createdAt: asDate
// })
type PaybisTx = ReturnType<typeof asPaybisTx>
const asPaybisTx = asObject({
  id: asString,
  gateway: asValue('crypto_to_fiat', 'fiat_to_crypto'),
  status: asString,
  from: asFromToStructure,
  to: asFromToStructure,
  // exchangeRate: asExchangeRate,
  hash: asOptional(asString),
  // explorerLink: asOptional(asString),
  createdAt: asDate,
  // paidAt: asOptional(asDate),
  // completedAt: asOptional(asDate),
  amounts: asAmounts,
  // fees: asFees,
  user: asUser
  // request: asRequest
})
const asMeta = asObject({
  // limit: asNumber,
  // currentCursor: asOptional(asString),
  nextCursor: asOptional(asString)
})

// Cleaner for the entire structure
const asTransactions = asObject({
  data: asArray(asUnknown),
  meta: asMeta
})

/** Max fetch retries before bailing */
const MAX_RETRIES = 5

/** How many txs to query per fetch call */
const QUERY_LIMIT_TXS = 50

/**
 * How far to rollback from the last successful query
 * date when starting a new query
 */
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 7 // 30 days

/** Time period to query per loop */
const QUERY_TIME_BLOCK_MS = QUERY_LOOKBACK

const URLS = {
  prod: 'https://widget-api.paybis.com/v2/transactions',
  sandbox: 'https://widget-api.sandbox.paybis.com/v2/transactions'
}

const statusMap: { [key in PartnerStatuses]: Status } = {
  created: 'pending',
  cancelled: 'refunded',
  payment_error: 'refunded',
  completed: 'complete',
  rejected: 'refunded',
  other: 'other'
}

export async function queryPaybis(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  const nowDate = new Date()
  const now = nowDate.getTime()
  const nowMidnightDate = new Date(nowDate)
  nowMidnightDate.setUTCHours(0, 0, 0, 0)
  const nowMidnight = nowMidnightDate.getTime()

  let { latestIsoDate } = settings

  if (latestIsoDate === EDGE_APP_START_DATE) {
    latestIsoDate = new Date(PLUGIN_START_DATE).toISOString()
  }

  let lastCheckedTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (lastCheckedTimestamp < 0) lastCheckedTimestamp = 0

  const standardTxs: StandardTx[] = []
  let retry = 0
  let startTime = lastCheckedTimestamp

  while (true) {
    const endTime = startTime + QUERY_TIME_BLOCK_MS

    try {
      let cursor: string | undefined

      while (true) {
        const urlObj = new URL(URLS.prod, true)

        // From value cannot exceed midnight of the current day
        const fromTime = startTime > nowMidnight ? nowMidnight : startTime

        const queryParams: any = {
          from: new Date(fromTime).toISOString(),
          to: new Date(endTime).toISOString(),
          limit: QUERY_LIMIT_TXS
        }
        log(`Querying from:${queryParams.from} to:${queryParams.to}`)
        if (cursor != null) queryParams.cursor = cursor

        urlObj.set('query', queryParams)
        const url = urlObj.href

        const response = await retryFetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text)
        }
        const jsonObj = await response.json()
        const txs = asTransactions(jsonObj)
        cursor = txs.meta.nextCursor
        for (const rawTx of txs.data) {
          const standardTx = processPaybisTx(rawTx)
          standardTxs.push(standardTx)
          if (standardTx.isoDate > latestIsoDate) {
            latestIsoDate = standardTx.isoDate
          }
        }
        if (cursor == null) {
          break
        } else {
          log(`Get nextCursor: ${cursor}`)
        }
      }

      const endDate = new Date(endTime)
      startTime = endTime
      log(`endDate:${endDate.toISOString()} latestIsoDate:${latestIsoDate}`)
      if (endTime > now) {
        break
      }
      retry = 0
    } catch (e) {
      log.error(String(e))
      // Retry a few times with time delay to prevent throttling
      retry++
      if (retry <= MAX_RETRIES) {
        log.warn(`Snoozing ${60 * retry}s`)
        await snooze(60000 * retry)
      } else {
        // We can safely save our progress since we go from oldest to newest.
        break
      }
    }
    await snooze(1000)
  }

  const out = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const paybis: PartnerPlugin = {
  queryFunc: queryPaybis,
  pluginName: 'Paybis',
  pluginId: 'paybis'
}

interface PaybisChainInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

const emptyChain = (): PaybisChainInfo => ({
  chainPluginId: undefined,
  evmChainId: undefined,
  tokenId: undefined
})

/**
 * Resolve Edge chain fields from a Paybis asset. Paybis does not send a
 * contract address on the order, so tokenId stays undefined even when the
 * chain is known. Missing asset/blockchain (the fiat leg) leaves chain
 * fields unset. An unknown blockchain.name throws so a new chain is not
 * silently stored as ticker-only.
 */
export function resolvePaybisChain(
  asset: ReturnType<typeof asPaybisAsset> | undefined
): PaybisChainInfo {
  const blockchainName = asset?.blockchain?.name
  if (blockchainName == null || blockchainName === '') {
    return emptyChain()
  }
  const chainPluginId =
    PAYBIS_BLOCKCHAIN_TO_PLUGIN_ID[blockchainName.toLowerCase()]
  if (chainPluginId == null) {
    throw new Error(
      `Unknown Paybis blockchain "${blockchainName}". Add mapping to PAYBIS_BLOCKCHAIN_TO_PLUGIN_ID.`
    )
  }
  return {
    chainPluginId,
    evmChainId: EVM_CHAIN_IDS[chainPluginId],
    tokenId: undefined
  }
}

export function processPaybisTx(rawTx: unknown): StandardTx {
  const tx = asPaybisTx(rawTx)
  const { amounts, createdAt, gateway, hash, id } = tx
  const { spentOriginal, receivedOriginal } = amounts

  const { isoDate, timestamp } = smartIsoDateFromTimestamp(createdAt.getTime())

  const depositAmount = Number(spentOriginal.amount)
  const payoutAmount = Number(receivedOriginal.amount)
  const depositTxid = gateway === 'crypto_to_fiat' ? hash : undefined
  const payoutTxid = gateway === 'fiat_to_crypto' ? hash : undefined
  const direction = gateway === 'fiat_to_crypto' ? 'buy' : 'sell'

  const cryptoChain =
    direction === 'buy'
      ? resolvePaybisChain(tx.to.asset)
      : resolvePaybisChain(tx.from.asset)
  const fiatChain = emptyChain()
  const depositChain = direction === 'buy' ? fiatChain : cryptoChain
  const payoutChain = direction === 'buy' ? cryptoChain : fiatChain

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: id,
    countryCode: tx.user.country?.code ?? null,
    depositTxid,
    depositAddress: undefined,
    depositCurrency: spentOriginal.currency,
    depositChainPluginId: depositChain.chainPluginId,
    depositEvmChainId: depositChain.evmChainId,
    depositTokenId: depositChain.tokenId,
    depositAmount,
    direction,
    exchangeType: 'fiat',
    paymentType: getFiatPaymentType(tx, direction),
    payoutTxid,
    payoutAddress: tx.to.address,
    payoutCurrency: receivedOriginal.currency,
    payoutChainPluginId: payoutChain.chainPluginId,
    payoutEvmChainId: payoutChain.evmChainId,
    payoutTokenId: payoutChain.tokenId,
    payoutAmount,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}

function getFiatPaymentType(
  tx: PaybisTx,
  direction: 'buy' | 'sell'
): FiatPaymentType | null {
  const name = direction === 'buy' ? tx.from.name : tx.to.name
  switch (name) {
    case undefined:
      return null
    case 'Apple Pay':
      return 'applepay'
    case 'AstroPay':
      return 'astropay'
    case 'Credit/Debit Card':
      return 'credit'
    case 'FPX':
      // Idk?
      return 'fpx'
    case 'Google Pay':
      return 'googlepay'
    case 'Giropay':
      return 'giropay'
    case 'Neteller':
      return 'neteller'
    case 'Online Banking':
      return 'banktransfer'
    case 'PIX':
      return 'pix'
    case 'Revolut Pay':
      return 'revolut'
    case 'SEPA Bank Transfer':
      return 'sepa'
    case 'SPEI Bank Transfer':
      return 'spei'
    case 'SWIFT Bank Transfer':
      return 'swift'
    case 'Skrill':
      return 'skrill'
    default:
      throw new Error(`Unknown payment method: ${name} for ${tx.id}`)
  }
}
