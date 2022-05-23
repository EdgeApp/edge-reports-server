import Criptointercambio from 'api-changelly/lib.js'
import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asCriptointercambioTx = asObject({
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

const asCriptointercambioResult = asObject({
  result: asArray(asUnknown)
})

const MAX_ATTEMPTS = 3
const LIMIT = 300
const TIMEOUT = 20000
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

async function getTransactionsPromised(
  criptointercambioSDK: any,
  limit: number,
  offset: number,
  currencyFrom: string | undefined,
  address: string | undefined,
  extraId: string | undefined
): Promise<ReturnType<typeof asCriptointercambioResult>> {
  let promise
  let attempt = 1
  while (true) {
    const criptointercambioFetch = new Promise((resolve, reject) => {
      criptointercambioSDK.getTransactions(
        limit,
        offset,
        currencyFrom,
        address,
        extraId,
        (err, data) => {
          if (err != null) {
            resolve(err.code)
          } else {
            resolve(data)
          }
        }
      )
    })

    const timeoutTest = new Promise((resolve, reject) => {
      setTimeout(resolve, TIMEOUT, 'ETIMEDOUT')
    })

    promise = await Promise.race([criptointercambioFetch, timeoutTest])
    if (promise === 'ETIMEDOUT' && attempt <= MAX_ATTEMPTS) {
      datelog(`Criptointercambio request timed out.  Retry attempt: ${attempt}`)
      attempt++
      continue
    }
    break
  }
  return promise
}

export async function queryCriptointercambio(
  pluginParams: PluginParams
): Promise<PluginResult> {
  let criptointercambioSDK
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
    criptointercambioSDK = new Criptointercambio(
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
      const txs = asCriptointercambioResult(result).result
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
            usdValue: undefined,
            rawTx
          }
          ssFormatTxs.push(ssTx)
          if (tx.createdAt > newLatestTimeStamp) {
            newLatestTimeStamp = tx.createdAt
          }
          if (
            tx.createdAt < latestTimeStamp - QUERY_LOOKBACK &&
            done === false &&
            firstAttempt === false
          ) {
            datelog(
              `Criptointercambio done: date ${tx.createdAt} < ${latestTimeStamp -
                QUERY_LOOKBACK}`
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
  const out = {
    settings: { latestTimeStamp: newLatestTimeStamp, firstAttempt, offset },
    transactions: ssFormatTxs
  }
  return out
}

export const criptointercambio: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryCriptointercambio,
  // results in a PluginResult
  pluginName: 'Criptointercambio',
  pluginId: 'criptointercambio'
}
