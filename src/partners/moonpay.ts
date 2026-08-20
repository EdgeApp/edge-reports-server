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
  // Moonpay `networkCode`: `bnb_chain` = Beacon Chain, `binance_smart_chain` = BSC.
  bnb_chain: 'binance',
  binance_smart_chain: 'binancesmartchain',
  bitcoin: 'bitcoin',
  bitcoin_cash: 'bitcoincash',
  cardano: 'cardano',
  celo: 'celo',
  cosmos: 'cosmoshub',
  dash: 'dash',
  digibyte: 'digibyte',
  dogecoin: 'dogecoin',
  eosio: 'eos',
  ethereum: 'ethereum',
  ethereum_classic: 'ethereumclassic',
  fantom: 'fantom',
  filecoin: 'filecoin',
  hedera: 'hedera',
  litecoin: 'litecoin',
  monero: 'monero',
  optimism: 'optimism',
  osmosis: 'osmosis',
  polkadot: 'polkadot',
  polygon: 'polygon',
  qtum: 'qtum',
  ravencoin: 'ravencoin',
  ripple: 'ripple',
  rsk: 'rsk',
  solana: 'solana',
  stellar: 'stellar',
  sui: 'sui',
  tezos: 'tezos',
  ton: 'ton',
  tron: 'tron',
  zcash: 'zcash',
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

  if (chainPluginId == null) {
    throw new Error(
      `Unknown Moonpay chain for currency ${currencyCode} (networkCode=${networkCode ??
        'null'}, chainId=${rawChainId ??
        'null'}). Add mapping to MOONPAY_NETWORK_TO_PLUGIN_ID or REVERSE_EVM_CHAIN_IDS.`
    )
  }

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

// Base cleaner with fields common to both buy and sell transactions.
// `country` is the only Moonpay-supplied country field (verified via
// src/bin/moonpayCountryFieldSurvey.ts across 122k txs / 2 years), but is
// optional because some legacy rows omit it.
const asMoonpayTxBase = asObject({
  baseCurrency: asMoonpayCurrency,
  baseCurrencyAmount: asNumber,
  baseCurrencyId: asString,
  // apple_pay / google_pay with paymentMethod mobile_wallet; "card" with credit_debit_card
  cardType: asOptional(asValue('apple_pay', 'google_pay', 'card')),
  country: asOptional(asString),
  createdAt: asDate,
  id: asString,
  status: asString,
  quoteCurrencyAmount: asOptional(asNumber),
  paymentMethod: asOptional(asString),
  cryptoTransactionId: asOptional(asString),
  currency: asOptional(asMoonpayCurrency),
  walletAddress: asOptional(asString),
  depositHash: asOptional(asString),
  quoteCurrency: asOptional(asMoonpayCurrency),
  payoutMethod: asOptional(asString)
})

const asMoonpayBuyFields = asObject({
  currency: asMoonpayCurrency,
  walletAddress: asString,
  quoteCurrencyAmount: asNumber
})

const asMoonpaySellFields = asObject({
  quoteCurrency: asMoonpayCurrency,
  // Pending sell txs may have null quoteCurrencyAmount until the deposit is
  // confirmed and the payout is calculated.
  quoteCurrencyAmount: asOptional(asNumber, 0)
})

type MoonpayTxBase = ReturnType<typeof asMoonpayTxBase>

// Map Moonpay status to Edge status
// Only 'completed' and 'pending' were found in 3 years of API data
const statusMap: Record<string, Status> = {
  completed: 'complete',
  pending: 'pending'
}

const asMoonpayResult = asArray(asUnknown)

const PARTNER_START_DATE = '2024-06-17T00:00:00.000Z'
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 7
// Cap each queryFunc invocation to ~6 months of transaction data. The runner
// snoozes between invocations and persists progress in between, so during
// long backfills the work is split across multiple wakeups instead of one
// invocation having to traverse years of weekly windows.
const MAX_QUERY_RANGE = 1000 * 60 * 60 * 24 * 30 * 6
const PER_REQUEST_LIMIT = 50

export async function queryMoonpay(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
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
  // Cap this invocation to MAX_QUERY_RANGE past the entry latestIsoDate.
  // When we hit the cap we early-exit and let the next invocation resume
  // from the saved progress.
  const capIso = new Date(
    new Date(latestIsoDate).getTime() + MAX_QUERY_RANGE
  ).toISOString()
  const targetIsoDate = capIso < isoNow ? capIso : isoNow

  try {
    do {
      log(`Querying from ${queryIsoDate} to ${latestIsoDate}`)
      let offset = 0

      while (true) {
        const url = `https://api.moonpay.io/v3/sell_transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}&startDate=${queryIsoDate}&endDate=${latestIsoDate}`
        const result = await fetch(url, {
          method: 'GET',
          headers
        })
        const txs = asMoonpayResult(await result.json())

        for (const rawTx of txs) {
          const standardTx = processMoonpayTx(rawTx)
          standardTxs.push(standardTx)
        }

        if (txs.length > 0) {
          log(
            `sell txs ${txs.length}: ${JSON.stringify(txs.slice(-1)).slice(
              0,
              100
            )}`
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
          const standardTx = processMoonpayTx(rawTx)
          standardTxs.push(standardTx)
        }
        if (txs.length > 0) {
          log(
            `buy txs ${txs.length}: ${JSON.stringify(txs.slice(-1)).slice(
              0,
              100
            )}`
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
    } while (targetIsoDate > latestIsoDate)
    latestIsoDate = targetIsoDate
    if (targetIsoDate < isoNow) {
      log(
        `Early exit at 6-month cap: saving progress up until ${targetIsoDate} (current time: ${isoNow})`
      )
    }
  } catch (e) {
    log.error(`Error: ${e}`)
    log(`Saving progress up until ${queryIsoDate}`)

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

export function processMoonpayTx(rawTx: unknown): StandardTx {
  const tx: MoonpayTxBase = asMoonpayTxBase(rawTx)
  const isoDate = tx.createdAt.toISOString()
  const timestamp = tx.createdAt.getTime()

  // Map Moonpay status to Edge status
  const status: Status = statusMap[tx.status] ?? 'other'

  // A completed transaction must have a finalized payout amount. If this
  // assertion ever trips, Moonpay has changed something about how completed
  // transactions are reported and the parser needs to be revisited.
  if (tx.quoteCurrencyAmount == null && tx.status === 'completed') {
    throw new Error(
      `Moonpay tx ${tx.id} is status=completed but has no quoteCurrencyAmount`
    )
  }

  // Determine direction from baseCurrency.type:
  //   fiat baseCurrency  => buy (fiat in, crypto out)
  //   crypto baseCurrency => sell (crypto in, fiat out)
  // Older buy txs from /v1/transactions can have paymentMethod=null
  // (e.g. legacy card payments with cardType="card"), so we cannot rely on
  // paymentMethod presence alone to distinguish buy vs sell.
  const direction: 'buy' | 'sell' =
    tx.baseCurrency.type === 'fiat' ? 'buy' : 'sell'

  if (direction === 'buy') {
    const buyFields = asMoonpayBuyFields(rawTx)
    const payoutAsset = processMetadata(
      buyFields.currency.metadata,
      buyFields.currency.code
    )
    const standardTx: StandardTx = {
      status,
      orderId: tx.id,
      countryCode: tx.country,
      depositTxid: undefined,
      depositAddress: undefined,
      depositCurrency: tx.baseCurrency.code.toUpperCase(),
      depositChainPluginId: undefined,
      depositEvmChainId: undefined,
      depositTokenId: undefined,
      depositAmount: tx.baseCurrencyAmount,
      direction,
      exchangeType: 'fiat',
      paymentType: getFiatPaymentType(tx),
      payoutTxid: tx.cryptoTransactionId,
      payoutAddress: buyFields.walletAddress,
      payoutCurrency: buyFields.currency.code.toUpperCase(),
      payoutChainPluginId: payoutAsset.chainPluginId,
      payoutEvmChainId: payoutAsset.evmChainId,
      payoutTokenId: payoutAsset.tokenId,
      payoutAmount: buyFields.quoteCurrencyAmount,
      timestamp: timestamp / 1000,
      isoDate,
      usdValue: -1,
      rawTx
    }
    return standardTx
  } else {
    const sellFields = asMoonpaySellFields(rawTx)
    const depositAsset = processMetadata(
      tx.baseCurrency.metadata,
      tx.baseCurrency.code
    )
    const standardTx: StandardTx = {
      status,
      orderId: tx.id,
      countryCode: tx.country,
      depositTxid: tx.depositHash,
      depositAddress: undefined,
      depositCurrency: tx.baseCurrency.code.toUpperCase(),
      depositChainPluginId: depositAsset.chainPluginId,
      depositEvmChainId: depositAsset.evmChainId,
      depositTokenId: depositAsset.tokenId,
      depositAmount: tx.baseCurrencyAmount,
      direction,
      exchangeType: 'fiat',
      paymentType: getFiatPaymentType(tx),
      payoutTxid: undefined,
      payoutAddress: undefined,
      payoutCurrency: sellFields.quoteCurrency.code.toUpperCase(),
      payoutChainPluginId: undefined,
      payoutEvmChainId: undefined,
      payoutTokenId: undefined,
      payoutAmount: sellFields.quoteCurrencyAmount,
      timestamp: timestamp / 1000,
      isoDate,
      usdValue: -1,
      rawTx
    }
    return standardTx
  }
}

const paymentMethodMap: Record<string, FiatPaymentType> = {
  ach_bank_transfer: 'ach',
  apple_pay: 'applepay',
  cash_app: 'cashapp',
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

function getFiatPaymentType(tx: MoonpayTxBase): FiatPaymentType | null {
  let paymentMethod: FiatPaymentType | null = null
  const rawPaymentMethod = tx.paymentMethod ?? tx.payoutMethod
  switch (rawPaymentMethod) {
    case undefined:
      // Legacy buy transactions can omit paymentMethod entirely. Fall back to
      // cardType which Moonpay set on older card payments.
      if (tx.cardType === 'card') return 'credit'
      if (tx.cardType === 'apple_pay') return 'applepay'
      if (tx.cardType === 'google_pay') return 'googlepay'
      return null
    case 'mobile_wallet':
      // Moonpay uses cardType to distinguish wallet brands; plain cards use
      // paymentMethod credit_debit_card with cardType "card" (see paymentMethodMap).
      if (tx.cardType === 'apple_pay') {
        paymentMethod = 'applepay'
      } else if (tx.cardType === 'google_pay') {
        paymentMethod = 'googlepay'
      }
      break
    default:
      paymentMethod = paymentMethodMap[rawPaymentMethod]
      break
  }
  if (paymentMethod == null) {
    throw new Error(`Unknown payment method: ${rawPaymentMethod} for ${tx.id}`)
  }
  return paymentMethod
}
