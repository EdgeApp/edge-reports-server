import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

import {
  asStandardPluginParams,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { datelog, retryFetch, smartIsoDateFromTimestamp, snooze } from '../util'
import { queryDummy } from './dummy'

const asIoniaStatus = asMaybe(asValue('complete'), 'other')

const asIoniaTx = asObject({
  Id: asNumber,
  CreatedDate: asString,
  GiftCardFaceValue: asNumber,
  USDPaidByCustomer: asNumber
})

const asPreIoniaTx = asObject({
  MerchantName: asString
})

const asIoniaResult = asObject({
  Data: asObject({
    Transactions: asArray(asUnknown)
  })
})

type IoniaTx = ReturnType<typeof asIoniaTx>
type IoniaStatus = ReturnType<typeof asIoniaStatus>

const MAX_RETRIES = 5
const LIMIT = 200
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

const statusMap: { [key in IoniaStatus]: Status } = {
  complete: 'complete',
  other: 'complete'
}

export const queryIoniaVisaRewards = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const standardTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestIsoDate = new Date(previousTimestamp).toISOString()
  const today = new Date().toISOString()

  let page = 1
  let retry = 0
  const url = `https://api.ionia.io/Reporting/${apiKey}/UserTransactions`
  while (true) {
    try {
      const response = await retryFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          PageNo: page,
          PageSize: LIMIT,
          StartDate: previousLatestIsoDate,
          EndDate: today
        })
      })
      if (!response.ok) {
        const text = await response.text()
        datelog(`Error in page:${page}`)
        throw new Error(text)
      }
      const result = await response.json()
      const txs = asIoniaResult(result).Data.Transactions

      for (const rawTx of txs) {
        if (asPreIoniaTx(rawTx).MerchantName !== 'Visa eReward Card') {
          continue
        }
        const standardTx = processIoniaVisaRewardsTx(rawTx)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
      }
      datelog(`IoniaVisaRewards latestIsoDate ${latestIsoDate}`)
      page++
      if (txs.length < LIMIT) {
        break
      }
      retry = 0
    } catch (e) {
      datelog(e)
      // Retry a few times with time delay to prevent throttling
      retry++
      if (retry <= MAX_RETRIES) {
        datelog(`Snoozing ${5 * retry}s`)
        await snooze(5000 * retry)
      } else {
        // We can safely save our progress since we go from oldest to newest.
        break
      }
    }
  }
  const out: PluginResult = {
    settings: { latestIsoDate },
    transactions: standardTxs
  }
  return out
}

export const ioniaVisaRewards: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryDummy,
  // results in a PluginResult
  pluginName: 'Ionia Visa Rewards',
  pluginId: 'ioniavisarewards'
}

export function processIoniaVisaRewardsTx(rawTx: unknown): StandardTx {
  const tx: IoniaTx = asIoniaTx(rawTx)
  const { isoDate, timestamp } = smartIsoDateFromTimestamp(tx.CreatedDate)
  const standardTx: StandardTx = {
    status: statusMap.complete,
    orderId: tx.Id.toString(),
    countryCode: null,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: 'USD',
    depositAmount: tx.USDPaidByCustomer,
    direction: 'sell',
    exchangeType: 'fiat',
    paymentType: null,
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency: 'USD',
    payoutAmount: tx.GiftCardFaceValue,
    timestamp,
    isoDate,
    usdValue: tx.GiftCardFaceValue,
    rawTx
  }
  return standardTx
}
