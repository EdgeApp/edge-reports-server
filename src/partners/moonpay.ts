import {
  asArray,
  asDate,
  asNumber,
  asObject,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import {
  asStandardPluginParams,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx
} from '../types'
import { datelog } from '../util'

const asMoonpayCurrency = asObject({
  id: asString,
  type: asString,
  name: asString,
  code: asString
})

const asMoonpayTx = asObject({
  cryptoTransactionId: asString,
  baseCurrencyAmount: asNumber,
  walletAddress: asString,
  quoteCurrencyAmount: asNumber,
  createdAt: asDate,
  id: asString,
  baseCurrencyId: asString,
  currency: asMoonpayCurrency,
  baseCurrency: asMoonpayCurrency
})

const asMoonpaySellTx = asObject({
  baseCurrencyAmount: asNumber,
  quoteCurrencyAmount: asNumber,
  createdAt: asDate,
  id: asString,
  baseCurrencyId: asString,
  depositHash: asString,
  quoteCurrency: asMoonpayCurrency,
  baseCurrency: asMoonpayCurrency
})

type MoonpayTx = ReturnType<typeof asMoonpayTx>
type MoonpaySellTx = ReturnType<typeof asMoonpaySellTx>

const asMoonpayRawTx = asObject({
  status: asString
})

const asMoonpayResult = asArray(asUnknown)

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5
const PER_REQUEST_LIMIT = 50

export async function queryMoonpay(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []

  let headers
  const { apiKeys, settings } = asStandardPluginParams(pluginParams)
  const { latestIsoDate } = settings
  const { apiKey } = pluginParams.apiKeys

  if (typeof apiKey === 'string') {
    headers = {
      Authorization: `Api-Key ${apiKey}`
    }
  } else {
    return {
      settings: { latestIsoDate },
      transactions: []
    }
  }

  let offset = 0

  const queryTimeStamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  const queryIsoDate = new Date(queryTimeStamp).toISOString()
  let newestIsoDate = queryIsoDate

  while (true) {
    const url = `https://api.moonpay.io/v3/sell_transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}&startDate=${queryIsoDate}`
    const result = await fetch(url, {
      method: 'GET',
      headers
    })
    const txs = asMoonpayResult(await result.json())

    for (const rawtx of txs) {
      if (asMoonpayRawTx(rawtx).status === 'completed') {
        let tx: MoonpaySellTx
        try {
          tx = asMoonpaySellTx(rawtx)
        } catch (e) {
          datelog(e)
          datelog(rawtx)
          throw e
        }

        const isoDate = tx.createdAt.toISOString()
        const timestamp = tx.createdAt.getTime()
        const ssTx: StandardTx = {
          status: 'complete',
          orderId: tx.id,
          depositTxid: tx.depositHash,
          depositAddress: undefined,
          depositCurrency: tx.baseCurrency.code.toUpperCase(),
          depositAmount: tx.baseCurrencyAmount,
          payoutTxid: undefined,
          payoutAddress: undefined,
          payoutCurrency: tx.quoteCurrency.code.toUpperCase(),
          payoutAmount: tx.quoteCurrencyAmount,
          timestamp: timestamp / 1000,
          isoDate,
          usdValue: -1,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
        newestIsoDate = isoDate > newestIsoDate ? isoDate : newestIsoDate
      }
    }

    if (txs.length < PER_REQUEST_LIMIT) {
      break
    }
    console.log(
      `Moonpay sell txs: ${JSON.stringify(txs[txs.length - 1]).slice(0, 100)}`
    )

    offset += PER_REQUEST_LIMIT
  }

  while (true) {
    const url = `https://api.moonpay.io/v1/transactions?limit=${PER_REQUEST_LIMIT}&offset=${offset}&startDate=${queryIsoDate}`
    const result = await fetch(url, {
      method: 'GET',
      headers
    })
    const txs = asMoonpayResult(await result.json())
    // cryptoTransactionId is a duplicate among other transactions sometimes
    // in bulk update it throws an error for document update conflict because of this.

    for (const rawtx of txs) {
      if (asMoonpayRawTx(rawtx).status === 'completed') {
        let tx: MoonpayTx
        try {
          tx = asMoonpayTx(rawtx)
        } catch (e) {
          datelog(e)
          datelog(rawtx)
          throw e
        }

        const isoDate = tx.createdAt.toISOString()
        const timestamp = tx.createdAt.getTime()
        const ssTx: StandardTx = {
          status: 'complete',
          orderId: tx.id,
          depositTxid: undefined,
          depositAddress: undefined,
          depositCurrency: tx.baseCurrency.code.toUpperCase(),
          depositAmount: tx.baseCurrencyAmount,
          payoutTxid: tx.cryptoTransactionId,
          payoutAddress: tx.walletAddress,
          payoutCurrency: tx.currency.code.toUpperCase(),
          payoutAmount: tx.quoteCurrencyAmount,
          timestamp: timestamp / 1000,
          isoDate,
          usdValue: -1,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
        newestIsoDate = isoDate > newestIsoDate ? isoDate : newestIsoDate
      }
    }

    if (txs.length < PER_REQUEST_LIMIT) {
      break
    }

    console.log(
      `Moonpay buy txs: ${JSON.stringify(txs[txs.length - 1]).slice(0, 100)}`
    )
    offset += PER_REQUEST_LIMIT
  }

  const out: PluginResult = {
    settings: { latestIsoDate: newestIsoDate },
    transactions: ssFormatTxs
  }
  return out
}

export const moonpay: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryMoonpay,
  // results in a PluginResult
  pluginName: 'Moonpay',
  pluginId: 'moonpay'
}
