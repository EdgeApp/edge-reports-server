import Changelly from 'api-changelly/lib.js'
import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asChangellyTx = asObject({
  payinHash: asString,
  payoutHash: asString,
  payinAddress: asString,
  currencyFrom: asString,
  amountFrom: asString,
  payoutAddress: asString,
  currencyTo: asString,
  amountTo: asString,
  createdAt: asNumber
})

const asChangellyRawTx = asObject({
  status: asString
})

const asChangellyResult = asObject({
  result: asArray(asUnknown)
})

const LIMIT = 100
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

async function getTransactionsPromised(
  changellySDK: any,
  limit: number,
  offset: number,
  currencyFrom: string | undefined,
  address: string | undefined,
  extraId: string | undefined
): Promise<ReturnType<typeof asChangellyResult>> {
  return new Promise((resolve, reject) => {
    changellySDK.getTransactions(
      limit,
      offset,
      currencyFrom,
      address,
      extraId,
      (err, data) => {
        if (err != null) {
          reject(err)
        } else {
          resolve(data)
        }
      }
    )
  })
}

export async function queryChangelly(
  pluginParams: PluginParams
): Promise<PluginResult> {
  let changellySDK
  let latestTimeStamp = 0
  if (typeof pluginParams.settings.latestTimeStamp === 'number') {
    latestTimeStamp = pluginParams.settings.latestTimeStamp
  }
  if (
    typeof pluginParams.apiKeys.changellyApiKey === 'string' &&
    typeof pluginParams.apiKeys.changellyApiSecret === 'string'
  ) {
    changellySDK = new Changelly(
      pluginParams.apiKeys.changellyApiKey,
      pluginParams.apiKeys.changellyApiSecret
    )
  } else {
    return {
      settings: {
        latestTimeStamp: latestTimeStamp
      },
      transactions: []
    }
  }

  let offset = 0
  const ssFormatTxs: StandardTx[] = []
  let newLatestTimeStamp = latestTimeStamp
  let done = false
  while (!done) {
    console.log(`Query changelly offset: ${offset}`)
    const result = await getTransactionsPromised(
      changellySDK,
      LIMIT,
      offset,
      undefined,
      undefined,
      undefined
    )
    for (const rawtx of result.result) {
      if (asChangellyRawTx(rawtx).status === 'finished') {
        const tx = asChangellyTx(rawtx)
        const ssTx: StandardTx = {
          status: 'complete',
          orderId: tx.payinHash,
          depositTxid: tx.payinHash,
          depositAddress: tx.payinAddress,
          depositCurrency: tx.currencyFrom.toUpperCase(),
          depositAmount: parseFloat(tx.amountFrom),
          payoutTxid: tx.payoutHash,
          payoutAddress: tx.payoutAddress,
          payoutCurrency: tx.currencyTo.toUpperCase(),
          payoutAmount: parseFloat(tx.amountTo),
          timestamp: tx.createdAt,
          isoDate: new Date(tx.createdAt * 1000).toISOString(),
          usdValue: undefined,
          rawTx: rawtx
        }
        ssFormatTxs.push(ssTx)
        if (tx.createdAt > newLatestTimeStamp) {
          newLatestTimeStamp = tx.createdAt
        }
        if (tx.createdAt < latestTimeStamp - QUERY_LOOKBACK) {
          done = true
        }
      }
    }
    if (result.result.length < LIMIT) {
      break
    }
    offset += LIMIT
  }
  const out = {
    settings: { latestTimeStamp: newLatestTimeStamp },
    transactions: ssFormatTxs
  }
  return out
}

export const changelly: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryChangelly,
  // results in a PluginResult
  pluginName: 'Changelly',
  pluginId: 'changelly'
}
