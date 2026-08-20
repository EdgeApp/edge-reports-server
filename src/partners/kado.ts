import {
  asArray,
  asBoolean,
  asDate,
  asEither,
  asNumber,
  asObject,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  asStandardPluginParams,
  FiatPaymentType,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx
} from '../types'
import {
  describeRawTx,
  retryFetch,
  smartIsoDateFromTimestamp,
  snooze
} from '../util'
import { ChainNameToPluginIdMapping, EdgeTokenId } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

// Define cleaner for individual transactions in onRamps and offRamps
const asTxType = asValue('buy', 'sell')

const asTransaction = asObject({
  _id: asString,
  walletAddress: asString,
  createdAt: asDate,
  type: asTxType,
  walletType: asString,
  cryptoCurrency: asString,
  network: asString
})

const asOnRampTx = asObject({
  ...asTransaction.shape,
  receiveUnitCount: asNumber,
  paidAmountUsd: asNumber,
  paymentMethod: asString
})

const asOffRampTx = asObject({
  ...asTransaction.shape,
  depositUnitCount: asNumber,
  receiveUsd: asNumber
  // disburseMethod: asString
})

type KadoTx = ReturnType<typeof asKadoTx>
const asKadoTx = asEither(asOnRampTx, asOffRampTx)

// Define cleaner for the main data structure
const asResponse = asObject({
  success: asBoolean,
  // message: asString,
  data: asObject({
    onRamps: asArray(asUnknown),
    offRamps: asArray(asUnknown)
  })
})

const MAX_RETRIES = 5

// Kado `network` values from live orders. Lookup is lowercased so `Solana`
// and `solana` share a row.
export const KADO_NETWORK_TO_PLUGIN_ID: ChainNameToPluginIdMapping = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  injective: 'injective',
  litecoin: 'litecoin',
  solana: 'solana'
}

export async function queryKado(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  // API doesn't currently support paging by date but leave this in here
  // for when it does
  if (latestIsoDate === '2018-01-01T00:00:00.000Z') {
    latestIsoDate = new Date('2024-01-01T00:00:00.000Z').toISOString()
  }

  const standardTxs: StandardTx[] = []
  // Orders dropped as unmappable, surfaced as a count after the walk.
  let skipped = 0
  let retry = 0

  const url = `https://api.kado.money/v2/organizations/${apiKey}/orders`
  try {
    const response = await retryFetch(url)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text)
    }
    const jsonObj = await response.json()
    const transferResults = asResponse(jsonObj)
    const { onRamps, offRamps } = transferResults.data
    // Quarantine an unmappable order rather than letting it escape into the
    // fetch catch below. That catch snoozes without re-requesting and still
    // returns the truncated batch, so runPlugin would record a successful
    // update while every order after the bad row went missing, and each later
    // cycle would sleep on the same mapping error. Dropping the row loudly
    // keeps the rest of the batch flowing and names what needs mapping.
    for (const rawTx of [...onRamps, ...offRamps]) {
      let standardTx: StandardTx
      try {
        standardTx = processKadoTx(rawTx)
      } catch (e) {
        skipped++
        log.error(
          `Kado: skipping unprocessable order, ingestion continues: ${String(
            e
          )}: ${describeRawTx(rawTx)}`
        )
        continue
      }
      standardTxs.push(standardTx)
    }
    log(`latestIsoDate:${latestIsoDate}`)
    retry = 0
  } catch (e) {
    log.error(String(e))
    // Retry a few times with time delay to prevent throttling
    retry++
    if (retry <= MAX_RETRIES) {
      log(`Snoozing ${60 * retry}s`)
      await snooze(61000 * retry)
    } else {
      // We can safely save our progress since we go from oldest to newest.
      // break
    }
  }

  if (skipped > 0) {
    log.error(
      `Kado: ${skipped} order(s) skipped as unmappable this run; each is logged above and needs a KADO_NETWORK_TO_PLUGIN_ID entry plus a backfill`
    )
  }

  const out = {
    settings: {},
    transactions: standardTxs
  }
  return out
}

export const kado: PartnerPlugin = {
  queryFunc: queryKado,
  pluginName: 'Kado',
  pluginId: 'kado'
}

interface KadoChainInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

const emptyKadoChain = (): KadoChainInfo => ({
  chainPluginId: undefined,
  evmChainId: undefined,
  tokenId: undefined
})

/**
 * Map Kado's `network` field to an Edge pluginId. Kado does not send a
 * contract on the order, so tokenId stays undefined. An unknown network
 * throws so a new chain is not stored as ticker-only.
 */
export function resolveKadoChain(network: string): KadoChainInfo {
  if (network === '') {
    return emptyKadoChain()
  }
  const chainPluginId = KADO_NETWORK_TO_PLUGIN_ID[network.toLowerCase()]
  if (chainPluginId == null) {
    throw new Error(
      `Unknown Kado network "${network}". Add mapping to KADO_NETWORK_TO_PLUGIN_ID.`
    )
  }
  return {
    chainPluginId,
    evmChainId: EVM_CHAIN_IDS[chainPluginId],
    tokenId: undefined
  }
}

export function processKadoTx(rawTx: unknown): StandardTx {
  const tx = asKadoTx(rawTx)
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(
    tx.createdAt.toISOString()
  )
  const cryptoChain = resolveKadoChain(tx.network)
  const fiatChain = emptyKadoChain()
  if ('paidAmountUsd' in tx) {
    return {
      status: 'complete',
      orderId: tx._id,
      countryCode: null,
      depositTxid: undefined,
      depositAddress: undefined,
      depositCurrency: 'USD',
      depositChainPluginId: fiatChain.chainPluginId,
      depositEvmChainId: fiatChain.evmChainId,
      depositTokenId: fiatChain.tokenId,
      depositAmount: tx.paidAmountUsd,
      direction: tx.type,
      exchangeType: 'fiat',
      paymentType: getFiatPaymentType(tx),
      payoutTxid: undefined,
      payoutAddress: tx.walletAddress,
      payoutCurrency: tx.cryptoCurrency,
      payoutChainPluginId: cryptoChain.chainPluginId,
      payoutEvmChainId: cryptoChain.evmChainId,
      payoutTokenId: cryptoChain.tokenId,
      payoutAmount: tx.receiveUnitCount,
      timestamp,
      isoDate,
      usdValue: tx.paidAmountUsd,
      rawTx
    }
  } else {
    return {
      status: 'complete',
      orderId: tx._id,
      countryCode: null,
      depositTxid: undefined,
      depositAddress: undefined,
      depositCurrency: tx.cryptoCurrency,
      depositChainPluginId: cryptoChain.chainPluginId,
      depositEvmChainId: cryptoChain.evmChainId,
      depositTokenId: cryptoChain.tokenId,
      depositAmount: tx.depositUnitCount,
      direction: tx.type,
      exchangeType: 'fiat',
      paymentType: getFiatPaymentType(tx),
      payoutTxid: undefined,
      payoutAddress: undefined,
      payoutCurrency: 'USD',
      payoutChainPluginId: fiatChain.chainPluginId,
      payoutEvmChainId: fiatChain.evmChainId,
      payoutTokenId: fiatChain.tokenId,
      payoutAmount: tx.receiveUsd,
      timestamp,
      isoDate,
      usdValue: tx.receiveUsd,
      rawTx
    }
  }
}

function getFiatPaymentType(tx: KadoTx): FiatPaymentType | null {
  if (!('paymentMethod' in tx)) {
    throw new Error(`Missing paymentMethod for ${tx._id}`)
  }
  switch (tx.paymentMethod) {
    case 'deposit_ach': {
      if (tx.type === 'buy') return 'iach'
      return 'ach'
    }
    case 'wire_transfer':
      return 'wire'
    default:
      throw new Error(
        `Unknown payment method: ${tx.paymentMethod} for ${tx._id}`
      )
  }
}
