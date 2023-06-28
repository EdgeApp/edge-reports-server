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
  const ssFormatTxs: StandardTx[] = []

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
      const {
        date,
        in: txIns,
        out: txOuts,
        pools,
        status: txStatus
      } = asThorchainTx(rawTx) // Check RAW trasaction

      const status = 'complete'
      if (txStatus !== 'success') {
        continue
      }
      if (pools.length !== 2) {
        continue
      }

      const srcAsset = txIns[0].coins[0].asset
      const match = txOuts.find(o => {
        const match2 = o.coins.find(c => c.asset === srcAsset)
        return match2 != null
      })

      // If there is a match between source and dest asset that means a refund was made
      // and the transaction failed
      if (match != null) {
        continue
      }

      const timestampMs = div(date, '1000000', 16)
      const { timestamp, isoDate } = smartIsoDateFromTimestamp(
        Number(timestampMs)
      )

      const [chainAsset] = srcAsset.split('-')
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_chain, asset] = chainAsset.split('.')

      const depositAmount =
        Number(txIns[0].coins[0].amount) / THORCHAIN_MULTIPLIER

      const txOut = txOuts.find(o => o.coins[0].asset !== 'THOR.RUNE')
      if (txOut == null) {
        continue
      }

      let payoutCurrency
      let payoutAmount = 0
      if (txOut != null) {
        const [destChainAsset] = txOut.coins[0].asset.split('-')
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_destChain, destAsset] = destChainAsset.split('.')
        payoutCurrency = destAsset
        payoutAmount = Number(txOut.coins[0].amount) / THORCHAIN_MULTIPLIER
      }

      const ssTx: StandardTx = {
        status,
        orderId: txIns[0].txID,
        depositTxid: txIns[0].txID,
        depositAddress: undefined,
        depositCurrency: asset.toUpperCase(),
        depositAmount,
        payoutTxid: txOut?.txID,
        payoutAddress: txOut?.address,
        payoutCurrency,
        payoutAmount,
        timestamp,
        isoDate,
        usdValue: -1,
        rawTx
      }

      // See if the transaction exists already
      const matchTx = ssFormatTxs.find(
        tx =>
          tx.orderId === ssTx.orderId &&
          tx.timestamp === ssTx.timestamp &&
          tx.depositCurrency === ssTx.depositCurrency &&
          tx.payoutCurrency === ssTx.payoutCurrency &&
          tx.payoutAmount === ssTx.payoutAmount &&
          tx.depositAmount !== ssTx.depositAmount
      )
      if (matchTx == null) {
        ssFormatTxs.push(ssTx)
      } else {
        matchTx.depositAmount += ssTx.depositAmount
      }
      if (ssTx.isoDate > latestIsoDate) {
        latestIsoDate = ssTx.isoDate
      }
      if (ssTx.isoDate < oldestIsoDate) {
        oldestIsoDate = ssTx.isoDate
      }
      if (ssTx.isoDate < previousLatestIsoDate && !done) {
        datelog(
          `Thorchain done: date ${ssTx.isoDate} < ${previousLatestIsoDate}`
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
    transactions: ssFormatTxs
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
