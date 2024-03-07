import {
  asArray,
  asBoolean,
  asDate,
  asMaybe,
  asNumber,
  asObject,
  asOptional,
  asString,
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

// Define cleaner for the main data structure
const asResponse = asObject({
  success: asBoolean,
  // message: asString,
  data: asObject({
    onRamps: asArray(asOnRampTx),
    offRamps: asArray(asOffRampTx)
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

  const ssFormatTxs: StandardTx[] = []
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
    for (const tx of onRamps) {
      const {
        _id,
        createdAt,
        cryptoCurrency,
        paidAmountUsd,
        receiveUnitCount,
        walletAddress
      } = tx
      const { isoDate, timestamp } = smartIsoDateFromTimestamp(
        createdAt.toISOString()
      )
      const ssTx: StandardTx = {
        status: 'complete',
        orderId: _id,
        depositTxid: undefined,
        depositAddress: undefined,
        depositCurrency: 'USD',
        depositAmount: paidAmountUsd,
        payoutTxid: undefined,
        payoutAddress: walletAddress,
        payoutCurrency: cryptoCurrency,
        payoutAmount: receiveUnitCount,
        timestamp,
        isoDate,
        usdValue: paidAmountUsd,
        rawTx: tx
      }
      ssFormatTxs.push(ssTx)
    }
    for (const tx of offRamps) {
      const {
        _id,
        createdAt,
        cryptoCurrency,
        depositUnitCount,
        receiveUsd
      } = tx
      const { isoDate, timestamp } = smartIsoDateFromTimestamp(
        createdAt.toISOString()
      )
      const ssTx: StandardTx = {
        status: 'complete',
        orderId: _id,
        depositTxid: undefined,
        depositAddress: undefined,
        depositCurrency: cryptoCurrency,
        depositAmount: depositUnitCount,
        payoutTxid: undefined,
        payoutAddress: undefined,
        payoutCurrency: 'USD',
        payoutAmount: receiveUsd,
        timestamp,
        isoDate,
        usdValue: receiveUsd,
        rawTx: tx
      }
      ssFormatTxs.push(ssTx)
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
    transactions: ssFormatTxs
  }
  return out
}

export const kado: PartnerPlugin = {
  queryFunc: queryKado,
  pluginName: 'Kado',
  pluginId: 'kado'
}
