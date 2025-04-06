import {
  asArray,
  asBoolean,
  asDate,
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
  receiveUnitCount: asOptional(asNumber),
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
    const missingAmountOnRampTxs: unknown[] = []
    const missingAmountOffRampTxs: unknown[] = []
    for (const rawTx of onRamps) {
      const tx = asOnRampTx(rawTx)
      const {
        _id,
        createdAt,
        cryptoCurrency,
        paidAmountUsd,
        receiveUnitCount,
        walletAddress
      } = tx
      if (receiveUnitCount === undefined) {
        missingAmountOnRampTxs.push(rawTx)
        continue
      }
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
        rawTx
      }
      ssFormatTxs.push(ssTx)
    }
    for (const rawTx of offRamps) {
      const tx = asOffRampTx(rawTx)
      const {
        _id,
        createdAt,
        cryptoCurrency,
        depositUnitCount,
        receiveUsd
      } = tx
      if (depositUnitCount === undefined) {
        missingAmountOffRampTxs.push(rawTx)
        continue
      }
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
        rawTx
      }
      ssFormatTxs.push(ssTx)
    }
    if (
      missingAmountOnRampTxs.length > 0 ||
      missingAmountOffRampTxs.length > 0
    ) {
      datelog(
        `Kado missing amount onRamp txs: ${missingAmountOnRampTxs.length}`
      )
      datelog(JSON.stringify(missingAmountOnRampTxs, null, 2))
      datelog(
        `Kado missing amount offRamp txs: ${missingAmountOffRampTxs.length}`
      )
      datelog(JSON.stringify(missingAmountOffRampTxs, null, 2))
      // Even though there are some invalid transactions, we'll still continue
      // as this seems to be rare (only 1 tx in all of history) and hopefully
      // Kado will fix this soon.
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
