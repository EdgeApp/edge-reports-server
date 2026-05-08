import { div } from 'biggystring'
import {
  asArray,
  asBoolean,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import { HeadersInit } from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'
import {
  ChainNameToPluginIdMapping,
  createTokenId,
  EdgeTokenId,
  tokenTypes
} from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

// Thorchain chain names to Edge pluginIds
const THORCHAIN_CHAIN_TO_PLUGINID: ChainNameToPluginIdMapping = {
  ARB: 'arbitrum',
  BASE: 'base',
  BTC: 'bitcoin',
  DASH: 'dash',
  ETH: 'ethereum',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  XRP: 'ripple',
  BCH: 'bitcoincash',
  BSC: 'binancesmartchain',
  BNB: 'binancesmartchain',
  AVAX: 'avalanche',
  TRON: 'tron',
  THOR: 'thorchainrune',
  GAIA: 'cosmoshub',
  KUJI: 'kujira',
  MAYA: 'mayachain',
  ZEC: 'zcash'
}

interface ParsedThorchainAsset {
  chain: string
  asset: string
  contractAddress?: string
}

/**
 * Parse Thorchain asset string format: "CHAIN.ASSET" or "CHAIN.ASSET-CONTRACT"
 * Examples:
 *   "BTC.BTC" -> { chain: "BTC", asset: "BTC" }
 *   "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7" -> { chain: "ETH", asset: "USDT", contractAddress: "0XDAC..." }
 */
function parseThorchainAsset(assetString: string): ParsedThorchainAsset {
  const [chainAssetPart, contractAddress] = assetString.split('-')
  const [chain, asset] = chainAssetPart.split('.')
  return { chain, asset, contractAddress }
}

/**
 * Get Edge asset info (pluginId, evmChainId, tokenId) from Thorchain asset string
 */
function getEdgeAssetInfo(
  assetString: string
): {
  asset: string
  pluginId: string
  evmChainId: number | undefined
  tokenId: EdgeTokenId
} {
  const { chain, asset, contractAddress } = parseThorchainAsset(assetString)

  const pluginId = THORCHAIN_CHAIN_TO_PLUGINID[chain]
  if (pluginId == null) {
    throw new Error(`Unknown Thorchain chain: ${chain}`)
  }

  const evmChainId = EVM_CHAIN_IDS[pluginId]
  const tokenType = tokenTypes[pluginId]
  const tokenId = createTokenId(tokenType, asset, contractAddress)

  return { asset, pluginId, evmChainId, tokenId }
}

const asThorchainTx = asObject({
  date: asString,
  metadata: asObject({
    swap: asOptional(
      asObject({
        affiliateAddress: asOptional(asString)
      })
    ),
    refund: asOptional(
      asObject({
        affiliateAddress: asOptional(asString),
        reason: asOptional(asString)
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

const asThorchainResult = asObject({
  actions: asArray(asUnknown)
})

type ThorchainPluginParams = ReturnType<typeof asThorchainPluginParams>
const asThorchainPluginParams = asObject({
  apiKeys: asObject({
    // Deprecated: ignored. Affiliate matching now relies on the THORName
    // (`affiliateAddress`) and Midgard's `affiliate: true` output flag, which
    // works whether per-swap RUNE is paid to the affiliate's own address or
    // to the affiliate_collector module under a preferred-asset config.
    thorchainAddress: asOptional(asString),
    affiliateAddress: asString,
    xClientId: asOptional(asString)
  }),
  settings: asObject({
    latestIsoDate: asOptional(asString, '1970-01-01T00:00:00.000Z')
  })
})

type ThorchainResult = ReturnType<typeof asThorchainResult>
type ThorchainTx = ReturnType<typeof asThorchainTx>

const LIMIT = 50
const THORCHAIN_MULTIPLIER = 100000000

// Earliest date Edge had any THORChain affiliate volume. Used as the genesis
// anchor on the very first run when no prior progress exists.
const GENESIS_ISO = '2022-01-01T00:00:00.000Z'

// Rolling window size used both for the per-iteration query span and for the
// rollback applied to `latestIsoDate` on each new run. Approximate calendar
// month — exact alignment is unnecessary.
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000

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
    const { log } = pluginParams
    const standardTxs: StandardTx[] = []

    const pluginParamsClean = asThorchainPluginParams(pluginParams)
    const { settings, apiKeys } = pluginParamsClean
    const { affiliateAddress, xClientId } = apiKeys
    let { latestIsoDate } = settings

    const processTx = makeThorchainProcessTx(info)

    let headers: HeadersInit | undefined
    if (xClientId != null) {
      headers = {
        'x-client-id': xClientId
      }
    }

    // Walk forward in rolling ~30-day windows. We start one month before the
    // last persisted watermark so each run re-covers ~1 month of overlap, and
    // we stop once the windows reach the run-start moment. On success we
    // persist `latestIsoDate = runStartIso`; the rollback happens implicitly
    // on the next run.
    const runStart = new Date()
    const runStartIso = runStart.toISOString()
    const startMs = Math.max(
      Date.parse(GENESIS_ISO),
      Date.parse(latestIsoDate) - ONE_MONTH_MS
    )
    let windowStart = new Date(startMs)

    try {
      while (windowStart < runStart) {
        const windowEnd = new Date(windowStart.getTime() + ONE_MONTH_MS)
        const windowStartIso = windowStart.toISOString()
        const windowEndIso = windowEnd.toISOString()
        // Midgard's `timestamp` is "older than this UNIX-seconds upper bound".
        const upperBoundUnix = Math.floor(windowEnd.getTime() / 1000)
        let offset = 0
        let crossedLowerBound = false

        while (true) {
          const url = `https://${midgardUrl}/v2/actions?type=swap,refund&affiliate=${affiliateAddress}&timestamp=${upperBoundUnix}&offset=${offset}&limit=${LIMIT}`
          await snooze(500)
          const result = await retryFetch(url, { method: 'GET', headers })
          if (!result.ok) {
            const text = await result.text()
            throw new Error(`Thorchain error: ${text}`)
          }
          const jsonObj = asThorchainResult(await result.json())
          const txs = jsonObj.actions

          // Midgard returns each page newest-first within the upper bound.
          let pageOldestIso: string | undefined
          let pageNewestIso: string | undefined
          for (const rawTx of txs) {
            const standardTx = processTx(rawTx, pluginParams)
            if (standardTx == null) continue

            const iso = standardTx.isoDate
            if (pageNewestIso == null || iso > pageNewestIso) {
              pageNewestIso = iso
            }
            if (pageOldestIso == null || iso < pageOldestIso) {
              pageOldestIso = iso
            }

            // Pages are newest-first, so as soon as we see an action older
            // than the window's lower bound, every remaining action on this
            // page is also out of window — break and let the outer loop
            // advance to the next window.
            if (iso < windowStartIso) {
              crossedLowerBound = true
              break
            }

            // Dedupe streaming-swap fragments by orderId+timestamp+assets,
            // aggregating depositAmount across raw fragments.
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
              const updatedStandardTx = processTx(
                [...previousRawTxs, standardTx.rawTx],
                pluginParams
              )
              if (updatedStandardTx != null) {
                standardTxs.splice(previousTxIndex, 1, updatedStandardTx)
              }
            }
          }

          log(
            `window=${windowStartIso}..${windowEndIso} offset=${offset} count=${
              txs.length
            } range=${pageOldestIso ?? 'n/a'}..${pageNewestIso ?? 'n/a'}`
          )

          // Page contained an action older than this window's lower bound, so
          // we have everything in-window and can move to the next window.
          if (txs.length < LIMIT || crossedLowerBound) break
          offset += LIMIT
        }

        windowStart = windowEnd
      }

      // Run completed cleanly — persist the run-start timestamp. The next run
      // will roll back by one month from this and re-query the overlap.
      latestIsoDate = runStartIso
      log(`run completed; latestIsoDate=${latestIsoDate}`)
    } catch (e) {
      // Irrecoverable error mid-window. Fall through to return collected
      // progress with the prior watermark so the next run retries the same
      // span (after its standard one-month rollback).
      log.error(
        `aborting run; preserving latestIsoDate=${latestIsoDate}: ${String(e)}`
      )
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

export const THORCHAIN_INFO: ThorchainInfo = {
  pluginName: 'Thorchain',
  pluginId: 'thorchain',
  midgardUrl: 'gateway.liquify.com/chain/thorchain_midgard'
}

export const MAYA_INFO: ThorchainInfo = {
  pluginName: 'Maya',
  pluginId: 'maya',
  midgardUrl: 'midgard.mayachain.info'
}

export function makeThorchainProcessTx(
  info: ThorchainInfo
): (rawTx: unknown, pluginParams?: PluginParams) => StandardTx | null {
  const { pluginId } = info

  return (rawTx: unknown, pluginParams?: PluginParams): StandardTx | null => {
    if (pluginParams == null) {
      throw new Error(`${pluginId}: Missing pluginParams`)
    }
    const { log } = pluginParams
    const { affiliateAddress } = asThorchainPluginParams(pluginParams).apiKeys
    const rawTxs: unknown[] = Array.isArray(rawTx) ? rawTx : [rawTx]
    const txs = asArray(asThorchainTx)(rawTxs)
    const tx = txs[0]

    if (tx == null) {
      throw new Error(`${pluginId}: Missing rawTx`)
    }

    const txId = tx.in[0]?.txID ?? 'unknown'

    const { swap, refund } = tx.metadata
    // Midgard's `affiliateAddress` field on swap/refund metadata holds the
    // THORName parsed from the memo (not an address). Compare the THORName
    // from whichever metadata block applies to the action type.
    const txAffiliateName = swap?.affiliateAddress ?? refund?.affiliateAddress
    // The affiliate field can be a single THORName or a `/`- or `,`-separated
    // list when multiple affiliates split the fee (e.g. "-_/ej"). We accept
    // the action as long as our THORName appears in the list.
    const txAffiliateList =
      txAffiliateName != null
        ? txAffiliateName.split(/[/,]/).map(s => s.trim())
        : []
    if (!txAffiliateList.includes(affiliateAddress)) {
      const got = txAffiliateName ?? 'none'
      throw new Error(
        `${pluginId}: ${txId} type=${tx.type} thorname mismatch (got=${got} want=${affiliateAddress}) \u2014 the URL filter should have excluded this`
      )
    }

    if (tx.status !== 'success') {
      log(`${pluginId}: skip ${txId} status=${tx.status}`)
      return null
    }

    const isRefund =
      tx.type === 'refund' ||
      tx.out.some(o =>
        o.coins.some(
          c => c.asset === tx.in[0]?.coins[0]?.asset && o.affiliate !== true
        )
      )

    // No per-output affiliate sanity check: the URL-level `affiliate=` filter
    // already guarantees Midgard returned only actions whose metadata names
    // our THORName. Historically (pre-affiliate_collector era, ~2022) the
    // affiliate-fee RUNE was paid in a separate THORChain transfer that does
    // not appear in this swap action's `out` array, so requiring an
    // `affiliate: true` output here would erroneously reject legitimate
    // legacy-era swaps (e.g. AC2046F9...DOGE->LTC, 2022-08-23).

    // Find the source asset
    if (tx.in.length !== 1) {
      throw new Error(
        `${pluginId}: Unexpected ${tx.in.length} txIns. Expected 1`
      )
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

    const timestampMs = div(tx.date, '1000000', 16)
    const { timestamp, isoDate } = smartIsoDateFromTimestamp(
      Number(timestampMs)
    )

    // Parse deposit asset info
    const depositAssetString = txIn.coins[0].asset
    const depositAssetInfo = getEdgeAssetInfo(depositAssetString)

    // The user destination is the non-affiliate output.
    //  - Normal swap: there is an `affiliate: true` RUNE output (skipped here),
    //    plus the user's destination output.
    //  - Refund: no `affiliate: true` output; the only output is the refund
    //    going back to the user on the source chain.
    let txOut = tx.out.find(out => out.affiliate !== true)

    if (txOut == null) {
      if (isRefund && tx.out.length === 0) {
        // Midgard occasionally records `type=refund, status=success, out=[]`
        // when the refund attempt itself failed (e.g. network fees exceeded
        // the deposit, so no on-chain refund was emitted). Nothing was
        // transferred and no affiliate revenue was generated, so skip.
        const reason = refund?.reason ?? 'unknown'
        log(
          `${pluginId}: skip ${txId} failed refund (no output) reason=${reason}`
        )
        return null
      } else if (tx.pools.length === 2 && tx.out.length === 1) {
        // Midgard sometimes doesn't return the user-destination output until
        // the transaction has been settled for a while. Skip and retry next
        // run (the rolling overlap window will pick it up).
        log(
          `${pluginId}: skip ${txId} pools.length=2 out.length=1 (incomplete)`
        )
        return null
      } else if (tx.pools.length === 1 && tx.out.length === 1) {
        // Single-pool swap with a native (RUNE/CACAO) destination output.
        txOut = tx.out[0]
      } else {
        throw new Error(
          `${pluginId}: ${txId} Cannot find output (type=${tx.type} pools=${tx.pools.length} out=${tx.out.length})`
        )
      }
    }

    // Parse payout asset info
    const payoutAssetString = txOut.coins[0].asset
    const payoutAssetInfo = getEdgeAssetInfo(payoutAssetString)

    const payoutCurrency = payoutAssetInfo.asset
    const payoutAmount = Number(txOut.coins[0].amount) / THORCHAIN_MULTIPLIER

    if (isRefund) {
      const reason = refund?.reason ?? 'unknown'
      const dep = depositAssetInfo.asset
      const pay = payoutAssetInfo.asset
      log(`${pluginId}: refund ${txId} ${dep}->${pay} reason=${reason}`)
    }

    const standardTx: StandardTx = {
      status: isRefund ? 'refunded' : 'complete',
      orderId: tx.in[0].txID,
      countryCode: null,
      depositTxid: tx.in[0].txID,
      depositAddress: undefined,
      depositCurrency: depositAssetInfo.asset.toUpperCase(),
      depositChainPluginId: depositAssetInfo.pluginId,
      depositEvmChainId: depositAssetInfo.evmChainId,
      depositTokenId: depositAssetInfo.tokenId,
      depositAmount,
      direction: null,
      exchangeType: 'swap',
      paymentType: null,
      payoutTxid: txOut.txID,
      payoutAddress: txOut.address,
      payoutCurrency,
      payoutChainPluginId: payoutAssetInfo.pluginId,
      payoutEvmChainId: payoutAssetInfo.evmChainId,
      payoutTokenId: payoutAssetInfo.tokenId,
      payoutAmount,
      timestamp,
      isoDate,
      usdValue: -1,
      rawTx
    }
    return standardTx
  }
}

export const thorchain = makeThorchainPlugin(THORCHAIN_INFO)
export const maya = makeThorchainPlugin(MAYA_INFO)
export const processThorchainTx = makeThorchainProcessTx(THORCHAIN_INFO)
export const processMayaTx = makeThorchainProcessTx(MAYA_INFO)
