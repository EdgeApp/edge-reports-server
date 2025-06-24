import { div } from 'biggystring'
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import { HeadersInit } from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'

const asThorchainTx = asObject({
  date: asString,
  metadata: asObject({
    swap: asOptional(
      asObject({
        affiliateAddress: asOptional(asString)
      })
    )
  }),
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
      affiliate: asOptional(asBoolean),
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

type ThorchainPluginParams = ReturnType<typeof asThorchainPluginParams>
const asThorchainPluginParams = asObject({
  apiKeys: asObject({
    thorchainAddress: asString,
    affiliateAddress: asString,
    xClientId: asOptional(asString)
  }),
  settings: asObject({
    latestIsoDate: asOptional(asString, '1970-01-01T00:00:00.000Z')
  })
})

type Settings = ReturnType<typeof asSettings>
type ThorchainResult = ReturnType<typeof asThorchainResult>
type ThorchainTx = ReturnType<typeof asThorchainTx>

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const LIMIT = 50
const THORCHAIN_MULTIPLIER = 100000000

interface ThorchainInfo {
  pluginName: string
  pluginId: string
  midgardUrl: string
}

const makeThorchainPlugin = (info: ThorchainInfo): PartnerPlugin => {
  const { midgardUrl, pluginId, pluginName } = info
  const queryThorchain = async (
    pluginParams: PluginParams
  ): Promise<PluginResult> => {
    const standardTxs: StandardTx[] = []

    const pluginParamsClean = asThorchainPluginParams(pluginParams)
    const { settings, apiKeys } = pluginParamsClean
    const { affiliateAddress, thorchainAddress, xClientId } = apiKeys
    let { latestIsoDate } = settings

    let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
    if (previousTimestamp < 0) previousTimestamp = 0
    const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

    let done = false
    let oldestIsoDate = new Date(99999999999999).toISOString()

    let offset = 0

    let headers: HeadersInit | undefined
    if (xClientId != null) {
      headers = {
        'x-client-id': xClientId
      }
    }

    while (!done) {
      const url = `https://${midgardUrl}/v2/actions?address=${thorchainAddress}&type=swap,refund&affiliate=${affiliateAddress}&offset=${offset}&limit=${LIMIT}`
      let jsonObj: ThorchainResult
      try {
        await snooze(500)
        const result = await retryFetch(url, {
          method: 'GET',
          headers
        })
        if (!result.ok) {
          const text = await result.text()
          throw new Error(`Thorchain error: ${text}`)
        }
        const resultJson = await result.json()
        jsonObj = asThorchainResult(resultJson)
      } catch (e) {
        datelog(e)
        throw e
      }
      const txs = jsonObj.actions
      for (const rawTx of txs) {
        const standardTx = processThorchainTx(rawTx, info, pluginParamsClean)

        // Handle null case as a continue
        if (standardTx == null) {
          continue
        }

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
          const updatedStandardTx = processThorchainTx(
            [...previousRawTxs, standardTx.rawTx],
            info,
            pluginParamsClean
          )
          if (updatedStandardTx != null) {
            standardTxs.splice(previousTxIndex, 1, updatedStandardTx)
          }
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

  return {
    queryFunc: queryThorchain,
    pluginName,
    pluginId
  }
}

export const thorchain = makeThorchainPlugin({
  pluginName: 'Thorchain',
  pluginId: 'thorchain',
  midgardUrl: 'midgard.ninerealms.com'
})

export const maya = makeThorchainPlugin({
  pluginName: 'Maya',
  pluginId: 'maya',
  midgardUrl: 'midgard.mayachain.info'
})

export function processThorchainTx(
  rawTx: unknown,
  info: ThorchainInfo,
  pluginParams: ThorchainPluginParams
): StandardTx | null {
  const { pluginId } = info
  const { affiliateAddress, thorchainAddress } = pluginParams.apiKeys

  const rawTxs: unknown[] = Array.isArray(rawTx) ? rawTx : [rawTx]
  const txs = asArray(asThorchainTx)(rawTxs)
  const tx = txs[0]

  if (tx == null) {
    throw new Error(`${pluginId}: Missing rawTx`)
  }

  const { swap } = tx.metadata
  if (swap?.affiliateAddress !== affiliateAddress) {
    return null
  }

  if (tx.status !== 'success') {
    return null
  }

  // There must be an affiliate output
  const affiliateOut = tx.out.some(
    o => o.affiliate === true || o.address === thorchainAddress
  )
  if (!affiliateOut) {
    return null
  }

  // Find the source asset
  if (tx.in.length !== 1) {
    throw new Error(`${pluginId}: Unexpected ${tx.in.length} txIns. Expected 1`)
  }
  const txIn = tx.in[0]
  if (txIn.coins.length !== 1) {
    throw new Error(
      `${pluginId}: Unexpected ${txIn.coins.length} txIn.coins. Expected 1`
    )
  }
  const depositAmount = txs.reduce((sum, txInternal) => {
    const amount =
      Number(txInternal.in[0].coins[0].amount) / THORCHAIN_MULTIPLIER
    return sum + amount
  }, 0)

  const srcDestMatch = tx.out.some(o => {
    const match = o.coins.some(
      c => c.asset === txIn.coins[0].asset && o.affiliate !== true
    )
    return match
  })

  // If there is a match between source and dest asset that means a refund was made
  // and the transaction failed
  if (srcDestMatch) {
    return null
  }

  const timestampMs = div(tx.date, '1000000', 16)
  const { timestamp, isoDate } = smartIsoDateFromTimestamp(Number(timestampMs))

  const [chainAsset] = txIn.coins[0].asset.split('-')
  const [, asset] = chainAsset.split('.')

  // Find the first output that does not match the affiliate address
  // as this is assumed to be the true destination asset/address
  // If we can't find one, then just match the affiliate address as
  // this means the affiliate address is the actual destination.
  const hasAffiliateFlag = tx.out.some(o => o.affiliate === true)
  let txOut = tx.out.find(out => {
    if (hasAffiliateFlag) {
      return out.affiliate !== true
    } else {
      return out.address !== thorchainAddress
    }
  })

  if (txOut == null) {
    // If there are two pools but only one output, there's a problem and we should skip
    // this transaction. Midgard sometimes doesn't return the correct output until the transaction
    // has completed for awhile.
    if (tx.pools.length === 2 && tx.out.length === 1) {
      return null
    } else if (tx.pools.length === 1 && tx.out.length === 1) {
      // The output is a native currency output (maya/rune)
      txOut = tx.out[0]
    } else {
      throw new Error(`${pluginId}: Cannot find output`)
    }
  }

  const [destChainAsset] = txOut.coins[0].asset.split('-')
  const [, destAsset] = destChainAsset.split('.')
  const payoutCurrency = destAsset
  const payoutAmount = Number(txOut.coins[0].amount) / THORCHAIN_MULTIPLIER

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
    payoutTxid: txOut.txID,
    payoutAddress: txOut.address,
    payoutCurrency,
    payoutAmount,
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}
