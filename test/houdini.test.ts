import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  FetchHoudiniPage,
  processHoudiniOrder,
  processHoudiniOrders,
  queryHoudini
} from '../src/partners/houdini'
import { EDGE_APP_START_DATE, PluginParams, ScopedLog } from '../src/types'

const makeLog = (): {
  log: ScopedLog
  errors: string[]
  warnings: string[]
} => {
  const errors: string[] = []
  const warnings: string[] = []
  const log: ScopedLog = Object.assign(() => undefined, {
    warn: (message: string) => {
      warnings.push(message)
    },
    error: (message: string) => {
      errors.push(message)
    }
  })
  return { log, errors, warnings }
}

const makeParams = (
  overrides: Partial<PluginParams> = {}
): PluginParams & { errors: string[]; warnings: string[] } => {
  const { log, errors, warnings } = makeLog()
  return { apiKeys: {}, settings: {}, log, errors, warnings, ...overrides }
}

const HOUR = 1000 * 60 * 60

interface Token {
  id: string
  address: string | null
  chain: string
  symbol: string
  decimals: number
  mainnet: boolean
  // Non-EVM chains carry no chainId at all
  chainData: { shortName: string; chainId?: number; kind: string }
}

const eth: Token = {
  id: '6689b73ec90e45f3b3e51553',
  address: null,
  chain: 'ethereum',
  symbol: 'ETH',
  decimals: 18,
  mainnet: true,
  chainData: { shortName: 'ethereum', chainId: 1, kind: 'evm' }
}
const tronUsdt: Token = {
  id: '6689b73ec90e45f3b3e51577',
  address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  chain: 'tron',
  symbol: 'USDT',
  decimals: 6,
  mainnet: false,
  chainData: { shortName: 'tron', kind: 'tron' }
}
const btc: Token = {
  id: '6689b73ec90e45f3b3e51566',
  address: null,
  chain: 'bitcoin',
  symbol: 'BTC',
  decimals: 8,
  mainnet: true,
  chainData: { shortName: 'bitcoin', kind: 'bitcoin' }
}
const xmr: Token = {
  id: '6689b73ec90e45f3b3e51588',
  address: null,
  chain: 'monero',
  symbol: 'XMR',
  decimals: 12,
  mainnet: true,
  chainData: { shortName: 'monero', kind: 'xmr' }
}
const solanaUsdc: Token = {
  id: '6689b73ec90e45f3b3e51599',
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  chain: 'solana',
  symbol: 'USDC',
  decimals: 6,
  mainnet: false,
  chainData: { shortName: 'solana', kind: 'sol' }
}
const bscUsdt: Token = {
  id: '6689b73ec90e45f3b3e515aa',
  address: '0x55d398326f99059fF775485246999027B3197955',
  chain: 'bsc',
  symbol: 'USDT',
  decimals: 18,
  mainnet: false,
  chainData: { shortName: 'bsc', chainId: 56, kind: 'evm' }
}
const monadNative: Token = {
  id: '6689b73ec90e45f3b3e515bb',
  address: null,
  chain: 'MON',
  symbol: 'MON',
  decimals: 18,
  mainnet: true,
  chainData: { shortName: 'MON', chainId: 143, kind: 'evm' }
}

const makeOrder = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  houdiniId: 'aBcD1234efGH5678',
  id: '68f0a1b2c3d4e5f601234567',
  status: 4,
  displayStatus: 'completed',
  created: '2026-10-15T12:00:00.000Z',
  inCreated: '2026-10-15T12:00:00.000Z',
  expires: '2026-10-15T12:30:00.000Z',
  eta: 10,
  inAmount: 0.5,
  inSymbol: 'ETH',
  outAmount: 1234.56,
  outSymbol: 'USDTTRON',
  inAmountUsd: 1240.12,
  outAmountUsd: 1234.56,
  inToken: eth,
  outToken: tronUsdt,
  receiverAddress: 'TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy',
  depositAddress: '0x1111111111111111111111111111111111111111',
  refundAddress: '0x2222222222222222222222222222222222222222',
  anonymous: false,
  isDex: false,
  actionRequired: false,
  inStatus: 5,
  notified: true,
  swapName: 'changenow',
  inHash: '0xdeposit',
  transactionHash: 'payouthash',
  metadata: null,
  ...overrides
})

describe('processHoudiniOrder', function() {
  it('maps a finished standard swap', function() {
    const params = makeParams()
    const order = makeOrder()
    const tx = processHoudiniOrder(order, params)

    expect(tx).to.deep.equal({
      status: 'complete',
      orderId: 'aBcD1234efGH5678',
      countryCode: null,
      depositTxid: '0xdeposit',
      depositAddress: '0x1111111111111111111111111111111111111111',
      depositCurrency: 'ETH',
      depositChainPluginId: 'ethereum',
      depositEvmChainId: 1,
      depositTokenId: null,
      depositAmount: 0.5,
      direction: null,
      exchangeType: 'swap',
      paymentType: null,
      payoutTxid: 'payouthash',
      payoutAddress: 'TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy',
      payoutCurrency: 'USDT',
      payoutChainPluginId: 'tron',
      payoutEvmChainId: undefined,
      payoutTokenId: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      payoutAmount: 1234.56,
      timestamp: Date.parse('2026-10-15T12:00:00.000Z') / 1000,
      isoDate: '2026-10-15T12:00:00.000Z',
      usdValue: 1240.12,
      rawTx: order
    })
    expect(params.warnings).to.deep.equal([])
  })

  it('maps a private swap that is still anonymizing', function() {
    const tx = processHoudiniOrder(
      makeOrder({
        status: 3,
        anonymous: true,
        swapName: undefined,
        inToken: btc,
        inSymbol: 'BTC',
        outToken: xmr,
        outSymbol: 'XMR',
        receiverAddress: '4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx',
        transactionHash: ''
      }),
      makeParams()
    )

    expect(tx.status).to.equal('processing')
    expect(tx.depositChainPluginId).to.equal('bitcoin')
    expect(tx.depositTokenId).to.equal(null)
    expect(tx.payoutChainPluginId).to.equal('monero')
    expect(tx.payoutTokenId).to.equal(null)
    expect(tx.payoutTxid).to.equal(undefined)
  })

  it('maps a private same-token send to another address', function() {
    const tx = processHoudiniOrder(
      makeOrder({
        anonymous: true,
        swapName: undefined,
        inToken: solanaUsdc,
        inSymbol: 'USDCSOL',
        inAmount: 100,
        outToken: solanaUsdc,
        outSymbol: 'USDCSOL',
        outAmount: 98.7,
        receiverAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        depositAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'
      }),
      makeParams()
    )

    expect(tx.depositCurrency).to.equal('USDC')
    expect(tx.payoutCurrency).to.equal('USDC')
    expect(tx.depositChainPluginId).to.equal('solana')
    expect(tx.payoutChainPluginId).to.equal('solana')
    expect(tx.depositTokenId).to.equal(
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    )
    expect(tx.payoutTokenId).to.equal(tx.depositTokenId)
    expect(tx.depositAmount).to.equal(100)
    expect(tx.payoutAmount).to.equal(98.7)
    expect(tx.payoutAddress).to.equal(
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
    )
  })

  it('maps a DEX order with no deposit address', function() {
    const order = makeOrder({
      status: 2,
      isDex: true,
      inToken: bscUsdt,
      inSymbol: 'USDTBSC',
      outToken: monadNative,
      outSymbol: 'MON',
      transactionHash: undefined
    })
    delete order.depositAddress
    const tx = processHoudiniOrder(order, makeParams())

    expect(tx.status).to.equal('processing')
    expect(tx.depositAddress).to.equal(undefined)
    expect(tx.depositChainPluginId).to.equal('binancesmartchain')
    expect(tx.depositEvmChainId).to.equal(56)
    expect(tx.depositTokenId).to.equal(
      '55d398326f99059ff775485246999027b3197955'
    )
    // Monad is not in this server's EVM chain table; Houdini's chain id fills it
    expect(tx.payoutChainPluginId).to.equal('monad')
    expect(tx.payoutEvmChainId).to.equal(143)
    expect(tx.payoutTokenId).to.equal(null)
  })

  it('does not report the refund hash of a refunded order as a payout', function() {
    const tx = processHoudiniOrder(
      makeOrder({ status: 7, transactionHash: 'refundhash' }),
      makeParams()
    )

    expect(tx.status).to.equal('refunded')
    expect(tx.depositTxid).to.equal('0xdeposit')
    expect(tx.payoutTxid).to.equal(undefined)
  })

  it('maps a pending order with no deposit yet', function() {
    const tx = processHoudiniOrder(
      makeOrder({ status: 0, inHash: null, transactionHash: null }),
      makeParams()
    )

    expect(tx.status).to.equal('pending')
    expect(tx.depositTxid).to.equal(undefined)
    expect(tx.payoutTxid).to.equal(undefined)
  })

  it('maps every documented status', function() {
    const expected: Record<number, string> = {
      [-2]: 'pending',
      [-1]: 'pending',
      0: 'pending',
      1: 'confirming',
      2: 'processing',
      3: 'processing',
      4: 'complete',
      5: 'expired',
      6: 'failed',
      7: 'refunded',
      8: 'cancelled'
    }
    for (const [status, mapped] of Object.entries(expected)) {
      const params = makeParams()
      const tx = processHoudiniOrder(
        makeOrder({ status: Number(status) }),
        params
      )
      expect(tx.status).to.equal(mapped)
      expect(params.warnings).to.deep.equal([])
    }
  })

  it('warns about a status it does not know', function() {
    const params = makeParams()
    const tx = processHoudiniOrder(makeOrder({ status: 42 }), params)

    expect(tx.status).to.equal('other')
    expect(params.warnings).to.deep.equal(['Houdini: unknown status 42'])
  })

  it('keeps an order on an unknown chain and warns', function() {
    const params = makeParams()
    const tx = processHoudiniOrder(
      makeOrder({
        inToken: { ...eth, chain: 'kaspa', symbol: 'KAS' },
        inSymbol: 'KAS'
      }),
      params
    )

    expect(tx.depositCurrency).to.equal('KAS')
    expect(tx.depositChainPluginId).to.equal(undefined)
    expect(tx.depositTokenId).to.equal(undefined)
    expect(tx.payoutChainPluginId).to.equal('tron')
    expect(params.warnings).to.deep.equal(['Houdini: unknown chain kaspa'])
  })

  it('takes the EVM chain id from the server table over the order', function() {
    const tx = processHoudiniOrder(
      makeOrder({
        inToken: { ...eth, chainData: { ...eth.chainData, chainId: 999 } }
      }),
      makeParams()
    )

    expect(tx.depositEvmChainId).to.equal(1)
  })

  it('falls back to the order tickers when the token details are missing', function() {
    const order = makeOrder()
    delete order.inToken
    delete order.outToken
    const tx = processHoudiniOrder(order, makeParams())

    expect(tx.depositCurrency).to.equal('ETH')
    expect(tx.payoutCurrency).to.equal('USDTTRON')
    expect(tx.depositChainPluginId).to.equal(undefined)
    expect(tx.payoutChainPluginId).to.equal(undefined)
    expect(tx.depositTokenId).to.equal(undefined)
  })

  it('reports an unknown USD value as -1', function() {
    const order = makeOrder()
    delete order.inAmountUsd
    expect(processHoudiniOrder(order, makeParams()).usdValue).to.equal(-1)
  })
})

describe('processHoudiniOrders', function() {
  it('skips and logs an unprocessable order and keeps the rest of the page', function() {
    const params = makeParams()
    const result = processHoudiniOrders(
      [
        makeOrder({ houdiniId: 'good1' }),
        makeOrder({ houdiniId: 'bad', created: 'not a date' }),
        makeOrder({ houdiniId: 'good2' })
      ],
      params
    )

    expect(result.standardTxs.map(tx => tx.orderId)).to.deep.equal([
      'good1',
      'good2'
    ])
    expect(result.skipped).to.equal(1)
    expect(params.errors.length).to.equal(1)
    expect(params.errors[0]).to.include('bad')
  })
})

describe('queryHoudini', function() {
  it('returns nothing without calling the API when a credential is missing', async function() {
    let calls = 0
    const fetchPage: FetchHoudiniPage = async () => {
      calls++
      return { orders: [], totalPages: 0 }
    }
    for (const apiKeys of [
      {},
      { apiKey: '', apiSecret: 'secret' },
      { apiKey: 'key' },
      { apiKey: 'key', apiSecret: '' }
    ]) {
      const result = await queryHoudini(makeParams({ apiKeys }), fetchPage)
      expect(result.transactions).to.deep.equal([])
    }
    expect(calls).to.equal(0)
  })

  it('reads every page of the 48-hour window and advances progress', async function() {
    const calls: Array<{
      apiKey: string
      apiSecret: string
      from: string
      to: string
      page: number
    }> = []
    const pages = [
      [makeOrder({ houdiniId: 'a' }), makeOrder({ houdiniId: 'b' })],
      // An order shifted onto the next page while the walk ran
      [makeOrder({ houdiniId: 'b' }), makeOrder({ houdiniId: 'c' })],
      [makeOrder({ houdiniId: 'd' })]
    ]
    const fetchPage: FetchHoudiniPage = async (
      apiKey,
      apiSecret,
      from,
      to,
      page
    ) => {
      calls.push({ apiKey, apiSecret, from, to, page })
      return { orders: pages[page - 1], totalPages: pages.length, total: 5 }
    }

    const before = Date.now()
    const params = makeParams({
      apiKeys: { apiKey: 'key', apiSecret: 'secret' },
      settings: { latestIsoDate: new Date(before - HOUR).toISOString() }
    })
    const result = await queryHoudini(params, fetchPage)
    const after = Date.now()

    expect(calls.map(call => call.page)).to.deep.equal([1, 2, 3])
    expect(
      calls.every(call => call.apiKey === 'key' && call.apiSecret === 'secret')
    ).to.equal(true)
    // One frozen window, the API's 48-hour retention, for every page
    expect(new Set(calls.map(call => call.from)).size).to.equal(1)
    expect(new Set(calls.map(call => call.to)).size).to.equal(1)
    const to = Date.parse(calls[0].to)
    expect(to).to.be.within(before, after)
    expect(to - Date.parse(calls[0].from)).to.equal(48 * HOUR)

    expect(result.transactions.map(tx => tx.orderId)).to.deep.equal([
      'a',
      'b',
      'c',
      'd'
    ])
    expect(result.settings.latestIsoDate).to.equal(calls[0].to)
    expect(params.errors).to.deep.equal([])
  })

  it('reads past a full page even when totalPages says it was the last', async function() {
    const pages = [
      Array.from({ length: 100 }, (_, i) => makeOrder({ houdiniId: `a${i}` })),
      [makeOrder({ houdiniId: 'b' })]
    ]
    const calls: number[] = []
    const fetchPage: FetchHoudiniPage = async (
      apiKey,
      apiSecret,
      from,
      to,
      page
    ) => {
      calls.push(page)
      return { orders: pages[page - 1] ?? [], totalPages: 1 }
    }
    const params = makeParams({
      apiKeys: { apiKey: 'key', apiSecret: 'secret' },
      settings: { latestIsoDate: new Date(Date.now() - HOUR).toISOString() }
    })
    const result = await queryHoudini(params, fetchPage)

    expect(calls).to.deep.equal([1, 2])
    expect(result.transactions.length).to.equal(101)
    expect(result.settings.latestIsoDate).to.not.equal(
      params.settings.latestIsoDate
    )
  })

  it('logs the gap when progress fell behind the 48-hour window', async function() {
    const fetchPage: FetchHoudiniPage = async () => ({
      orders: [],
      totalPages: 0
    })
    const latestIsoDate = new Date(Date.now() - 72 * HOUR).toISOString()
    const params = makeParams({
      apiKeys: { apiKey: 'key', apiSecret: 'secret' },
      settings: { latestIsoDate }
    })
    const result = await queryHoudini(params, fetchPage)

    expect(params.errors.length).to.equal(1)
    expect(params.errors[0]).to.include(latestIsoDate)
    expect(params.errors[0]).to.include('lost')
    expect(result.settings.latestIsoDate).to.not.equal(latestIsoDate)
  })

  it('only warns on the first run', async function() {
    const fetchPage: FetchHoudiniPage = async () => ({
      orders: [],
      totalPages: 0
    })
    const params = makeParams({
      apiKeys: { apiKey: 'key', apiSecret: 'secret' },
      settings: { latestIsoDate: EDGE_APP_START_DATE }
    })
    await queryHoudini(params, fetchPage)

    expect(params.errors).to.deep.equal([])
    expect(params.warnings.length).to.equal(1)
    expect(params.warnings[0]).to.include('first run')
  })

  it('holds progress when a page has the wrong shape', async function() {
    let calls = 0
    const fetchPage: FetchHoudiniPage = async () => {
      calls++
      return calls === 1
        ? { orders: [makeOrder({ houdiniId: 'a' })], totalPages: 2 }
        : { error: 'nope' }
    }
    const latestIsoDate = new Date(Date.now() - HOUR).toISOString()
    const params = makeParams({
      apiKeys: { apiKey: 'key', apiSecret: 'secret' },
      settings: { latestIsoDate }
    })
    const result = await queryHoudini(params, fetchPage)

    expect(calls).to.equal(2)
    expect(result.transactions.map(tx => tx.orderId)).to.deep.equal(['a'])
    expect(result.settings.latestIsoDate).to.equal(latestIsoDate)
    expect(params.errors.some(e => e.includes('unexpected response'))).to.equal(
      true
    )
  })
})
