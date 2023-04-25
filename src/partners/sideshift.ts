import {
  asArray,
  asMaybe,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import crypto from 'crypto'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asSideshiftTx = asObject({
  id: asString,
  depositAddress: asMaybe(asObject({ address: asMaybe(asString) })),
  prevDepositAddresses: asMaybe(asObject({ address: asMaybe(asString) })),
  depositMethodId: asString,
  invoiceAmount: asString,
  settleAddress: asObject({
    address: asString
  }),
  settleMethodId: asString,
  settleAmount: asString,
  createdAt: asString
})

const asSideshiftPluginParams = asObject({
  apiKeys: asObject({
    sideshiftAffiliateId: asString,
    sideshiftAffiliateSecret: asString
  }),
  settings: asObject({
    latestIsoDate: asOptional(asString, '1970-01-01T00:00:00.000Z')
  })
})

type SideshiftTx = ReturnType<typeof asSideshiftTx>
const asSideshiftResult = asArray(asUnknown)

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

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
  lastCheckedTimestamp: number
): Promise<StandardTx[]> {
  const time = Date.now()

  const signature = affiliateSignature(affiliateId, affiliateSecret, time)
  const url = `https://sideshift.ai/api/affiliate/completedOrders?affiliateId=${affiliateId}&since=${lastCheckedTimestamp}&currentTime=${time}&signature=${signature}`
  let tries = 5
  while (--tries > 0) {
    try {
      const response = await fetch(url)
      if (response.ok === false) {
        const text = await response.text()
        throw new Error(text)
      }
      const jsonObj = await response.json()
      const orders = asSideshiftResult(jsonObj)
      const out: StandardTx[] = []
      for (const order of orders) {
        let tx: SideshiftTx
        try {
          tx = asSideshiftTx(order)
        } catch (e) {
          datelog(e)
          datelog(JSON.stringify(order, null, 2))
          throw e
        }
        const depositAddress =
          tx.depositAddress?.address ?? tx.prevDepositAddresses?.address

        out.push({
          status: 'complete',
          orderId: tx.id,
          depositTxid: undefined,
          depositAddress,
          depositCurrency: tx.depositMethodId.toUpperCase(),
          depositAmount: Number(tx.invoiceAmount),
          payoutTxid: undefined,
          payoutAddress: tx.settleAddress.address,
          payoutCurrency: tx.settleMethodId.toUpperCase(),
          payoutAmount: Number(tx.settleAmount),
          timestamp: new Date(tx.createdAt).getTime() / 1000,
          isoDate: tx.createdAt,
          usdValue: undefined,
          rawTx: order
        })
      }
      return out
    } catch (e) {
      const err: any = e
      datelog(err)
      if (err.code !== 'ETIMEDOUT') {
        throw err
      }
    }
  }
  throw new Error('Failed to fetch transactions')
}

export async function querySideshift(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asSideshiftPluginParams(pluginParams)
  const { sideshiftAffiliateId, sideshiftAffiliateSecret } = apiKeys
  const { latestIsoDate } = settings

  let lastCheckedTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (lastCheckedTimestamp < 0) lastCheckedTimestamp = 0

  const txs: StandardTx[] = []

  while (true) {
    const newTxs = await fetchTransactions(
      sideshiftAffiliateId,
      sideshiftAffiliateSecret,
      lastCheckedTimestamp
    )

    txs.push(...newTxs)
    lastCheckedTimestamp = Math.max(...newTxs.map(tx => tx.timestamp)) * 1000
    if (newTxs.length < 3) {
      console.log('break')
      break
    }
  }

  const out = {
    settings: {
      latestIsoDate: new Date(lastCheckedTimestamp)
    },
    transactions: txs
  }
  return out
}

export const sideshift: PartnerPlugin = {
  queryFunc: querySideshift,
  pluginName: 'SideShift.ai',
  pluginId: 'sideshift'
}
