import { asArray, asNumber, asObject, asString, asUnknown } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asBogTx = asObject({
  attributes: asObject({
    coin_type: asString,
    coin_amount: asNumber,
    fiat_type: asString,
    fiat_amount: asNumber,
    timestamp: asString
  }),
  type: asString,
  id: asString
})

const asBogResult = asObject({
  data: asArray(asUnknown)
})

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

export async function queryBitsOfGold(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey = ''
  let previousDate = '2019-01-01T00:00:00.000Z'
  if (typeof pluginParams.settings.previousSearchedDate === 'string') {
    previousDate = pluginParams.settings.previousSearchedDate
  }
  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: {
        previousSearchedDate: previousDate
      },
      transactions: []
    }
  }

  const millisecondPreviousSearchedDate =
    new Date(previousDate).getTime() - QUERY_LOOKBACK
  const startDate = new Date(millisecondPreviousSearchedDate)
  const endDate = new Date(Date.now())
  const formattedStartDate = `${startDate.getDate()}-${startDate.getMonth() +
    1}-${startDate.getFullYear()}`
  const formattedEndDate = `${endDate.getDate()}-${endDate.getMonth() +
    1}-${endDate.getFullYear()}`
  const url = `http://webapi.bitsofgold.co.il/v1/sells/by_provider/?provider=${pluginParams.apiKeys.apiKey}&filter%5Bcreated_at_gteq%5D=%27${formattedStartDate}%27&filter%5Bcreated_at_lt%5D=%27${formattedEndDate}`
  const headers = {
    'x-api-key': apiKey
  }

  let resultJSON
  try {
    const result = await fetch(url, { method: 'GET', headers: headers })
    resultJSON = asBogResult(await result.json())
  } catch (e) {
    datelog(e)
    throw e
  }
  const txs = resultJSON.data
  let latestTimeStamp = startDate.getTime()
  for (const rawtx of txs) {
    const tx = asBogTx(rawtx)
    const data = tx.attributes
    const date = new Date(data.timestamp)
    const timestamp = date.getTime()

    let [depositCurrency, depositAmount, payoutCurrency, payoutAmount] = [
      data.coin_type,
      data.coin_amount,
      data.fiat_type,
      data.fiat_amount
    ]
    if (tx.type.toLowerCase() === 'buy') {
      depositCurrency = data.fiat_type
      depositAmount = data.fiat_amount
      payoutCurrency = data.coin_type
      payoutAmount = data.fiat_amount
    }

    const ssTx: StandardTx = {
      status: 'complete',
      orderId: tx.id,
      depositTxid: undefined,
      depositAddress: undefined,
      depositCurrency,
      depositAmount,
      payoutTxid: undefined,
      payoutAddress: undefined,
      payoutCurrency,
      payoutAmount,
      timestamp: timestamp / 1000,
      isoDate: date.toISOString(),
      usdValue: undefined,
      rawTx: rawtx
    }
    latestTimeStamp = latestTimeStamp > timestamp ? latestTimeStamp : timestamp
    ssFormatTxs.push(ssTx)
  }

  return {
    settings: { previousSearchedDate: new Date(latestTimeStamp) },
    transactions: ssFormatTxs
  }
}

export const bitsofgold: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryBitsOfGold,
  // results in a PluginResult
  pluginName: 'BitsOfGold',
  pluginId: 'bitsofgold'
}
