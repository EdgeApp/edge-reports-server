import { asArray, asNumber, asObject, asString } from 'cleaners'

import {
  CicTransaction,
  CriptointercambioClient,
  PartialCicTransaction
} from '../../util/cic-sdk'
import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asCriptointercambioTx = asObject<PartialCicTransaction>({
  id: asString,
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

const asCriptointercambioRawTx = asObject({
  status: asString
})

const asCriptointercambioResult = asArray(asCriptointercambioTx)

const MAX_ATTEMPTS = 3
const LIMIT = 300
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

async function getTransactionsPromised(
  criptointercambioSDK: CriptointercambioClient,
  limit: number,
  offset: number,
  currencyFrom: string | undefined,
  address: string | undefined,
  extraId: string | undefined
): Promise<CicTransaction[]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await criptointercambioSDK.getTransactions(
        limit,
        offset,
        currencyFrom,
        address,
        extraId
      )
    } catch (e) {
      if (attempt <= MAX_ATTEMPTS) {
        datelog(
          `Criptointercambio request have failed. Retry attempt: ${attempt} out of ${MAX_ATTEMPTS}`
        )
      } else {
        throw new Error(
          'Unable to fetch transactions data from Criptointercambio'
        )
      }
    }
  }
  // To avoid undefined casting of return result. We always expect to get into the "else" branch at the end
  throw new Error('Unable to fetch transactions data from Criptointercambio')
}

export async function queryCriptointercambio(
  pluginParams: PluginParams
): Promise<PluginResult> {
  let criptointercambioSDK: CriptointercambioClient
  let latestTimeStamp = 0
  let offset = 0
  let firstAttempt = false
  if (typeof pluginParams.settings.latestTimeStamp === 'number') {
    latestTimeStamp = pluginParams.settings.latestTimeStamp
  }
  if (
    typeof pluginParams.settings.firstAttempt === 'undefined' ||
    pluginParams.settings.firstAttempt === true
  ) {
    firstAttempt = true
  }
  if (
    typeof pluginParams.settings.offset === 'number' &&
    firstAttempt === true
  ) {
    offset = pluginParams.settings.offset
  }
  if (
    typeof pluginParams.apiKeys.criptointercambioApiKey === 'string' &&
    typeof pluginParams.apiKeys.criptointercambioApiSecret === 'string'
  ) {
    criptointercambioSDK = new CriptointercambioClient(
      pluginParams.apiKeys.criptointercambioApiKey,
      pluginParams.apiKeys.criptointercambioApiSecret
    )
  } else {
    return {
      settings: {
        latestTimeStamp: latestTimeStamp
      },
      transactions: []
    }
  }

  const ssFormatTxs: StandardTx[] = []
  let newLatestTimeStamp = latestTimeStamp
  let done = false
  try {
    while (!done) {
      datelog(`Query criptointercambio offset: ${offset}`)
      const result = await getTransactionsPromised(
        criptointercambioSDK,
        LIMIT,
        offset,
        undefined,
        undefined,
        undefined
      )
      const txs = asCriptointercambioResult(result)
      if (txs.length === 0) {
        datelog(`Criptointercambio done at offset ${offset}`)
        firstAttempt = false
        break
      }
      for (const rawTx of txs) {
        if (asCriptointercambioRawTx(rawTx).status === 'finished') {
          const tx = asCriptointercambioTx(rawTx)
          const ssTx: StandardTx = {
            status: 'complete',
            orderId: tx.id,
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
            usdValue: 0,
            rawTx
          }
          ssFormatTxs.push(ssTx)
          if (tx.createdAt > newLatestTimeStamp) {
            newLatestTimeStamp = tx.createdAt
          }
          if (
            tx.createdAt < latestTimeStamp - QUERY_LOOKBACK &&
            !done &&
            !firstAttempt
          ) {
            datelog(
              `Criptointercambio done: date ${
                tx.createdAt
              } < ${latestTimeStamp - QUERY_LOOKBACK}`
            )
            done = true
          }
        }
      }
      offset += LIMIT
    }
  } catch (e) {
    datelog(e)
  }
  return {
    settings: { latestTimeStamp: newLatestTimeStamp, firstAttempt, offset },
    transactions: ssFormatTxs
  }
}

export const criptointercambio: PartnerPlugin = {
  queryFunc: queryCriptointercambio,
  pluginName: 'Criptointercambio',
  pluginId: 'criptointercambio'
}
