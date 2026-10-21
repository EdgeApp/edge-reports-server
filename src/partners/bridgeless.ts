import { div } from 'biggystring'
import {
  asArray,
  asBoolean,
  asEither,
  asMaybe,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString
} from 'cleaners'
import fetch from 'node-fetch'

import {
  PartnerPlugin,
  PluginParams,
  PluginResult,
  StandardTx,
  Status
} from '../types'
import { createTokenId, EdgeTokenId, tokenTypes } from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

/**
 * Fetches a URL and returns the parsed JSON body, throwing on a non-2xx
 * status. Injectable so tests can serve canned chain responses.
 */
export type FetchBridgelessJson = (url: string) => Promise<unknown>

/** The key of one bridge deposit, as the bridge module stores it */
export interface BridgeKey {
  chainId: string
  txHash: string
  txIndex: string
}

interface SubmittedDeposit extends BridgeKey {
  referralId: number
}

interface BridgeToken {
  currencyCode: string
  decimals: number
}

/** Bridge tokens keyed by `${chainId}:${lowercase address}` */
export type BridgeTokens = Map<string, BridgeToken>

// Tendermint RPC on an archive node: tx_search over the full tx index
const RPC_URL = 'https://rpc.node0.mainnet.bridgeless.com'
// Cosmos LCD: bridge module state
const LCD_URL = 'https://rpc-api.node0.mainnet.bridgeless.com'

// Edge's referral id, BRIDGELESS_INIT.referralId in edge-react-gui
const EDGE_REFERRAL_ID = 2

// Height 6,400,000 was produced on 2026-06-20, before Edge's referral id
// shipped on 2026-07-07, so a scan from here sees every Edge order.
const START_HEIGHT = 6400000

const SUBMIT_ACTION = '/core.bridge.MsgSubmitTransactions'
const PAGE_SIZE = 100

// Height windows grow while the scan is sparse and shrink when the node times
// out or a window holds more transactions than is sensible to page through.
const MAX_WINDOW = 200000
const MIN_WINDOW = 1000
const MAX_WINDOW_TXS = 1000
const MAX_WINDOW_FAILURES = 3

// Stop scanning in time to refresh unfinished orders and save progress well
// inside the query engine's per-plugin timeout. The next run resumes the scan.
const SCAN_BUDGET_MS = 1000 * 60 * 3
// Orders not dated or re-read by then wait for the next run, leaving room for
// one last request to time out before the query engine's 5 minutes run out
const RUN_BUDGET_MS = 1000 * 60 * 3.5

// An order with no payout after this long stops being re-read every run
const PENDING_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90

const REQUEST_TIMEOUT_MS = 1000 * 60

// The bridge stores a chain's native coin under the zero address
const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * Bridgeless chain id -> Edge currency pluginId. Mirrors
 * EDGE_PLUGINID_CHAINID_MAP in edge-exchange-plugins, plus base, which the
 * bridge supports but Edge does not route yet.
 */
const BRIDGELESS_CHAINS: Record<string, string> = {
  '0': 'bitcoin',
  '1': 'ethereum',
  '2': 'zano',
  '3': 'ton',
  '4': 'solana',
  '5': 'bitcoincash',
  '56': 'binancesmartchain',
  '8453': 'base'
}

const asPendingOrder = asObject({
  chainId: asString,
  txHash: asString,
  txIndex: asString,
  // Block time of the transaction that recorded the deposit on Bridgeless
  isoDate: asString
})

const asBridgelessSettings = asObject({
  // Every height below this has been scanned
  latestHeight: asOptional(asNumber, START_HEIGHT),
  // Edge orders seen on chain but not yet paid out, keyed by orderId
  pendingOrders: asOptional(asObject(asPendingOrder))
})

const asStatusResponse = asObject({
  result: asObject({
    sync_info: asObject({ latest_block_height: asString })
  })
})

const asTxSearchResponse = asObject({
  result: asObject({
    txs: asArray(
      asObject({
        height: asString,
        hash: asString,
        tx_result: asObject({ code: asNumber }),
        // Base64 protobuf TxRaw
        tx: asString
      })
    ),
    total_count: asString
  })
})

const asBlockchainResponse = asObject({
  result: asObject({
    block_metas: asArray(
      asObject({ header: asObject({ height: asString, time: asString }) })
    )
  })
})

const asTokensResponse = asObject({
  tokens: asArray(
    asObject({
      metadata: asObject({ symbol: asString }),
      info: asArray(
        asObject({ address: asString, chain_id: asString, decimals: asString })
      )
    })
  ),
  pagination: asMaybe(
    asObject({ next_key: asOptional(asEither(asString, asNull)) })
  )
})

/** A bridge transaction record, as GET /cosmos/bridge/transactions returns it */
const asBridgeTransaction = asObject({
  deposit_chain_id: asString,
  deposit_tx_hash: asString,
  deposit_tx_index: asString,
  deposit_token: asString,
  // Integer amounts in each token's smallest unit
  deposit_amount: asString,
  depositor: asOptional(asString),
  receiver: asString,
  withdrawal_chain_id: asString,
  withdrawal_tx_hash: asOptional(asString, ''),
  withdrawal_token: asString,
  withdrawal_amount: asString,
  // Set once the bridge signers approve a payout the user claims themselves
  signature: asOptional(asString, ''),
  is_wrapped: asOptional(asBoolean),
  referral_id: asOptional(asNumber)
})

const asBridgeTransactionResponse = asObject({
  transaction: asBridgeTransaction
})

type PendingOrder = ReturnType<typeof asPendingOrder>
type BridgeTransaction = ReturnType<typeof asBridgeTransaction>

interface ScanResult {
  deposits: Array<SubmittedDeposit & { height: number }>
  // Every height below this was read in full
  scannedTo: number
}

/**
 * Bridgeless has no partner reporting API, so this reads the Bridgeless chain
 * itself. Every bridge deposit is recorded there by a
 * MsgSubmitTransactions transaction carrying the deposit's referral id, which
 * the chain's tx index can find by height but not filter by referral. The scan
 * walks heights from the last run's progress, decodes each transaction and
 * keeps Edge's deposits. Each one is dated by its block and then read from the
 * bridge module's state, which holds the payout once it lands. Orders without
 * a payout are re-read every run until they finish.
 */
export const queryBridgeless = async (
  pluginParams: PluginParams,
  fetchJson: FetchBridgelessJson = defaultFetchJson
): Promise<PluginResult> => {
  const { log } = pluginParams
  const runStart = Date.now()
  const settings = asBridgelessSettings(pluginParams.settings)
  const pendingOrders: Record<string, PendingOrder> = {
    ...settings.pendingOrders
  }

  const latestBlock = asStatusResponse(await fetchJson(`${RPC_URL}/status`))
  // The newest block is left for the next run, so its txs are surely indexed
  const endHeight = Number(latestBlock.result.sync_info.latest_block_height)

  const scan = await scanSubmittedDeposits(
    settings.latestHeight,
    endHeight,
    fetchJson,
    pluginParams
  )

  // Date newly found orders now: the block time is all the scan knows them by
  for (const deposit of scan.deposits) {
    const orderId = makeOrderId(deposit)
    if (pendingOrders[orderId] != null) continue
    if (Date.now() - runStart > RUN_BUDGET_MS) {
      scan.scannedTo = Math.min(scan.scannedTo, deposit.height)
      continue
    }
    try {
      const isoDate = await fetchBlockTime(deposit.height, fetchJson)
      pendingOrders[orderId] = {
        chainId: deposit.chainId,
        txHash: deposit.txHash,
        txIndex: deposit.txIndex,
        isoDate
      }
    } catch (e) {
      log.error(
        `Bridgeless: cannot date order ${orderId} at height ${
          deposit.height
        }, progress is held: ${String(e)}`
      )
      scan.scannedTo = Math.min(scan.scannedTo, deposit.height)
    }
  }

  const transactions: StandardTx[] = []
  const stillPending: Record<string, PendingOrder> = {}
  let tokens: BridgeTokens | undefined
  if (Object.keys(pendingOrders).length > 0) {
    try {
      tokens = await fetchBridgeTokens(fetchJson)
    } catch (error) {
      log.error(
        `Bridgeless: cannot read the bridge token list, orders are re-read next run: ${String(
          error
        )}`
      )
    }
  }
  for (const orderId of Object.keys(pendingOrders)) {
    const pending = pendingOrders[orderId]
    if (tokens == null || Date.now() - runStart > RUN_BUDGET_MS) {
      stillPending[orderId] = pending
      continue
    }
    try {
      const response = asBridgeTransactionResponse(
        await fetchJson(
          `${LCD_URL}/cosmos/bridge/transactions/${pending.chainId}/${pending.txHash}/${pending.txIndex}`
        )
      )
      const standardTx = processBridgelessTx(
        response.transaction,
        pending.isoDate,
        tokens
      )
      transactions.push(standardTx)
      if (standardTx.status === 'complete') continue
    } catch (e) {
      log.error(
        `Bridgeless: cannot read order ${orderId}, retrying next run: ${String(
          e
        )}`
      )
    }

    const age = Date.now() - new Date(pending.isoDate).getTime()
    if (age > PENDING_MAX_AGE_MS) {
      log.warn(
        `Bridgeless: order ${orderId} from ${pending.isoDate} has no payout after 90 days and is no longer re-read`
      )
      continue
    }
    stillPending[orderId] = pending
  }

  return {
    settings: { latestHeight: scan.scannedTo, pendingOrders: stillPending },
    transactions
  }
}

export const bridgeless: PartnerPlugin = {
  queryFunc: async pluginParams => await queryBridgeless(pluginParams),
  pluginName: 'Bridgeless',
  pluginId: 'bridgeless'
}

/**
 * Walks heights [startHeight, endHeight) window by window and returns Edge's
 * deposits along with how far the walk got. Progress only covers windows read
 * in full, so a failure or the time budget leaves the rest for the next run.
 */
async function scanSubmittedDeposits(
  startHeight: number,
  endHeight: number,
  fetchJson: FetchBridgelessJson,
  pluginParams: PluginParams
): Promise<ScanResult> {
  const { log } = pluginParams
  const scanStart = Date.now()
  const deposits: ScanResult['deposits'] = []
  let scannedTo = startHeight
  let window = MAX_WINDOW
  let failures = 0

  while (scannedTo < endHeight) {
    if (Date.now() - scanStart > SCAN_BUDGET_MS) {
      log.warn(
        `Bridgeless: scan budget spent at height ${scannedTo} of ${endHeight}, resuming next run`
      )
      break
    }
    const windowEnd = Math.min(scannedTo + window, endHeight)
    const span = windowEnd - scannedTo
    try {
      // A window already at the floor is paged through however dense it is
      const found = await readWindow(
        scannedTo,
        windowEnd,
        fetchJson,
        log,
        span <= MIN_WINDOW
      )
      if (found == null) {
        window = Math.max(MIN_WINDOW, Math.floor(span / 2))
        continue
      }
      deposits.push(...found)
      scannedTo = windowEnd
      window = Math.min(MAX_WINDOW, window * 2)
      failures = 0
    } catch (e) {
      if (span > MIN_WINDOW) {
        window = Math.max(MIN_WINDOW, Math.floor(span / 2))
        continue
      }
      failures++
      log.error(
        `Bridgeless: reading heights ${scannedTo} to ${windowEnd} failed: ${String(
          e
        )}`
      )
      if (failures >= MAX_WINDOW_FAILURES) {
        log.error(
          `Bridgeless: scan stopped at height ${scannedTo}, resuming next run`
        )
        break
      }
    }
  }
  return { deposits, scannedTo }
}

/**
 * Reads every MsgSubmitTransactions transaction in [fromHeight, toHeight) and
 * returns the Edge deposits among them, or undefined when the window holds
 * more transactions than MAX_WINDOW_TXS and should be split instead.
 */
async function readWindow(
  fromHeight: number,
  toHeight: number,
  fetchJson: FetchBridgelessJson,
  log: PluginParams['log'],
  readAll: boolean = false
): Promise<Array<SubmittedDeposit & { height: number }> | undefined> {
  const deposits: Array<SubmittedDeposit & { height: number }> = []
  const query = `message.action='${SUBMIT_ACTION}' AND tx.height>=${fromHeight} AND tx.height<${toHeight}`
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      query: `"${query}"`,
      page: String(page),
      per_page: String(PAGE_SIZE),
      order_by: '"asc"'
    })
    const response = asTxSearchResponse(
      await fetchJson(`${RPC_URL}/tx_search?${params.toString()}`)
    )
    const totalCount = Number(response.result.total_count)
    if (!readAll && totalCount > MAX_WINDOW_TXS) return undefined

    for (const tx of response.result.txs) {
      // A failed transaction changed no bridge state
      if (tx.tx_result.code !== 0) continue
      // Skipping one bad tx beats a scan stuck at its height forever
      let submitted: SubmittedDeposit[]
      try {
        submitted = decodeSubmittedDeposits(tx.tx)
      } catch (error) {
        log.error(
          `Bridgeless: skipping undecodable tx ${tx.hash} at height ${
            tx.height
          }: ${String(error)}`
        )
        continue
      }
      for (const deposit of submitted) {
        if (deposit.referralId !== EDGE_REFERRAL_ID) continue
        deposits.push({ ...deposit, height: Number(tx.height) })
      }
    }
    if (page * PAGE_SIZE >= totalCount || response.result.txs.length === 0) {
      return deposits
    }
  }
}

/**
 * Converts a bridge transaction record into a StandardTx. The record has no
 * time of its own, so `isoDate` is the block time of the transaction that
 * recorded the deposit on Bridgeless.
 */
export function processBridgelessTx(
  rawTx: BridgeTransaction,
  isoDate: string,
  tokens: BridgeTokens
): StandardTx {
  const date = new Date(isoDate)
  if (isNaN(date.getTime())) throw new Error(`Bad date ${isoDate}`)

  const deposit = getAsset(rawTx.deposit_chain_id, rawTx.deposit_token, tokens)
  const payout = getAsset(
    rawTx.withdrawal_chain_id,
    rawTx.withdrawal_token,
    tokens
  )

  let status: Status = 'processing'
  if (rawTx.withdrawal_tx_hash !== '') status = 'complete'
  else if (rawTx.signature !== '') status = 'withdrawing'

  return {
    status,
    orderId: makeOrderId({
      chainId: rawTx.deposit_chain_id,
      txHash: rawTx.deposit_tx_hash,
      txIndex: rawTx.deposit_tx_index
    }),
    countryCode: null,

    depositTxid: formatTxid(rawTx.deposit_tx_hash, deposit.chainPluginId),
    depositAddress: undefined,
    depositCurrency: deposit.currencyCode,
    depositChainPluginId: deposit.chainPluginId,
    depositEvmChainId: deposit.evmChainId,
    depositTokenId: deposit.tokenId,
    depositAmount: Number(
      div(rawTx.deposit_amount, `1${'0'.repeat(deposit.decimals)}`, 18)
    ),

    direction: null,
    exchangeType: 'swap',
    paymentType: null,

    payoutTxid:
      rawTx.withdrawal_tx_hash !== ''
        ? formatTxid(rawTx.withdrawal_tx_hash, payout.chainPluginId)
        : undefined,
    payoutAddress: rawTx.receiver,
    payoutCurrency: payout.currencyCode,
    payoutChainPluginId: payout.chainPluginId,
    payoutEvmChainId: payout.evmChainId,
    payoutTokenId: payout.tokenId,
    payoutAmount: Number(
      div(rawTx.withdrawal_amount, `1${'0'.repeat(payout.decimals)}`, 18)
    ),

    timestamp: date.getTime() / 1000,
    isoDate: date.toISOString(),

    // Filled in by the rates engine once the order completes
    usdValue: -1,

    rawTx
  }
}

/**
 * Decodes a base64 protobuf TxRaw and returns the deposits recorded by its
 * MsgSubmitTransactions messages. Field numbers are from
 * cosmos/tx/v1beta1/tx.proto and Bridgeless-Project/bridgeless-core
 * proto/bridge (tx.proto, models/transaction.proto).
 */
export function decodeSubmittedDeposits(txBase64: string): SubmittedDeposit[] {
  const deposits: SubmittedDeposit[] = []
  const txRaw = Buffer.from(txBase64, 'base64')
  // TxRaw.body_bytes = 1
  const body = getBytes(txRaw, 1)[0]
  if (body == null) return deposits
  // TxBody.messages = 1, each an Any { type_url = 1, value = 2 }
  for (const message of getBytes(body, 1)) {
    const typeUrl = getBytes(message, 1)[0]?.toString('utf8')
    if (typeUrl !== SUBMIT_ACTION) continue
    const value = getBytes(message, 2)[0]
    if (value == null) continue
    // MsgSubmitTransactions.transactions = 2
    for (const transaction of getBytes(value, 2)) {
      const fields = readFields(transaction)
      deposits.push({
        chainId: fieldString(fields, 1),
        txHash: fieldString(fields, 2),
        txIndex: fieldVarint(fields, 3).toString(),
        referralId: Number(fieldVarint(fields, 17))
      })
    }
  }
  return deposits
}

export function makeOrderId(key: BridgeKey): string {
  // Matches the orderId edge-exchange-plugins gives the swap
  return `${key.chainId}/${key.txHash}/${key.txIndex}`
}

async function fetchBlockTime(
  height: number,
  fetchJson: FetchBridgelessJson
): Promise<string> {
  const response = asBlockchainResponse(
    await fetchJson(
      `${RPC_URL}/blockchain?minHeight=${height}&maxHeight=${height}`
    )
  )
  const meta = response.result.block_metas[0]
  if (meta == null) throw new Error(`No header for height ${height}`)
  return meta.header.time
}

async function fetchBridgeTokens(
  fetchJson: FetchBridgelessJson
): Promise<BridgeTokens> {
  const tokens: BridgeTokens = new Map()
  let nextKey: string | null | undefined
  do {
    const params = new URLSearchParams({ 'pagination.limit': '1000' })
    if (nextKey != null) params.set('pagination.key', nextKey)
    const response = asTokensResponse(
      await fetchJson(`${LCD_URL}/cosmos/bridge/tokens?${params.toString()}`)
    )
    for (const token of response.tokens) {
      for (const info of token.info) {
        tokens.set(tokenKey(info.chain_id, info.address), {
          currencyCode: token.metadata.symbol.toUpperCase(),
          decimals: Number(info.decimals)
        })
      }
    }
    nextKey = response.pagination?.next_key
  } while (nextKey != null && nextKey !== '')
  return tokens
}

const defaultFetchJson: FetchBridgelessJson = async url => {
  const response = await fetch(url, { timeout: REQUEST_TIMEOUT_MS })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Bridgeless error ${response.status}: ${text.slice(0, 200)}`
    )
  }
  return await response.json()
}

interface Asset extends BridgeToken {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

/**
 * Resolves a bridge chain and token to Edge's names. An unknown token throws,
 * since its amount cannot be scaled; an unknown chain only leaves the Edge
 * fields undefined.
 */
function getAsset(
  chainId: string,
  address: string,
  tokens: BridgeTokens
): Asset {
  const token = tokens.get(tokenKey(chainId, address))
  if (token == null) {
    throw new Error(`Unknown bridge token ${address} on chain ${chainId}`)
  }

  const chainPluginId = BRIDGELESS_CHAINS[chainId]
  if (chainPluginId == null) {
    return {
      ...token,
      chainPluginId,
      evmChainId: undefined,
      tokenId: undefined
    }
  }

  const tokenType = tokenTypes[chainPluginId]
  const evmChainId =
    tokenType === 'evm' ? EVM_CHAIN_IDS[chainPluginId] : undefined
  if (address.toLowerCase() === NATIVE_ADDRESS) {
    return { ...token, chainPluginId, evmChainId, tokenId: null }
  }
  // undefined, unlike null, means this server has no token id for the asset
  let tokenId: EdgeTokenId | undefined
  try {
    tokenId =
      tokenType === undefined
        ? undefined
        : createTokenId(tokenType, token.currencyCode, address)
  } catch (e) {
    tokenId = undefined
  }
  return { ...token, chainPluginId, evmChainId, tokenId }
}

function tokenKey(chainId: string, address: string): string {
  return `${chainId}:${address.toLowerCase()}`
}

/** The bridge 0x-prefixes every hash; only EVM chains write them that way */
function formatTxid(hash: string, chainPluginId: string | undefined): string {
  if (chainPluginId == null) return hash
  const isEvm = tokenTypes[chainPluginId] === 'evm'
  return isEvm || !hash.startsWith('0x') ? hash : hash.slice(2)
}

interface ProtoField {
  field: number
  varint?: bigint
  bytes?: Buffer
}

/** Reads the top-level fields of one protobuf message */
function readFields(buffer: Buffer): ProtoField[] {
  const fields: ProtoField[] = []
  let offset = 0
  const readVarint = (): bigint => {
    let result = BigInt(0)
    let shift = BigInt(0)
    while (true) {
      if (offset >= buffer.length) throw new Error('Truncated varint')
      const byte = buffer[offset++]
      result |= BigInt(byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return result
      shift += BigInt(7)
    }
  }
  while (offset < buffer.length) {
    const tag = Number(readVarint())
    const field = tag >>> 3
    const wireType = tag & 7
    switch (wireType) {
      case 0:
        fields.push({ field, varint: readVarint() })
        break
      case 1:
        offset += 8
        break
      case 2: {
        const length = Number(readVarint())
        if (offset + length > buffer.length) {
          throw new Error('Truncated length-delimited field')
        }
        fields.push({ field, bytes: buffer.subarray(offset, offset + length) })
        offset += length
        break
      }
      case 5:
        offset += 4
        break
      default:
        throw new Error(`Unsupported protobuf wire type ${wireType}`)
    }
  }
  return fields
}

function getBytes(buffer: Buffer, field: number): Buffer[] {
  const out: Buffer[] = []
  for (const entry of readFields(buffer)) {
    if (entry.field === field && entry.bytes != null) out.push(entry.bytes)
  }
  return out
}

function fieldString(fields: ProtoField[], field: number): string {
  const entry = fields.find(entry => entry.field === field)
  return entry?.bytes?.toString('utf8') ?? ''
}

// Proto3 leaves a zero scalar off the wire
function fieldVarint(fields: ProtoField[], field: number): bigint {
  const entry = fields.find(entry => entry.field === field)
  return entry?.varint ?? BigInt(0)
}
