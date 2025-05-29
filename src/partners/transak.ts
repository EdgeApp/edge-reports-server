import {
  asArray,
  asBoolean,
  asEither,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import fetch from 'node-fetch'

import {
  FiatPaymentType,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx
} from '../types'
import { datelog } from '../util'

const PAGE_LIMIT = 100
const OFFSET_ROLLBACK = 500

const asTransakOrder = asObject({
  status: asString,
  id: asString,
  fromWalletAddress: asOptional(asEither(asBoolean, asString)),
  fiatCurrency: asString,
  fiatAmount: asNumber,
  isBuyOrSell: asString,
  walletAddress: asString,
  cryptoCurrency: asString,
  cryptoAmount: asNumber,
  completedAt: asString,
  paymentOptionId: asString
})

type TransakOrder = ReturnType<typeof asTransakOrder>

const asPreTransakOrder = asObject({
  status: asString
})

const asTransakResult = asObject({
  response: asArray(asUnknown)
})

export async function queryTransak(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const standardTxs: StandardTx[] = []
  let apiKey: string

  let { offset = 0 } = pluginParams.settings
  if (typeof pluginParams.apiKeys.transak_api_secret === 'string') {
    apiKey = pluginParams.apiKeys.transak_api_secret
  } else {
    return {
      settings: { offset },
      transactions: []
    }
  }

  let resultJSON
  let done = false

  while (!done) {
    const url = `https://api.transak.com/api/v2/partners/orders/?partnerAPISecret=${apiKey}&limit=${PAGE_LIMIT}&skip=${offset}`
    try {
      const result = await fetch(url)
      resultJSON = asTransakResult(await result.json())
    } catch (e) {
      datelog(e)
      break
    }
    const txs = resultJSON.response

    for (const rawTx of txs) {
      if (asPreTransakOrder(rawTx).status === 'COMPLETED') {
        const standardTx = processTransakTx(rawTx)
        standardTxs.push(standardTx)
      }
    }
    if (txs.length < PAGE_LIMIT) {
      done = true
    }
    offset += txs.length
  }
  offset -= OFFSET_ROLLBACK
  offset = offset > 0 ? offset : 0

  const out: PluginResult = {
    settings: { offset },
    transactions: standardTxs
  }
  return out
}

export const transak: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryTransak,
  // results in a PluginResult
  pluginName: 'Transak',
  pluginId: 'transak'
}

export function processTransakTx(rawTx: unknown): StandardTx {
  const tx: TransakOrder = asTransakOrder(rawTx)
  const date = new Date(tx.completedAt)
  const depositAddress =
    typeof tx.fromWalletAddress === 'string' ? tx.fromWalletAddress : undefined

  const direction =
    tx.isBuyOrSell === 'BUY'
      ? 'buy'
      : tx.isBuyOrSell === 'SELL'
      ? 'sell'
      : undefined

  if (direction == null) {
    throw new Error(`Unexpected isBuyOrSell '${tx.isBuyOrSell}' for ${tx.id}`)
  }

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,
    countryCode: null,
    depositTxid: undefined,
    depositAddress,
    depositCurrency: tx.fiatCurrency,
    depositAmount: tx.fiatAmount,
    direction,
    exchangeType: 'fiat',
    paymentType: getFiatPaymentType(tx),
    payoutTxid: undefined,
    payoutAddress: tx.walletAddress,
    payoutCurrency: tx.cryptoCurrency,
    payoutAmount: tx.cryptoAmount,
    timestamp: date.getTime() / 1000,
    isoDate: date.toISOString(),
    usdValue: -1,
    rawTx
  }
  return standardTx
}

function getFiatPaymentType(tx: TransakOrder): FiatPaymentType | null {
  switch (tx.paymentOptionId) {
    case 'mobikwik_wallet':
      return 'mobikwik'
    case 'neft_bank_transfer':
      return 'neft'
    case 'upi':
      return 'upi'
    default:
      throw new Error(
        `Unknown payment method: ${tx.paymentOptionId} for ${tx.id}`
      )
  }
}
