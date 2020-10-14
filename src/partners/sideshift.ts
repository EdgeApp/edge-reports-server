import { asObject, asString } from 'cleaners'
import crypto from 'crypto'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asSideshiftTx = asObject({
  id: asString,
  depositAddress: asObject({
    address: asString
  }),
  depositAsset: asString,
  invoiceAmount: asString,
  settleAddress: asObject({
    address: asString
  }),
  settleAsset: asString,
  settleAmount: asString,
  createdAt: asString
})

const LIMIT = 500
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

function affiliateSignature(
  affiliateId: string,
  affiliateSecret: string,
  time: number
): string {
  return crypto
    .createHmac('sha1', affiliateSecret)
    .update(`${affiliateId}${time}`)
    .digest('hex')
}

async function fetchTransactions(
  affiliateId: string,
  affiliateSecret: string,
  offset: number,
  limit: number
): Promise<StandardTx[]> {
  const time = Date.now()

  const signature = affiliateSignature(affiliateId, affiliateSecret, time)
  const url = `https://sideshift.ai/api/affiliate/completedOrders?limit=${limit}&offset=${offset}&affiliateId=${affiliateId}&time=${time}&signature=${signature}`

  try {
    const response = await fetch(url)
    const orders = await response.json()

    return orders.map(order => {
      const tx = asSideshiftTx(order)

      return {
        status: 'complete',
        orderId: tx.id,
        depositTxid: undefined,
        depositAddress: tx.depositAddress.address,
        depositCurrency: tx.depositAsset.toUpperCase(),
        depositAmount: Number(tx.invoiceAmount),
        payoutTxid: undefined,
        payoutAddress: tx.settleAddress.address,
        payoutCurrency: tx.settleAsset.toUpperCase(),
        payoutAmount: Number(tx.settleAmount),
        timestamp: new Date(tx.createdAt).getTime() / 1000,
        isoDate: tx.createdAt,
        usdValue: undefined,
        rawTx: order
      }
    })
  } catch (e) {
    datelog(e)
    throw e
  }
}

export async function querySideshift(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const {
    apiKeys: { sideshiftAffiliateId, sideshiftAffiliateSecret }
  } = pluginParams
  let {
    settings: { lastCheckedTimestamp, offset }
  } = pluginParams

  if (typeof lastCheckedTimestamp === 'number') {
    lastCheckedTimestamp -= QUERY_LOOKBACK
  }

  if (!(typeof sideshiftAffiliateSecret === 'string')) {
    return {
      settings: { lastCheckedTimestamp },
      transactions: []
    }
  }

  const txs: StandardTx[] = []

  let prevMaxTimestamp = 0

  while (true) {
    const newTxs = await fetchTransactions(
      sideshiftAffiliateId,
      sideshiftAffiliateSecret,
      offset,
      LIMIT
    )

    txs.push(...newTxs)

    offset += newTxs.length

    const newTxMaxTimestamp = Math.max(...newTxs.map(tx => tx.timestamp))

    if (newTxMaxTimestamp > prevMaxTimestamp) {
      prevMaxTimestamp = newTxMaxTimestamp
    }

    if (lastCheckedTimestamp > newTxMaxTimestamp || newTxs.length < LIMIT) {
      break
    }
  }

  return {
    settings: { lastCheckedTimestamp: prevMaxTimestamp, offset },
    transactions: txs
  }
}

export const sideshift: PartnerPlugin = {
  queryFunc: querySideshift,
  pluginName: 'SideShift.ai',
  pluginId: 'sideshift'
}
