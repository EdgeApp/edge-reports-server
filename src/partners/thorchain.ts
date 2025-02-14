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
    const ssFormatTxs: StandardTx[] = []

    const { settings, apiKeys } = asThorchainPluginParams(pluginParams)
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
        const {
          date,
          metadata,
          in: txIns,
          out: txOuts,
          pools,
          status: txStatus
        } = asThorchainTx(rawTx) // Check RAW trasaction

        const { swap } = metadata
        if (swap?.affiliateAddress !== affiliateAddress) {
          continue
        }
        const status = 'complete'
        if (txStatus !== 'success') {
          continue
        }

        // There must be an affiliate output
        const affiliateOut = txOuts.some(
          o => o.affiliate === true || o.address === thorchainAddress
        )
        if (!affiliateOut) {
          continue
        }

        // Find the source asset
        if (txIns.length !== 1) {
          throw new Error(
            `${pluginId}: Unexpected ${txIns.length} txIns. Expected 1`
          )
        }
        const txIn = txIns[0]
        if (txIn.coins.length !== 1) {
          throw new Error(
            `${pluginId}: Unexpected ${txIn.coins.length} txIn.coins. Expected 1`
          )
        }
        const coin = txIn.coins[0]
        const srcAsset = coin.asset
        const depositAmount = Number(coin.amount) / THORCHAIN_MULTIPLIER

        const srcDestMatch = txOuts.some(o => {
          const match = o.coins.some(
            c => c.asset === srcAsset && o.affiliate !== true
          )
          return match
        })

        // If there is a match between source and dest asset that means a refund was made
        // and the transaction failed
        if (srcDestMatch) {
          continue
        }

        const timestampMs = div(date, '1000000', 16)
        const { timestamp, isoDate } = smartIsoDateFromTimestamp(
          Number(timestampMs)
        )

        const [chainAsset] = srcAsset.split('-')
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_chain, asset] = chainAsset.split('.')

        // Find the first output that does not match the affiliate address
        // as this is assumed to be the true destination asset/address
        // If we can't find one, then just match the affiliate address as
        // this means the affiliate address is the actual destination.
        const hasAffiliateFlag = txOuts.some(o => o.affiliate === true)
        let txOut = txOuts.find(out => {
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
          if (pools.length === 2 && txOuts.length === 1) {
            continue
          } else if (pools.length === 1 && txOuts.length === 1) {
            // The output is a native currency output (maya/rune)
            txOut = txOuts[0]
          } else {
            throw new Error(`${pluginId}: Cannot find output`)
          }
        }

        const [destChainAsset] = txOut.coins[0].asset.split('-')
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_destChain, destAsset] = destChainAsset.split('.')
        const payoutCurrency = destAsset
        const payoutAmount =
          Number(txOut.coins[0].amount) / THORCHAIN_MULTIPLIER

        const ssTx: StandardTx = {
          status,
          orderId: txIns[0].txID,
          depositTxid: txIns[0].txID,
          depositAddress: undefined,
          depositCurrency: asset.toUpperCase(),
          depositAmount,
          payoutTxid: txOut.txID,
          payoutAddress: txOut.address,
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
