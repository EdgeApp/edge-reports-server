import {
  asArray,
  asBoolean,
  asDate,
  asEither,
  asNull,
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
import { datelog, retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'

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

export async function queryKado(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  // API doesn't currently support paging by date but leave this in here
  // for when it does
  if (latestIsoDate === '2018-01-01T00:00:00.000Z') {
    latestIsoDate = new Date('2024-01-01T00:00:00.000Z').toISOString()
  }

  const standardTxs: StandardTx[] = []
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
    for (const rawTx of onRamps) {
      const standardTx: StandardTx = processKadoTx(rawTx)
      standardTxs.push(standardTx)
    }
    for (const rawTx of offRamps) {
      const standardTx: StandardTx = processKadoTx(rawTx)
      standardTxs.push(standardTx)
    }
    datelog(`Kado latestIsoDate:${latestIsoDate}`)
    retry = 0
  } catch (e) {
    datelog(e)
    // Retry a few times with time delay to prevent throttling
    retry++
    if (retry <= MAX_RETRIES) {
      datelog(`Snoozing ${60 * retry}s`)
      await snooze(61000 * retry)
    } else {
      // We can safely save our progress since we go from oldest to newest.
      // break
    }
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

export function processKadoTx(rawTx: unknown): StandardTx {
  const tx = asKadoTx(rawTx)
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(
    tx.createdAt.toISOString()
  )
  if ('paidAmountUsd' in tx) {
    return {
      status: 'complete',
      orderId: tx._id,
      countryCode: null,
      depositTxid: undefined,
      depositAddress: undefined,
      depositCurrency: 'USD',
      depositAmount: tx.paidAmountUsd,
      direction: tx.type,
      exchangeType: 'fiat',
      paymentType: getFiatPaymentType(tx),
      payoutTxid: undefined,
      payoutAddress: tx.walletAddress,
      payoutCurrency: tx.cryptoCurrency,
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
      depositAmount: tx.depositUnitCount,
      direction: tx.type,
      exchangeType: 'fiat',
      paymentType: getFiatPaymentType(tx),
      payoutTxid: undefined,
      payoutAddress: undefined,
      payoutCurrency: 'USD',
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
