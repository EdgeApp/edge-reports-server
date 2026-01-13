import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'
import fetch from 'node-fetch'

import {
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { smartIsoDateFromTimestamp } from '../util'
import { EdgeTokenId } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

const asBitrefillStatus = asValue(
  'unpaid',
  'delivered',
  'sealed',
  'created',
  'permanent_failure',
  'refunded'
)

const asBitrefillTx = asObject({
  status: asBitrefillStatus,
  paymentReceived: asBoolean,
  expired: asBoolean,
  sent: asBoolean,
  invoiceTime: asNumber,
  btcPrice: asString,
  altcoinPrice: asOptional(asString),
  value: asString,
  currency: asString,
  country: asString,
  coinCurrency: asString,
  paymentMethod: asString,
  // receivedPaymentAltcoin: asOptional(asNumber),
  orderId: asString,
  usdPrice: asNumber
})

type BitrefillTx = ReturnType<typeof asBitrefillTx>
type BitrefillStatus = ReturnType<typeof asBitrefillStatus>
const statusMap: { [key in BitrefillStatus]: Status } = {
  unpaid: 'pending',
  created: 'pending',
  delivered: 'complete',
  refunded: 'refunded',
  permanent_failure: 'failed',
  sealed: 'complete'
}

const asBitrefillResult = asObject({
  nextUrl: asOptional(asString),
  orders: asArray(asUnknown)
})

const countryCodeMap: { [key: string]: string | null } = {
  argentina: 'AR',
  australia: 'AU',
  austria: 'AT',
  bangladesh: 'BD',
  belgium: 'BE',
  bolivia: 'BO',
  brazil: 'BR',
  canada: 'CA',
  chile: 'CL',
  china: 'CN',
  colombia: 'CO',
  'costa-rica': 'CR',
  'czech-republic': 'CZ',
  denmark: 'DK',
  'dominican-republic': 'DO',
  ecuador: 'EC',
  egypt: 'EG',
  'el-salvador': 'SV',
  finland: 'FI',
  france: 'FR',
  germany: 'DE',
  ghana: 'GH',
  greece: 'GR',
  guatemala: 'GT',
  honduras: 'HN',
  'hong-kong': 'HK',
  hungary: 'HU',
  india: 'IN',
  indonesia: 'ID',
  ireland: 'IE',
  israel: 'IL',
  italy: 'IT',
  japan: 'JP',
  kenya: 'KE',
  malaysia: 'MY',
  mexico: 'MX',
  morocco: 'MA',
  netherlands: 'NL',
  'new-zealand': 'NZ',
  nicaragua: 'NI',
  nigeria: 'NG',
  norway: 'NO',
  pakistan: 'PK',
  panama: 'PA',
  paraguay: 'PY',
  peru: 'PE',
  philippines: 'PH',
  poland: 'PL',
  portugal: 'PT',
  romania: 'RO',
  russia: 'RU',
  'saudi-arabia': 'SA',
  singapore: 'SG',
  'south-africa': 'ZA',
  'south-korea': 'KR',
  spain: 'ES',
  sweden: 'SE',
  switzerland: 'CH',
  taiwan: 'TW',
  thailand: 'TH',
  turkey: 'TR',
  ukraine: 'UA',
  'united-arab-emirates': 'AE',
  'united-kingdom': 'GB',
  uruguay: 'UY',
  usa: 'US',
  venezuela: 'VE',
  vietnam: 'VN',
  eu: 'EU',
  international: null
}

const paymentMethodMap: {
  [key: string]: {
    pluginId: string
    tokenId: EdgeTokenId
    currencyCode: string
  }
} = {
  bitcoin: { pluginId: 'bitcoin', tokenId: null, currencyCode: 'BTC' },
  dash: { pluginId: 'dash', tokenId: null, currencyCode: 'DASH' },
  ethereum: { pluginId: 'ethereum', tokenId: null, currencyCode: 'ETH' },
  litecoin: { pluginId: 'litecoin', tokenId: null, currencyCode: 'LTC' },
  dogecoin: { pluginId: 'dogecoin', tokenId: null, currencyCode: 'DOGE' },
  usdc_erc20: {
    pluginId: 'ethereum',
    tokenId: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    currencyCode: 'USDC'
  },
  usdc_polygon: {
    pluginId: 'polygon',
    tokenId: '3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    currencyCode: 'USDC'
  },
  usdt_erc20: {
    pluginId: 'ethereum',
    tokenId: 'dac17f958d2ee523a2206206994597c13d831ec7',
    currencyCode: 'USDT'
  },
  usdt_trc20: {
    pluginId: 'tron',
    tokenId: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    currencyCode: 'USDT'
  }
}

export async function queryBitrefill(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  const MAX_ITERATIONS = 20
  let username = ''
  let password = ''
  if (
    typeof pluginParams.apiKeys.apiKey === 'string' &&
    typeof pluginParams.apiKeys.apiSecret === 'string'
  ) {
    username = pluginParams.apiKeys.apiKey
    password = pluginParams.apiKeys.apiSecret
  } else {
    return {
      settings: {},
      transactions: []
    }
  }
  const headers = {
    Authorization:
      'Basic ' + Buffer.from(username + ':' + password).toString('base64')
  }
  const standardTxs: StandardTx[] = []

  let url = `https://api.bitrefill.com/v1/orders/?limit=150`
  let count = 0
  while (true) {
    let jsonObj: ReturnType<typeof asBitrefillResult>
    try {
      const result = await fetch(url, {
        method: 'GET',
        headers
      })
      const json = await result.json()
      jsonObj = asBitrefillResult(json)
    } catch (e) {
      log.error(String(e))
      break
    }
    const txs = jsonObj.orders
    for (const rawTx of txs) {
      const standardTx = processBitrefillTx(rawTx, pluginParams)
      standardTxs.push(standardTx)
    }

    if (count > MAX_ITERATIONS) {
      break
    }

    if (jsonObj.nextUrl != null && typeof jsonObj.nextUrl === 'string') {
      url = jsonObj.nextUrl
    } else {
      break
    }
    count++
  }
  const out: PluginResult = {
    settings: {},
    transactions: standardTxs
  }
  return out
}

export const bitrefill: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryBitrefill,
  // results in a PluginResult
  pluginName: 'Bitrefill',
  pluginId: 'bitrefill'
}

export function processBitrefillTx(
  rawTx: unknown,
  pluginParams: PluginParams
): StandardTx {
  const { log } = pluginParams
  let tx: BitrefillTx
  try {
    tx = asBitrefillTx(rawTx)
  } catch (e) {
    throw new Error(`${String(e)}: ${JSON.stringify(rawTx)}`)
  }
  const { isoDate } = smartIsoDateFromTimestamp(tx.invoiceTime)
  const countryCode = countryCodeMap[tx.country]

  if (tx.altcoinPrice != null) {
    log(
      `${tx.orderId}: ${isoDate} ${countryCode} ${tx.status} ${tx.paymentMethod} alt:${tx.altcoinPrice}`
    )
  } else {
    log(
      `${tx.orderId}: ${isoDate} ${countryCode} ${tx.status} ${tx.paymentMethod} btc:${tx.btcPrice}`
    )
  }
  const edgeAsset = paymentMethodMap[tx.paymentMethod]

  if (edgeAsset == null) {
    throw new Error(`${tx.orderId}: ${tx.paymentMethod} has no payment method`)
  }
  if (countryCode === undefined) {
    throw new Error(`${tx.orderId}: ${tx.country} has no country code`)
  }
  const evmChainId = EVM_CHAIN_IDS[edgeAsset.pluginId]

  const timestamp = tx.invoiceTime / 1000

  const { paymentMethod } = tx
  let depositAmountStr: string | undefined
  if (paymentMethod === 'bitcoin') {
    depositAmountStr = tx.btcPrice
  } else if (tx.altcoinPrice != null) {
    depositAmountStr = tx.altcoinPrice
  }
  if (depositAmountStr == null) {
    throw new Error(`Missing depositAmount for tx: ${tx.orderId}`)
  }
  const depositAmount = Number(depositAmountStr)
  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.orderId,
    countryCode,
    depositTxid: undefined,
    depositAddress: undefined,
    depositCurrency: edgeAsset.currencyCode,
    depositChainPluginId: edgeAsset.pluginId,
    depositEvmChainId: evmChainId,
    depositTokenId: edgeAsset.tokenId,
    depositAmount,
    direction: 'sell',
    exchangeType: 'fiat',
    paymentType: 'giftcard',
    payoutTxid: undefined,
    payoutAddress: undefined,
    payoutCurrency: tx.currency,
    payoutChainPluginId: undefined,
    payoutEvmChainId: undefined,
    payoutTokenId: undefined,
    payoutAmount: parseInt(tx.value),
    timestamp,
    isoDate,
    usdValue: tx.usdPrice,
    rawTx
  }

  return standardTx
}
