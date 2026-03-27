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
import fetch from 'node-fetch'
import { syncScrypt } from 'scrypt-js'

import {
  EDGE_APP_START_DATE,
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { datelog, safeParseFloat, snooze } from '../util'

const CHANGELLY_URL = 'https://api-relay.changelly.com/';

const SCRYPT_SALT = Uint8Array.from([
  0xb5, 0x86, 0x5f, 0xfb, 0x9f, 0xa7, 0xb3, 0xbf, 0xe4, 0xb2, 0x38, 0x4d,
  0x47, 0xce, 0x83, 0x1e, 0xe2, 0x2a, 0x4a, 0x9d, 0x5c, 0x34, 0xc7, 0xef,
  0x7d, 0x21, 0x46, 0x7c, 0xc7, 0x58, 0xf8, 0x1b
])
const SCRYPT_N = 16384
const SCRYPT_R = 1
const SCRYPT_P = 1
const SCRYPT_DKLEN = 32

function deriveUserId(username: string): string {
  const usernameBytes = Buffer.from(username, 'utf8')
  const derived = syncScrypt(
    usernameBytes,
    SCRYPT_SALT,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    SCRYPT_DKLEN
  )
  return Buffer.from(derived).toString('base64')
}

// #region Cleaners

const asChangellyPluginParams = asObject({
  settings: asObject({
    latestIsoDate: asOptional(asString, EDGE_APP_START_DATE)
  }),
  apiKeys: asObject({
    changellyUsername: asOptional(asString)
  })
})

const asChangellyStatus = asMaybe(
  asValue(
    'finished',
    'waiting',
    'confirming',
    'exchanging',
    'sending',
    'failed',
    'refunded',
    'expired'
  ),
  'other'
)

const asChangellyTx = asObject({
  id: asString,
  status: asChangellyStatus,
  payinHash: asOptional(asString),
  payoutHash: asOptional(asString),
  payinAddress: asOptional(asString),
  currencyFrom: asString,
  amountFrom: asString,
  payoutAddress: asOptional(asString),
  currencyTo: asString,
  amountTo: asString,
  createdAt: asNumber
})

const asChangellyRpcResult = asObject({
  result: asArray(asUnknown)
})

const asChangellyRpcError = asObject({
  error: asObject({
    code: asNumber,
    message: asString
  })
})

// #endregion

type ChangellyTx = ReturnType<typeof asChangellyTx>
type ChangellyStatus = ReturnType<typeof asChangellyStatus>

const statusMap: { [key in ChangellyStatus]: Status } = {
  finished: 'complete',
  waiting: 'pending',
  confirming: 'processing',
  exchanging: 'processing',
  sending: 'processing',
  failed: 'other',
  refunded: 'refunded',
  expired: 'expired',
  other: 'other'
}

const MAX_RETRIES = 5
const LIMIT = 50
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

async function changellyRpc(
  username: string,
  userId: string,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const ts = Date.now()
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: `${method}:${userId}`,
    method,
    params
  })

  const response = await fetch(CHANGELLY_URL, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth': Buffer.from(
        [username, userId, ts].join(':')
      ).toString('base64')
    }
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Changelly HTTP ${response.status}: ${text}`)
  }

  const json = await response.json()

  const maybeError = asMaybe(asChangellyRpcError)(json)
  if (maybeError != null) {
    throw new Error(
      `Changelly RPC error ${maybeError.error.code}: ${maybeError.error.message}`
    )
  }

  return json
}

export const queryChangelly = async (
  pluginParams: PluginParams
): Promise<PluginResult> => {
  const { settings, apiKeys } = asChangellyPluginParams(pluginParams)
  let { changellyUsername } = apiKeys
  let { latestIsoDate } = settings

  if (changellyUsername == null) {
    changellyUsername = 'edge-app';
    // return { settings: { latestIsoDate }, transactions: [] }
  }

  const userId = deriveUserId(changellyUsername)
  const standardTxs: StandardTx[] = []
  let previousTimestamp = new Date(latestIsoDate).getTime() - QUERY_LOOKBACK
  if (previousTimestamp < 0) previousTimestamp = 0
  const previousLatestTimestamp = Math.floor(previousTimestamp / 1000)

  let offset = 0
  let retry = 0
  while (true) {
    try {
      datelog(`Query changelly offset: ${offset}`)
      const result = await changellyRpc(
        changellyUsername,
        userId,
        'getTransactions',
        { limit: LIMIT, offset }
      )
      const txs = asChangellyRpcResult(result).result

      if (txs.length === 0) {
        datelog(`Changelly done at offset ${offset}`)
        break
      }

      let reachedLookback = false
      for (const rawTx of txs) {
        const standardTx = processChangellyTx(rawTx)
        standardTxs.push(standardTx)
        if (standardTx.isoDate > latestIsoDate) {
          latestIsoDate = standardTx.isoDate
        }
        if (standardTx.timestamp < previousLatestTimestamp) {
          reachedLookback = true
        }
      }

      if (reachedLookback) {
        datelog(`Changelly reached lookback at offset ${offset}`)
        break
      }

      offset += txs.length
      retry = 0
    } catch (e) {
      datelog(e)
      retry++
      if (retry <= MAX_RETRIES) {
        datelog(`Snoozing ${5 * retry}s`)
        await snooze(5000 * retry)
      } else {
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

export const changelly: PartnerPlugin = {
  queryFunc: queryChangelly,
  pluginName: 'Changelly',
  pluginId: 'changelly'
}

export function processChangellyTx(rawTx: unknown): StandardTx {
  const tx: ChangellyTx = asChangellyTx(rawTx)
  const date = new Date(tx.createdAt / 1000)
  const timestamp = tx.createdAt

  const standardTx: StandardTx = {
    status: statusMap[tx.status],
    orderId: tx.id,
    countryCode: null,
    depositTxid: tx.payinHash,
    depositAddress: tx.payinAddress,
    depositCurrency: tx.currencyFrom.toUpperCase(),
    depositChainPluginId: undefined,
    depositEvmChainId: undefined,
    depositTokenId: undefined,
    depositAmount: safeParseFloat(tx.amountFrom),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.payoutHash,
    payoutAddress: tx.payoutAddress,
    payoutCurrency: tx.currencyTo.toUpperCase(),
    payoutChainPluginId: undefined,
    payoutEvmChainId: undefined,
    payoutTokenId: undefined,
    payoutAmount: safeParseFloat(tx.amountTo),
    timestamp,
    isoDate: date.toISOString(),
    usdValue: -1,
    rawTx
  }

  return standardTx
}
