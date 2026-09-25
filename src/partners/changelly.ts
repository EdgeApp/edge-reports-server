import Changelly from 'api-changelly/lib.js'
import {
  asArray,
  asEither,
  asMaybe,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'

import {
  PartnerPlugin,
  PluginParams,
  PluginResult,
  ScopedLog,
  StandardTx
} from '../types'
import { safeParseFloat } from '../util'
import {
  ChainNameToPluginIdMapping,
  createTokenId,
  EdgeTokenId,
  tokenTypes
} from '../util/asEdgeTokenId'
import { EVM_CHAIN_IDS } from '../util/chainIds'

// Map Changelly `blockchain` codes (getCurrenciesFull) to Edge pluginIds. This
// is the reverse of edge-exchange-plugins src/mappings/changelly.ts.
const CHANGELLY_BLOCKCHAIN_TO_PLUGIN_ID: ChainNameToPluginIdMapping = {
  algorand: 'algorand',
  arbitrum: 'arbitrum',
  arrr: 'piratechain',
  avaxc: 'avalanche',
  base: 'base',
  binance_smart_chain: 'binancesmartchain',
  bitcoin: 'bitcoin',
  bitcoin_cash: 'bitcoincash',
  bitcoin_gold: 'bitcoingold',
  bitcoin_sv: 'bitcoinsv',
  cardano: 'cardano',
  celo: 'celo',
  coreum: 'coreum',
  cosmos: 'cosmoshub',
  dash: 'dash',
  digibyte: 'digibyte',
  doge: 'dogecoin',
  eos: 'eos',
  ethereum: 'ethereum',
  ethereum_classic: 'ethereumclassic',
  ethereum_pow: 'ethereumpow',
  filecoin: 'filecoin',
  fio: 'fio',
  firo: 'zcoin',
  hedera: 'hedera',
  litecoin: 'litecoin',
  monero: 'monero',
  optimism: 'optimism',
  osmo: 'osmosis',
  pivx: 'pivx',
  polkadot: 'polkadot',
  polygon: 'polygon',
  qtum: 'qtum',
  ravencoin: 'ravencoin',
  ripple: 'ripple',
  rootstock: 'rsk',
  smartcash: 'smartcash',
  solana: 'solana',
  sonic: 'sonic',
  stellar: 'stellar',
  sui: 'sui',
  tezos: 'tezos',
  thorchain: 'thorchainrune',
  ton: 'ton',
  tron: 'tron',
  vertcoin: 'vertcoin',
  zcash: 'zcash',
  zksync: 'zksync'
}

// One getCurrenciesFull row. Orders name their currencies only by ticker
// (currencyFrom/currencyTo), so this catalog is the only source of chain and
// contract information.
const asChangellyCurrency = asObject({
  name: asOptional(asString),
  ticker: asString,
  blockchain: asOptional(asString),
  contractAddress: asOptional(asEither(asString, asNull))
})

const asChangellyCurrenciesResult = asObject({
  result: asArray(asMaybe(asChangellyCurrency))
})

type ChangellyCurrency = ReturnType<typeof asChangellyCurrency>

/** Changelly currency ticker (lowercase) to its catalog row. */
export type ChangellyCurrencyMap = Map<string, ChangellyCurrency>

const asChangellyTx = asObject({
  id: asString,
  payinHash: asString,
  payoutHash: asString,
  payinAddress: asString,
  currencyFrom: asString,
  amountFrom: asString,
  payoutAddress: asString,
  currencyTo: asString,
  amountTo: asString,
  createdAt: asNumber
})

const asChangellyRawTx = asObject({
  status: asString
})

const asChangellyResult = asObject({
  result: asArray(asUnknown)
})

/**
 * Index a getCurrenciesFull response by lowercase ticker (the code orders
 * use), then by name where no ticker already claims it.
 */
export function makeChangellyCurrencyMap(
  rawResponse: unknown
): ChangellyCurrencyMap {
  const currencyMap: ChangellyCurrencyMap = new Map()
  const rows = asChangellyCurrenciesResult(rawResponse).result
  for (const row of rows) {
    if (row == null) continue
    currencyMap.set(row.ticker.toLowerCase(), row)
  }
  for (const row of rows) {
    if (row?.name == null) continue
    const nameKey = row.name.toLowerCase()
    if (!currencyMap.has(nameKey)) currencyMap.set(nameKey, row)
  }
  return currencyMap
}

const MAX_ATTEMPTS = 3
const LIMIT = 300
const TIMEOUT = 20000
const QUERY_LOOKBACK = 60 * 60 * 24 * 5 // 5 days

async function getTransactionsPromised(
  changellySDK: any,
  limit: number,
  offset: number,
  currencyFrom: string | undefined,
  address: string | undefined,
  extraId: string | undefined,
  log: ScopedLog
): Promise<ReturnType<typeof asChangellyResult>> {
  let promise
  let attempt = 1
  while (true) {
    const changellyFetch = new Promise((resolve, reject) => {
      changellySDK.getTransactions(
        limit,
        offset,
        currencyFrom,
        address,
        extraId,
        (err, data) => {
          if (err != null) {
            resolve(err.code)
          } else {
            resolve(data)
          }
        }
      )
    })

    const timeoutTest = new Promise((resolve, reject) => {
      setTimeout(resolve, TIMEOUT, 'ETIMEDOUT')
    })

    promise = await Promise.race([changellyFetch, timeoutTest])
    if (promise === 'ETIMEDOUT' && attempt <= MAX_ATTEMPTS) {
      log.warn(`Request timed out. Retry attempt: ${attempt}`)
      attempt++
      continue
    }
    break
  }
  return promise
}

/**
 * Load the Changelly currency catalog. A failure degrades to an empty map
 * (orders are stored without chain ids, as before) and is logged, so a
 * catalog outage never stalls ingestion.
 */
export async function loadChangellyCurrencyMap(
  changellySDK: any,
  log: ScopedLog
): Promise<ChangellyCurrencyMap> {
  try {
    const response = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('getCurrenciesFull timed out')),
        TIMEOUT
      )
      changellySDK._request(
        'getCurrenciesFull',
        {},
        (err: unknown, data: unknown) => {
          clearTimeout(timer)
          if (err != null) reject(err)
          else resolve(data)
        }
      )
    })
    const currencyMap = makeChangellyCurrencyMap(response)
    if (currencyMap.size === 0) {
      // An empty catalog, or one whose rows all fail the cleaner, leaves every
      // order without chain ids, so it is an error rather than a load.
      log.error(
        'Changelly: currency catalog loaded with 0 entries, storing orders without chain ids this run'
      )
    } else {
      log(`Changelly currency catalog loaded with ${currencyMap.size} entries`)
    }
    return currencyMap
  } catch (e) {
    log.error(
      `Changelly: currency catalog failed to load, storing orders without chain ids this run: ${String(
        e
      )}`
    )
    return new Map()
  }
}

export async function queryChangelly(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const { log } = pluginParams
  let changellySDK
  let latestTimeStamp = 0
  let offset = 0
  let firstAttempt = false
  if (typeof pluginParams.settings.latestTimeStamp === 'number') {
    latestTimeStamp = pluginParams.settings.latestTimeStamp
  }
  if (
    typeof pluginParams.settings.firstAttempt === 'undefined' ||
    pluginParams.settings.firstAttempt === true
  ) {
    firstAttempt = true
  }
  if (typeof pluginParams.settings.offset === 'number' && firstAttempt) {
    offset = pluginParams.settings.offset
  }
  if (
    typeof pluginParams.apiKeys.changellyApiKey === 'string' &&
    typeof pluginParams.apiKeys.changellyApiSecret === 'string'
  ) {
    changellySDK = new Changelly(
      pluginParams.apiKeys.changellyApiKey,
      pluginParams.apiKeys.changellyApiSecret
    )
  } else {
    return {
      settings: {
        latestTimeStamp: latestTimeStamp
      },
      transactions: []
    }
  }

  const currencyMap = await loadChangellyCurrencyMap(changellySDK, log)
  return await walkChangellyTxs(
    async pageOffset =>
      await getTransactionsPromised(
        changellySDK,
        LIMIT,
        pageOffset,
        undefined,
        undefined,
        undefined,
        log
      ),
    currencyMap,
    { latestTimeStamp, firstAttempt, offset },
    log
  )
}

export interface ChangellyCursor {
  latestTimeStamp: number
  firstAttempt: boolean
  offset: number
}

/**
 * Walk Changelly orders newest-first from `cursor.offset`, stopping once a
 * finished order is older than the lookback before `latestTimeStamp`.
 *
 * A walk that errors keeps the incoming `latestTimeStamp`, so the next run
 * re-reads the gap. Advancing it to the newest order seen would lose every
 * older order the walk never reached, including a rewound backfill. The
 * first-attempt walk is the exception: it resumes from its saved `offset`, so
 * it advances `latestTimeStamp` to the newest order seen across its runs.
 */
export async function walkChangellyTxs(
  fetchPage: (offset: number) => Promise<unknown>,
  currencyMap: ChangellyCurrencyMap,
  cursor: ChangellyCursor,
  log: ScopedLog
): Promise<{ settings: ChangellyCursor; transactions: StandardTx[] }> {
  const { latestTimeStamp } = cursor
  let { firstAttempt, offset } = cursor
  const standardTxs: StandardTx[] = []
  let newLatestTimeStamp = latestTimeStamp
  let done = false
  let walkComplete = false
  try {
    while (!done) {
      log(`Query offset: ${offset}`)
      const result = await fetchPage(offset)
      const txs = asChangellyResult(result).result
      if (txs.length === 0) {
        log(`Done at offset ${offset}`)
        firstAttempt = false
        break
      }
      for (const rawTx of txs) {
        if (asChangellyRawTx(rawTx).status === 'finished') {
          // Skip and log an order that fails to process, so one bad order
          // does not stop the walk short of the orders behind it.
          let standardTx: StandardTx
          try {
            standardTx = processChangellyTx(rawTx, currencyMap, log)
          } catch (e) {
            log.error(
              `Changelly: skipping unprocessable order, ingestion continues: ${String(
                e
              )}: ${JSON.stringify(rawTx)}`
            )
            continue
          }
          standardTxs.push(standardTx)
          if (standardTx.timestamp > newLatestTimeStamp) {
            newLatestTimeStamp = standardTx.timestamp
          }
          if (
            standardTx.timestamp < latestTimeStamp - QUERY_LOOKBACK &&
            !done &&
            !firstAttempt
          ) {
            log(
              `Done: date ${standardTx.timestamp} < ${latestTimeStamp -
                QUERY_LOOKBACK}`
            )
            done = true
          }
        }
      }
      offset += LIMIT
    }
    walkComplete = true
  } catch (e) {
    log.error(String(e))
  }
  return {
    settings: {
      latestTimeStamp:
        walkComplete || cursor.firstAttempt
          ? newLatestTimeStamp
          : latestTimeStamp,
      firstAttempt,
      offset
    },
    transactions: standardTxs
  }
}

export const changelly: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryChangelly,
  // results in a PluginResult
  pluginName: 'Changelly',
  pluginId: 'changelly'
}

interface EdgeAssetInfo {
  chainPluginId: string | undefined
  evmChainId: number | undefined
  tokenId: EdgeTokenId | undefined
}

const UNMAPPED_ASSET: EdgeAssetInfo = {
  chainPluginId: undefined,
  evmChainId: undefined,
  tokenId: undefined
}

/**
 * Resolve a Changelly ticker to Edge chain and token ids through the catalog.
 * Anything unresolvable leaves the fields unset (and is logged) rather than
 * dropping the order, so its volume is still counted. A token is never
 * reported as the chain's native asset (tokenId null), which would price it
 * with the gas-token rate.
 */
function getAssetInfo(
  ticker: string,
  orderId: string,
  currencyMap: ChangellyCurrencyMap,
  log: ScopedLog
): EdgeAssetInfo {
  // An empty map means the catalog did not load; that is logged once already.
  if (currencyMap.size === 0) return UNMAPPED_ASSET

  const currency = currencyMap.get(ticker.toLowerCase())
  if (currency == null) {
    log.error(
      `Changelly: ticker ${ticker} is not in the currency catalog, order ${orderId} stored without a chain`
    )
    return UNMAPPED_ASSET
  }

  const blockchain = currency.blockchain ?? ''
  const chainPluginId = CHANGELLY_BLOCKCHAIN_TO_PLUGIN_ID[blockchain]
  if (chainPluginId == null) {
    log.error(
      `Changelly: unknown blockchain "${blockchain}" for ticker ${ticker}, order ${orderId} stored without a chain. Add it to CHANGELLY_BLOCKCHAIN_TO_PLUGIN_ID.`
    )
    return UNMAPPED_ASSET
  }
  const evmChainId = EVM_CHAIN_IDS[chainPluginId]

  // An empty or zero contract address is the chain's native asset.
  const contractAddress = currency.contractAddress ?? ''
  if (contractAddress === '' || /^0x0+$/i.test(contractAddress)) {
    return { chainPluginId, evmChainId, tokenId: null }
  }

  const tokenType = tokenTypes[chainPluginId]
  if (tokenType == null) {
    log.error(
      `Changelly: no tokenType for chainPluginId ${chainPluginId} (ticker ${ticker}, contract ${contractAddress}), order ${orderId} stored without a tokenId`
    )
    return { chainPluginId, evmChainId, tokenId: undefined }
  }
  try {
    const tokenId = createTokenId(
      tokenType,
      ticker.toUpperCase(),
      contractAddress
    )
    return { chainPluginId, evmChainId, tokenId }
  } catch (e) {
    log.error(
      `Changelly: cannot build a tokenId for ticker ${ticker} (contract ${contractAddress}), order ${orderId} stored without a tokenId: ${String(
        e
      )}`
    )
    return { chainPluginId, evmChainId, tokenId: undefined }
  }
}

export function processChangellyTx(
  rawTx: unknown,
  currencyMap: ChangellyCurrencyMap,
  log: ScopedLog
): StandardTx {
  const tx = asChangellyTx(rawTx)
  const depositAsset = getAssetInfo(tx.currencyFrom, tx.id, currencyMap, log)
  const payoutAsset = getAssetInfo(tx.currencyTo, tx.id, currencyMap, log)

  const standardTx: StandardTx = {
    status: 'complete',
    orderId: tx.id,
    countryCode: null,
    depositTxid: tx.payinHash,
    depositAddress: tx.payinAddress,
    depositCurrency: tx.currencyFrom.toUpperCase(),
    depositChainPluginId: depositAsset.chainPluginId,
    depositEvmChainId: depositAsset.evmChainId,
    depositTokenId: depositAsset.tokenId,
    depositAmount: safeParseFloat(tx.amountFrom),
    direction: null,
    exchangeType: 'swap',
    paymentType: null,
    payoutTxid: tx.payoutHash,
    payoutAddress: tx.payoutAddress,
    payoutCurrency: tx.currencyTo.toUpperCase(),
    payoutChainPluginId: payoutAsset.chainPluginId,
    payoutEvmChainId: payoutAsset.evmChainId,
    payoutTokenId: payoutAsset.tokenId,
    payoutAmount: safeParseFloat(tx.amountTo),
    timestamp: tx.createdAt,
    isoDate: new Date(tx.createdAt * 1000).toISOString(),
    usdValue: -1,
    rawTx
  }

  return standardTx
}
