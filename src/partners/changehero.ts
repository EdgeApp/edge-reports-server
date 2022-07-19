import axios from 'axios'
import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asChangeHeroTx = asObject({
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

const asChangeHeroRawTx = asObject({
  status: asString
})

const asChangeHeroResult = asObject({
  result: asArray(asUnknown)
})

const API_URL = 'https://api.changehero.io/v2/'
const MAX_ATTEMPTS = 3
const LIMIT = 300
const TIMEOUT = 20000
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days
const EMPTY_STRING = ''

async function getTransactionsPromised(
  apiKey: string,
  limit: number,
  offset: number,
  currencyFrom: string | undefined,
  address: string | undefined,
  extraId: string | undefined
): Promise<ReturnType<typeof asChangeHeroResult>> {
  let promise
  let attempt = 1
  while (true) {
    const changeHeroFetch = new Promise((resolve, reject) => {
      const params = {
        id: extraId === undefined ? EMPTY_STRING : extraId,
        currency: currencyFrom === undefined ? EMPTY_STRING : currencyFrom,
        payoutAddress: address === undefined ? EMPTY_STRING : address,
        offset: offset,
        limit: limit
      }

      axios
        .post(
          API_URL,
          {
            method: 'getTransactions',
            params: params
          },
          { headers: { 'api-key': apiKey } }
        )
        .then(res => {
          resolve(res)
        })
        .catch(err => {
          resolve(err.code)
        })
    })

    const timeoutTest = new Promise((resolve, reject) => {
      setTimeout(resolve, TIMEOUT, 'ETIMEDOUT')
    })

    promise = await Promise.race([changeHeroFetch, timeoutTest])
    if (promise === 'ETIMEDOUT' && attempt <= MAX_ATTEMPTS) {
      datelog(`ChangeHero request timed out.  Retry attempt: ${attempt}`)
      attempt++
      continue
    }
    break
  }
  return promise
}

export async function queryChangeHero(
  pluginParams: PluginParams
): Promise<PluginResult> {
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
  if (typeof pluginParams.apiKeys.changeHeroApiKey !== 'string') {
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
      datelog(`Query changeHero offset: ${offset}`)

      const result = await getTransactionsPromised(
        pluginParams.apiKeys.changeHeroApiKey,
        LIMIT,
        offset,
        undefined,
        undefined,
        undefined
      )

      const txs = asChangeHeroResult(result).result
      if (txs.length === 0) {
        datelog(`ChangeHero done at offset ${offset}`)
        firstAttempt = false
        break
      }
      for (const rawTx of txs) {
        if (asChangeHeroRawTx(rawTx).status === 'finished') {
          const tx = asChangeHeroTx(rawTx)
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
              `ChangeHero done: date ${tx.createdAt} < ${latestTimeStamp -
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

export const changehero: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryChangeHero,
  // results in a PluginResult
  pluginName: 'Changehero',
  pluginId: 'changehero'
}
