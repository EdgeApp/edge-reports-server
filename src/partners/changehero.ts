import axios from 'axios'
import {
  asArray,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog, smartIsoDateFromTimestamp } from '../util'

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

const asChangeHeroPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, '0')
  }),
  apiKeys: asObject({
    apiKey: asOptional(asString)
  })
})

const asChangeHeroRawTx = asObject({
  status: asString
})

const asChangeHeroResult = asObject({
  result: asArray(asUnknown)
})

const API_URL = 'https://api.changehero.io/v2/'
const MAX_ATTEMPTS = 3
const LIMIT = 100
const TIMEOUT = 20000
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
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
    const params = {
      id: extraId === undefined ? EMPTY_STRING : extraId,
      currency: currencyFrom === undefined ? EMPTY_STRING : currencyFrom,
      payoutAddress: address === undefined ? EMPTY_STRING : address,
      offset: offset,
      limit: limit
    }

    const changeHeroFetch = axios
      .post(
        API_URL,
        {
          method: 'getTransactions',
          params: params
        },
        { headers: { 'api-key': apiKey } }
      )
      .catch(err => err.code)

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
  const { settings, apiKeys } = asChangeHeroPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let offset = 0
  let { latestIsoDate } = settings

  if (typeof apiKey !== 'string') {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const ssFormatTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()

  try {
    let done = false
    while (!done) {
      let oldestIsoDate = '999999999999999999999999999999999999'
      datelog(`Query changeHero offset: ${offset}`)

      const response: any = await getTransactionsPromised(
        pluginParams.apiKeys.apiKey,
        LIMIT,
        offset,
        undefined,
        undefined,
        undefined
      )

      const txs = asChangeHeroResult(response.data).result
      if (txs.length === 0) {
        datelog(`ChangeHero done at offset ${offset}`)
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
            isoDate: smartIsoDateFromTimestamp(tx.createdAt).isoDate,
            usdValue: undefined,
            rawTx
          }
          ssFormatTxs.push(ssTx)
          if (ssTx.isoDate > latestIsoDate) {
            latestIsoDate = ssTx.isoDate
          }
          if (ssTx.isoDate < oldestIsoDate) {
            oldestIsoDate = ssTx.isoDate
          }
          if (ssTx.isoDate < previousLatestIsoDate && !done) {
            datelog(
              `ChangeHero done: date ${ssTx.isoDate} < ${previousLatestIsoDate}`
            )
            done = true
          }
        }
      }
      datelog(`oldestIsoDate ${oldestIsoDate}`)
      offset += LIMIT
    }
  } catch (e) {
    datelog(e)
  }
  const out = {
    settings: {
      latestIsoDate
    },
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
