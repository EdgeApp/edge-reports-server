import { div } from 'biggystring'
import {
  asArray,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog, smartIsoDateFromTimestamp } from '../util'

const asThorchainTx = asObject({
  date: asString,
  in: asArray(
    asObject({
      address: asString,
      coins: asArray(
        asObject({
          amount: asString,
          asset: asString
        })
      ),
      txID: asString
    })
  ),
  out: asArray(
    asObject({
      address: asString,
      coins: asArray(
        asObject({
          amount: asString,
          asset: asString
        })
      ),
      txID: asString
    })
  ),
  pools: asArray(asString),
  status: asString,
  type: asString
})

const asSettings = asObject({
  offset: asNumber
})

const asThorchainResult = asObject({
  actions: asArray(asUnknown)
})

const asThorchainPluginParams = asObject({
  apiKeys: asObject({ thorchainAddress: asString }),
  settings: asObject({
    latestIsoDate: asOptional(asString, '1970-01-01T00:00:00.000Z')
  })
})

type Settings = ReturnType<typeof asSettings>
type ThorchainResult = ReturnType<typeof asThorchainResult>

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const LIMIT = 50
const THORCHAIN_MULTIPLIER = 100000000

export const queryThorchain = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const standardTxs: StandardTx[] = []

  const { settings, apiKeys } = asThorchainPluginParams(pluginParams)
  const { thorchainAddress } = apiKeys
  let { latestIsoDate } = settings

  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  let done = false
  let oldestIsoDate = new Date(99999999999999).toISOString()

  let offset = 0

  while (!done) {
    const url = `https://midgard.ninerealms.com/v2/actions?address=${thorchainAddress}&type=swap,refund&affiliate=ej&offset=${offset}&limit=${LIMIT}`
    let jsonObj: ThorchainResult
    try {
      const result = await fetch(url, {
        method: 'GET'
      })
      const resultJson = await result.json()
      jsonObj = asThorchainResult(resultJson)
    } catch (e) {
      datelog(e)
      break
    }
    const txs = jsonObj.actions
    for (const rawTx of txs) {
      const tx = asThorchainTx(rawTx)

      if (tx.status !== 'success') {
        continue
      }
      if (tx.pools.length !== 2) {
        continue
      }

      const srcAsset = tx.in[0].coins[0].asset
      const match = tx.out.find(o => {
        const match2 = o.coins.find(c => c.asset === srcAsset)
        return match2 != null
      })

      // If there is a match between source and dest asset that means a refund was made
      // and the transaction failed
      if (match != null) {
        continue
      }

      const txOut = tx.out.find(o => o.coins[0].asset !== 'THOR.RUNE')
      if (txOut == null) {
        continue
      }

      const standardTx = processThorchainTx(rawTx)

      // See if the transaction exists already
      const previousTxIndex = standardTxs.findIndex(
        tx =>
          tx.orderId === standardTx.orderId &&
          tx.timestamp === standardTx.timestamp &&
          tx.depositCurrency === standardTx.depositCurrency &&
          tx.payoutCurrency === standardTx.payoutCurrency &&
          tx.payoutAmount === standardTx.payoutAmount &&
          tx.depositAmount !== standardTx.depositAmount
      )
      if (previousTxIndex === -1) {
        standardTxs.push(standardTx)
      } else {
        const previousTx = standardTxs[previousTxIndex]
        const previousRawTxs: unknown[] = Array.isArray(previousTx.rawTx)
          ? previousTx.rawTx
          : [previousTx.rawTx]
        const updatedStandardTx = processThorchainTx([
          ...previousRawTxs,
          standardTx.rawTx
        ])
        standardTxs.splice(previousTxIndex, 1, updatedStandardTx)
      }
      if (standardTx.isoDate > latestIsoDate) {
        latestIsoDate = standardTx.isoDate
      }
      if (standardTx.isoDate < oldestIsoDate) {
        oldestIsoDate = standardTx.isoDate
      }
      if (standardTx.isoDate < previousLatestIsoDate && !done) {
        datelog(
          `Thorchain done: date ${standardTx.isoDate} < ${previousLatestIsoDate}`
        )
        done = true
      }
    }

    if (txs.length < LIMIT) {
      break
    }
    offset += LIMIT
  }
  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const thorchain: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryThorchain,
  // results in a PluginResult
  pluginName: 'Thorchain',
  pluginId: 'thorchain'
}

export function processThorchainTx(rawTx: unknown): StandardTx {
  const rawTxs: unknown[] = Array.isArray(rawTx) ? rawTx : [rawTx]
  const txs = asArray(asThorchainTx)(rawTxs)
  const tx = txs.shift()

  if (tx == null) {
    throw new Error('Missing rawTx')
  }

  const srcAsset = tx.in[0].coins[0].asset
  const [chainAsset] = srcAsset.split('-')
  const [, asset] = chainAsset.split('.')

  const extraDepositAmount = txs.reduce((sum, tx) => {
    const depositAmount =
      Number(tx.in[0].coins[0].amount) / THORCHAIN_MULTIPLIER
    return sum + depositAmount
  }, 0)
  const depositAmount =
    Number(tx.in[0].coins[0].amount) / THORCHAIN_MULTIPLIER + extraDepositAmount

  const txOut = tx.out.find(o => o.coins[0].asset !== 'THOR.RUNE')

  if (txOut == null) {
    throw new Error('Unable to find THOR.RUNE asset in tx.out')
  }

  const [destChainAsset] = txOut.coins[0].asset.split('-')
  const [, destAsset] = destChainAsset.split('.')
  const payoutCurrency = destAsset
  const payoutAmount = Number(txOut.coins[0].amount) / THORCHAIN_MULTIPLIER

  const timestampMs = div(tx.date, '1000000', 16)
  const { timestamp, isoDate } = smartIsoDateFromTimestamp(Number(timestampMs))

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.in[0].txID,
    countryCode: null,
    depositTxid: tx.in[0].txID,
    depositAddress: undefined,
    depositCurrency: asset.toUpperCase(),
    depositAmount,
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: txOut?.txID,
    payoutAddress: txOut?.address,
    payoutCurrency,
    payoutAmount,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}
