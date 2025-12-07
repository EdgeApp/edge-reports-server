import {
  asArray,
  asDate,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'
import fetch from 'node-fetch'

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
import { datelog } from '../util'
import {
  ChainNameToPluginIdMapping,
  createTokenId,
  EdgeTokenId,
  tokenTypes
} from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS, REVERSE_EVM_CHAIN_IDS } from '../util/chainIds'

// Map Moonpay's networkCode to Edge pluginId
const MOONPAY_NETWORK_TO_PLUGIN_ID: ChainNameToPluginIdMapping = {
  algorand: 'algorand',
  arbitrum: 'arbitrum',
  avalanche_c_chain: 'avalanche',
  base: 'base',
  binance_smart_chain: 'binancesmartchain',
  bitcoin: 'bitcoin',
  bitcoin_cash: 'bitcoincash',
  cardano: 'cardano',
  cosmos: 'cosmoshub',
  dogecoin: 'dogecoin',
  ethereum: 'ethereum',
  ethereum_classic: 'ethereumclassic',
  hedera: 'hedera',
  litecoin: 'litecoin',
  optimism: 'optimism',
  polygon: 'polygon',
  ripple: 'ripple',
  solana: 'solana',
  stellar: 'stellar',
  sui: 'sui',
  ton: 'ton',
  tron: 'tron',
  zksync: 'zksync'
}

interface EdgeAssetInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId
}

type MoonpayCurrencyMetadata = ReturnType<typeof asMoonpayCurrencyMetadata>

/**
 * Process Moonpay currency metadata to extract Edge asset info
 */
function processMetadata(
  metadata: MoonpayCurrencyMetadata | undefined,
  currencyCode: string
): EdgeAssetInfo {
  if (metadata == null) {
    throw new Error(`Missing metadata for currency ${currencyCode}`)
  }

  const networkCode = metadata.networkCode
  const rawChainId = metadata.chainId
  const chainIdNum = rawChainId != null ? parseInt(rawChainId, 10) : undefined

  // Determine chainPluginId from networkCode or chainId
  const chainPluginId =
    (networkCode != null
      ? MOONPAY_NETWORK_TO_PLUGIN_ID[networkCode]
      : undefined) ??
    (chainIdNum != null ? REVERSE_EVM_CHAIN_IDS[chainIdNum] : undefined)

  // Determine evmChainId
  let evmChainId: number | undefined
  if (chainIdNum != null && REVERSE_EVM_CHAIN_IDS[chainIdNum] != null) {
    evmChainId = chainIdNum
  } else if (chainPluginId != null && EVM_CHAIN_IDS[chainPluginId] != null) {
    evmChainId = EVM_CHAIN_IDS[chainPluginId]
  }

  // Determine tokenId from contract address
  // If we have a chainPluginId but no contract address, it's a native/mainnet gas token (tokenId = null)
  // If we have a contract address, create the tokenId
  let tokenId: EdgeTokenId = null
  const contractAddress = metadata.contractAddress
  if (chainPluginId != null) {
    if (
      contractAddress != null &&
      contractAddress !== '0x0000000000000000000000000000000000000000'
    ) {
      const tokenType = tokenTypes[chainPluginId]
      if (tokenType == null) {
        throw new Error(
          `Unknown tokenType for chainPluginId ${chainPluginId} (currency: ${currencyCode})`
        )
      }
      tokenId = createTokenId(
        tokenType,
        currencyCode.toUpperCase(),
        contractAddress
      )
    } else {
      // Native/mainnet gas token - explicitly null
      tokenId = null
    }
  }

  return { chainPluginId, evmChainId, tokenId }
}

const asMoonpayCurrencyMetadata = asObject({
  chainId: asOptional(asString),
  networkCode: asOptional(asString),
  contractAddress: asOptional(asString)
})

const asMoonpayCurrency = asObject({
  id: asString,
  type: asString,
  name: asString,
  code: asString,
  metadata: asOptional(asMoonpayCurrencyMetadata)
})

// Unified cleaner that handles both buy and sell transactions
// Buy transactions have: paymentMethod, cryptoTransactionId, currency, walletAddress
// Sell transactions have: payoutMethod, depositHash, quoteCurrency
const asMoonpayTx = asObject({
  baseCurrency: asMoonpayCurrency,
  baseCurrencyAmount: asNumber,
  baseCurrencyId: asString,
  cardType: asOptional(asValue('apple_pay', 'google_pay', 'card')),
  country: asString,
  createdAt: asDate,
  id: asString,
  status: asString,
  // Common amount field (used by both buy and sell)
  quoteCurrencyAmount: asOptional(asNumber),
  // Buy-specific fields
  cryptoTransactionId: asOptional(asString),
  currency: asOptional(asMoonpayCurrency),
  walletAddress: asOptional(asString),
  paymentMethod: asOptional(asString),
  // Sell-specific fields
  depositHash: asOptional(asString),
  quoteCurrency: asOptional(asMoonpayCurrency),
  payoutMethod: asOptional(asString)
})

type MoonpayTx = ReturnType<typeof asMoonpayTx>
type MoonpayStatus = MoonpayTx['status']

// Map Moonpay status to Edge status
// Only 'completed' and 'pending' were found in 3 years of API data
const statusMap: Record<string, Status> = {
  completed: 'complete',
  pending: 'pending'
}

const asMoonpayResult = asArray(asUnknown)

const PARTNER_START_DATE = '2024-06-17T00:00:00.000Z'
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 7
const PER_REQUEST_LIMIT = 50

export async function queryMoonpay(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []

  let headers
  const { apiKeys, settings } = asStandardPluginParams(pluginParams)
  let { latestIsoDate } = settings
  if (latestIsoDate === EDGE_APP_START_DATE) {
    latestIsoDate = PARTNER_START_DATE
  }
  const { apiKey } = pluginParams.apiKeys

  if (typeof apiKey === 'string') {
    headers = {
      Authorization: `Api-Key ${apiKey}`
    }
  } else {
    return {
      settings: { latestIsoDate },
      transactions: []
    }
  }

  // Make endDate a week after the query date
  let queryIsoDate = new Date(
    new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  ).toISOString()

  const isoNow = new Date().toISOString()

  try {
    do {
      console.log(`Querying Moonpay from ${queryIsoDate} to ${latestIsoDate}`)
      let offset = 0

      while (true) {
        const url = `https://api.moonpay.io/v3/sell_transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}&startDate=${queryIsoDate}&endDate=${latestIsoDate}`
        const result = await fetch(url, {
          method: 'GET',
          headers
        })
        const txs = asMoonpayResult(await result.json())

        for (const rawTx of txs) {
          const standardTx = processTx(rawTx)
          standardTxs.push(standardTx)
        }

        if (txs.length > 0) {
          console.log(
            `Moonpay sell txs ${txs.length}: ${JSON.stringify(
              txs.slice(-1)
            ).slice(0, 100)}`
          )
        }

        if (txs.length < PER_REQUEST_LIMIT) {
          break
        }

        offset += PER_REQUEST_LIMIT
      }

      offset = 0
      while (true) {
        const url = `https://api.moonpay.io/v1/transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}&startDate=${queryIsoDate}&endDate=${latestIsoDate}`
        const result = await fetch(url, {
          method: 'GET',
          headers
        })
        const txs = asMoonpayResult(await result.json())
        // cryptoTransactionId is a duplicate among other transactions sometimes
        // in bulk update it throws an error for document update conflict because of this.

        for (const rawTx of txs) {
          const standardTx = processTx(rawTx)
          standardTxs.push(standardTx)
        }
        if (txs.length > 0) {
          console.log(
            `Moonpay buy txs ${txs.length}: ${JSON.stringify(
              txs.slice(-1)
            ).slice(0, 100)}`
          )
        }

        if (txs.length < PER_REQUEST_LIMIT) {
          break
        }

        offset += PER_REQUEST_LIMIT
      }
      queryIsoDate = latestIsoDate
      latestIsoDate = new Date(
        new Date(latestIsoDate).getTime() + QUERY_LOOKBACK
      ).toISOString()
    } while (isoNow > latestIsoDate)
    latestIsoDate = isoNow
  } catch (e) {
    datelog(e)
    console.log(`Moonpay error: ${e}`)
    console.log(`Saving progress up until ${queryIsoDate}`)

    // Set the latestIsoDate to the queryIsoDate so that the next query will
    // query the same time range again since we had a failure in that time range
    latestIsoDate = queryIsoDate
  }

  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const moonpay: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryMoonpay,
  // results in a PluginResult
  pluginName: 'Moonpay',
  pluginId: 'moonpay'
}

export function processTx(rawTx: unknown): StandardTx {
  const tx: MoonpayTx = asMoonpayTx(rawTx)
  const isoDate = tx.createdAt.toISOString()
  const timestamp = tx.createdAt.getTime()

  // Map Moonpay status to Edge status
  const status: Status = statusMap[tx.status] ?? 'other'

  // Determine direction based on paymentMethod vs payoutMethod
  // Buy transactions have paymentMethod, sell transactions have payoutMethod
  const direction = tx.paymentMethod != null ? 'buy' : 'sell'

  // Get the payout currency - different field names for buy vs sell
  const payoutCurrency = direction === 'buy' ? tx.currency : tx.quoteCurrency
  if (payoutCurrency == null) {
    throw new Error(`Missing payout currency for tx ${tx.id}`)
  }

  // For buy transactions: deposit is fiat (no crypto info), payout is crypto
  // For sell transactions: deposit is crypto, payout is fiat (no crypto info)
  const depositAsset =
    direction === 'sell'
      ? processMetadata(tx.baseCurrency.metadata, tx.baseCurrency.code)
      : { chainPluginId: undefined, evmChainId: undefined, tokenId: undefined }

  const payoutAsset =
    direction === 'buy'
      ? processMetadata(payoutCurrency.metadata, payoutCurrency.code)
      : { chainPluginId: undefined, evmChainId: undefined, tokenId: undefined }

  const standardTx: StandardTx = {
    status,
    orderId: tx.id,

    countryCode: tx.country,
    depositTxid: direction === 'sell' ? tx.depositHash : undefined,
    depositAddress: undefined,
    depositCurrency: tx.baseCurrency.code.toUpperCase(),
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: tx.baseCurrencyAmount,
    direction,
    exchangeType: 'fiat',
    paymentType: getFiatPaymentType(tx),
    payoutTxid: direction === 'buy' ? tx.cryptoTransactionId : undefined,
    payoutAddress: direction === 'buy' ? tx.walletAddress : undefined,
    payoutCurrency: payoutCurrency.code.toUpperCase(),
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: tx.quoteCurrencyAmount ?? 0,
    timestamp: timestamp / 1000,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}

const paymentMethodMap: Record<string, FiatPaymentType> = {
  ach_bank_transfer: 'ach',
  apple_pay: 'applepay',
  credit_debit_card: 'credit',
  gbp_bank_transfer: 'fasterpayments',
  gbp_open_banking_payment: 'fasterpayments',
  google_pay: 'googlepay',
  interac: 'interac',
  moonpay_balance: 'moonpaybalance',
  paypal: 'paypal',
  pix_instant_payment: 'pix',
  revolut_pay: 'revolut',
  sepa_bank_transfer: 'sepa',
  venmo: 'venmo',
  yellow_card_bank_transfer: 'yellowcard'
}

function getFiatPaymentType(tx: MoonpayTx): FiatPaymentType | null {
  let paymentMethod: FiatPaymentType | null = null
  switch (tx.paymentMethod) {
    case undefined:
      return null
    case 'mobile_wallet':
      // Older versions of Moonpay data had a separate cardType field.
      if (tx.cardType === 'apple_pay') {
        paymentMethod = 'applepay'
      } else if (tx.cardType === 'google_pay') {
        paymentMethod = 'googlepay'
      } else if (tx.cardType === undefined) {
        paymentMethod = 'applepay'
      }
      break
    default:
      paymentMethod = paymentMethodMap[tx.paymentMethod]
      break
  }
  if (paymentMethod == null) {
    throw new Error(`Unknown payment method: ${tx.paymentMethod} for ${tx.id}`)
  }
  return paymentMethod
}
