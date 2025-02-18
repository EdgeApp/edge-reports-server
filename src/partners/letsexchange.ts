import {
  asArray,
  asMaybe,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  EDGE_APP_START_DATE,
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

export const asLetsExchangePluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, EDGE_APP_START_DATE)
  }),
  apiKeys: asObject({
    affiliateId: asOptional(asString),
    apiKey: asOptional(asString)
  })
})

const asLetsExchangeStatus = asMaybe(
  asValue(
    'success',
    'wait',
    'overdue',
    'refund',
    'exchanging',
    'sending_confirmation',
    'other'
  ),
  'other'
)

const asLetsExchangeTx = asObject({
  status: asLetsExchangeStatus,
  transaction_id: asString,
  hash_in: asMaybe(asString, ''),
  deposit: asString,
  coin_from: asString,
  deposit_amount: asString,
  withdrawal: asString,
  coin_to: asString,
  withdrawal_amount: asString,
  created_at: asString
})

const asLetsExchangeResult = asObject({
  data: asArray(asUnknown)
})

type LetsExchangeTx = ReturnType<typeof asLetsExchangeTx>
type LetsExchangeStatus = ReturnType<typeof asLetsExchangeStatus>

const LIMIT = 100
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days
const statusMap: { [key in LetsExchangeStatus]: Status } = {
  success: 'complete',
  wait: 'pending',
  overdue: 'expired',
  refund: 'refunded',
  exchanging: 'processing',
  sending_confirmation: 'other',
  other: 'other'
}

export async function queryLetsExchange(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { settings, apiKeys } = asLetsExchangePluginParams(pluginParams)
  const { affiliateId, apiKey } = apiKeys
  let { latestIsoDate } = settings
  // let latestIsoDate = '2023-01-04T19:36:46.000Z'

  if (apiKey == null || affiliateId == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()
  let oldestIsoDate = '999999999999999999999999999999999999'

  let page = 0
  let done = false
  const headers = {
    Authorization: 'Bearer ' + apiKey
  }

  try {
    while (!done) {
      const url = `https://api.letsexchange.io/api/v1/affiliate/history/${affiliateId}?limit=${LIMIT}&page=${page}&types=0`

      const result = await retryFetch(url, { headers, method: 'GET' })
      if (!result.ok) {
        const text = await result.text()
        datelog(text)
        throw new Error(text)
      }
      const resultJSON = await result.json()
      const { data: txs } = asLetsExchangeResult(resultJSON)

      for (const rawTx of txs) {
        const standardTx = processLetsExchangeTx(rawTx)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < oldestIsoDate) {
          oldestIsoDate = standardTx.isoDate
        }
        if (standardTx.isoDate < previousLatestIsoDate && !done) {
          datelog(
            `Godex done: date ${standardTx.isoDate} < ${previousLatestIsoDate}`
          )
          done = true
        }
      }
      datelog(`letsexchange oldestIsoDate ${oldestIsoDate}`)

      page++
      // this is if the end of the database is reached
      if (txs.length < LIMIT) {
        done = true
      }
    }
  } catch (e) {
    datelog(e)
    throw e
  }

  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}
export const letsexchange: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryLetsExchange,
  // results in a PluginResult
  pluginName: 'LetsExchange',
  pluginId: 'letsexchange'
}

export function processLetsExchangeTx(rawTx: unknown): StandardTx {
  const tx: LetsExchangeTx = asLetsExchangeTx(rawTx)
  const ts = parseInt(tx.created_at)
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(ts)
  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.transaction_id,
    countryCode: null,
    depositTxid: tx.hash_in,
    depositAddress: tx.deposit,
    depositCurrency: tx.coin_from.toUpperCase(),
    depositAmount: safeParseFloat(tx.deposit_amount),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: undefined,
    payoutAddress: tx.withdrawal,
    payoutCurrency: tx.coin_to.toUpperCase(),
    payoutAmount: safeParseFloat(tx.withdrawal_amount),
    timestamp,
    isoDate,
    usdValue: -1,
    rawTx
  }
  return standardTx
}
