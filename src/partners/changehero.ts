import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import {
  datelog,
  retryFetch,
  safeParseFloat,
  smartIsoDateFromTimestamp
} from '../util'

const asChangeHeroStatus = asMaybe(asValue('finished', 'expired'), 'other')

const asChangeHeroTx = asObject({
  id: asString,
  status: asChangeHeroStatus,
  payinHash: asMaybe(asString, undefined),
  payoutHash: asMaybe(asString, undefined),
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

const asChangeHeroResult = asObject({
  result: asArray(asUnknown)
})

type ChangeHeroTx = ReturnType<typeof asChangeHeroTx>
type ChangeHeroStatus = ReturnType<typeof asChangeHeroStatus>

const API_URL = 'https://api.changehero.io/v2/'
const LIMIT = 100
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

const statusMap: { [key in ChangeHeroStatus]: Status } = {
  finished: 'complete',
  expired: 'expired',
  other: 'other'
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

      const params = {
        id: '',
        currency: '',
        payoutAddress: '',
        offset,
        limit: LIMIT
      }

      const response = await retryFetch(API_URL, {
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        method: 'POST',
        body: JSON.stringify({
          method: 'getTransactions',
          params
        })
      })

      if (!response.ok) {
        const text = await response.text()
        datelog(text)
        throw new Error(text)
      }

      const result = await response.json()

      const txs = asChangeHeroResult(result).result
      if (txs.length === 0) {
        datelog(`ChangeHero done at offset ${offset}`)
        break
      }
      for (const rawTx of txs) {
        let tx: ChangeHeroTx
        try {
          tx = asChangeHeroTx(rawTx)
        } catch (e) {
          console.log(e)
          throw e
        }
        const ssTx: StandardTx = {
          status: statusMap[tx.status],
          orderId: tx.id,
          depositTxid: tx.payinHash,
          depositAddress: tx.payinAddress,
          depositCurrency: tx.currencyFrom.toUpperCase(),
          depositAmount: safeParseFloat(tx.amountFrom),
          payoutTxid: tx.payoutHash,
          payoutAddress: tx.payoutAddress,
          payoutCurrency: tx.currencyTo.toUpperCase(),
          payoutAmount: safeParseFloat(tx.amountTo),
          timestamp: tx.createdAt,
          isoDate: smartIsoDateFromTimestamp(tx.createdAt).isoDate,
          usdValue: -1,
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
      datelog(`Changehero oldestIsoDate ${oldestIsoDate}`)
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
