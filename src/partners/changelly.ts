import Changelly from 'api-changelly/lib.js'
import { asArray, asNumber, asObject, asString } from 'cleaners'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const asChangellyTx = asObject({
  status: asString,
  payinHash: asString,
  payinAddress: asString,
  currencyFrom: asString,
  amountExpectedFrom: asString,
  payoutAddress: asString,
  currencyTo: asString,
  amountExpectedTo: asString,
  createdAt: asNumber
})

const asChangellyResult = asObject({
  result: asArray(asChangellyTx)
})

const LIMIT = 100
const MAX_QUERY_SIZE = 1000

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
      settings: {},
      transactions: []
    }
  }

  let offset = 0
  const ssFormatTxs: StandardTx[] = []
  while (true) {
    const result = await getTransactionsPromised(
      changellySDK,
      LIMIT,
      offset,
      undefined,
      undefined,
      undefined
    )
    for (const tx of result.result) {
      if (tx.status === 'finished') {
        const ssTx: StandardTx = {
          status: 'complete',
          inputTXID: tx.payinHash,
          inputAddress: tx.payinAddress,
          inputCurrency: tx.currencyFrom.toUpperCase(),
          inputAmount: tx.amountExpectedFrom,
          outputAddress: tx.payoutAddress,
          outputCurrency: tx.currencyTo.toUpperCase(),
          outputAmount: tx.amountExpectedTo,
          timestamp: tx.createdAt,
          isoDate: new Date(tx.createdAt * 1000).toISOString()
        }
        ssFormatTxs.push(ssTx)
      }
    }
    if (result.result.length < LIMIT) {
      break
    }
    if (offset > MAX_QUERY_SIZE) {
      break
    }
    offset += LIMIT
  }
  const out = {
    settings: {},
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
