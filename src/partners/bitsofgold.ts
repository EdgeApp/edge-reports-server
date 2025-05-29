import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asString,
  asUnknown,
  asValue
} from 'cleaners'
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

type BogResult = ReturnType<typeof asBogResult>
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

  let result: BogResult
  try {
    const response = await fetch(url, { method: 'GET', headers: headers })
    result = asBogResult(await response.json())
  } catch (e) {
    datelog(e)
    throw e
  }
  const txs = result.data
  let latestTimeStamp = startDate.getTime()
  for (const rawTx of txs) {
    const standardTx: StandardTx = processBitsOfGoldTx(rawTx)
    const timestamp = new Date(standardTx.isoDate).getTime()
    latestTimeStamp = latestTimeStamp > timestamp ? latestTimeStamp : timestamp
    ssFormatTxs.push(standardTx)
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

export function processBitsOfGoldTx(rawTx: unknown): StandardTx {
  const bogTx = asBogTx(rawTx)
  const data = bogTx.attributes
  const date = new Date(data.timestamp)
  const timestamp = date.getTime()

  let [depositCurrency, depositAmount, payoutCurrency, payoutAmount] = [
    data.coin_type,
    data.coin_amount,
    data.fiat_type,
    data.fiat_amount
  ]
  if (bogTx.type.toLowerCase() === 'buy') {
    depositCurrency = data.fiat_type
    depositAmount = data.fiat_amount
    payoutCurrency = data.coin_type
    payoutAmount = data.coin_amount
  }

  const direction = asMaybe(asValue('buy', 'sell'), undefined)(bogTx.type)

  if (direction == null) {
    throw new Error(`Invalid direction ${bogTx.type}`)
  }

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: bogTx.id,
    countryCode: null,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency,
    depositAmount,
    direction,
    exchangeType: 'fiat',
    paymentType: data.fiat_type === 'ILS' ? 'israelibank' : 'sepa',
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency,
    payoutAmount,
    timestamp: timestamp / 1000,
    isoDate: date.toISOString(),
    usdValue: -1,
    rawTx
  }

  return standardTx
}
