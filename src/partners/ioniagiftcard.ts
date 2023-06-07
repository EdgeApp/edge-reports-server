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

const asIoniaStatus = asMaybe(asValue('complete'), 'other')

const asIoniaTx = asObject({
  Id: asNumber,
  CreatedDate: asString,
  GiftCardFaceValue: asNumber,
  USDPaidByCustomer: asNumber,
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

export const queryIonia = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const { settings, apiKeys } = asStandardPluginParams(pluginParams)
  const { apiKey } = apiKeys
  let { latestIsoDate } = settings

  if (apiKey == null) {
    return { settings: { latestIsoDate }, transactions: [] }
  }

  const ssFormatTxs: StandardTx[] = []
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
        let tx: IoniaTx
        try {
          tx = asIoniaTx(rawTx)
        } catch (e) {
          datelog(e)
          throw e
        }
        if (tx.MerchantName === 'Visa eReward Card') {
          continue
        }
        const { isoDate, timestamp } = smartIsoDateFromTimestamp(tx.CreatedDate)
        const ssTx: StandardTx = {
          status: statusMap.complete,
          orderId: tx.Id.toString(),
          depositTxid: undefined,
          depositAddress: undefined,
          depositCurrency: 'USD',
          depositAmount: tx.USDPaidByCustomer,
          payoutTxid: undefined,
          payoutAddress: undefined,
          payoutCurrency: 'USD',
          payoutAmount: tx.GiftCardFaceValue,
          timestamp,
          isoDate,
          usdValue: tx.GiftCardFaceValue,
          rawTx
        }
        ssFormatTxs.push(ssTx)
        if (ssTx.isoDate > latestIsoDate) {
          latestIsoDate = ssTx.isoDate
        }
      }
      datelog(`IoniaGiftCards latestIsoDate ${latestIsoDate}`)
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
    transactions: ssFormatTxs
  }
  return out
}

export const ioniaGiftCards: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryIonia,
  // results in a PluginResult
  pluginName: 'Ionia Gift Cards',
  pluginId: 'ioniagiftcards'
}
