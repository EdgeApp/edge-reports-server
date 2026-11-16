import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  FetchHoudiniModes,
  FetchHoudiniPage,
  getHeldOrderLossMs,
  getHoudiniMode,
  houdini,
  HOUDINI_HOLD_ALARM_MS,
  HOUDINI_MODE_LAG_MS,
  HOUDINI_MODE_PARTNERS,
  HOUDINI_MODE_SETTLE_MS,
  HoudiniMode,
  houdinisend,
  houdinistealth,
  houdinistealthsend,
  houdinistealthswapsend,
  HoudiniWalk,
  isHoudiniModeSettled,
  makeHoudiniModeQueries,
  makeHoudiniWalkCache,
  parseHoudiniModeRows,
  POSTHOG_MAX_ROWS,
  POSTHOG_ORDER_ID_BATCH,
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

// No event source configured, so every order splits on its private-route flag
const noModes: FetchHoudiniModes = async () => undefined

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
      const result = await queryHoudini(
        makeParams({ apiKeys }),
        'swap',
        fetchPage,
        noModes
      )
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
    const result = await queryHoudini(params, 'swap', fetchPage, noModes)
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
    const result = await queryHoudini(params, 'swap', fetchPage, noModes)

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
    const result = await queryHoudini(params, 'swap', fetchPage, noModes)

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
    await queryHoudini(params, 'swap', fetchPage, noModes)

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
    const result = await queryHoudini(params, 'swap', fetchPage, noModes)

    expect(calls).to.equal(2)
    expect(result.transactions.map(tx => tx.orderId)).to.deep.equal(['a'])
    expect(result.settings.latestIsoDate).to.equal(latestIsoDate)
    expect(params.errors.some(e => e.includes('unexpected response'))).to.equal(
      true
    )
  })
})

describe('getHoudiniMode', function() {
  const created = Date.parse('2026-11-16T12:00:00.000Z')

  it('takes the mode the app logged', function() {
    const event = { mode: 'swapSend' as const, receivedMs: created + 1000 }
    expect(getHoudiniMode(true, created, event)).to.equal('swapSend')
    expect(getHoudiniMode(false, created, event)).to.equal('swapSend')
  })

  it('falls back to the private-route flag without a logged mode', function() {
    for (const event of [
      undefined,
      { mode: undefined, receivedMs: created + 1000 }
    ]) {
      expect(getHoudiniMode(true, created, event)).to.equal('stealthSwap')
      expect(getHoudiniMode(false, created, event)).to.equal('swap')
      expect(getHoudiniMode(undefined, created, event)).to.equal('swap')
    }
  })

  it('ignores an event that arrived after the settle window', function() {
    const onTime = {
      mode: 'stealthSwapSend' as const,
      receivedMs: created + HOUDINI_MODE_SETTLE_MS
    }
    const late = { ...onTime, receivedMs: onTime.receivedMs + 1 }
    expect(getHoudiniMode(false, created, onTime)).to.equal('stealthSwapSend')
    expect(getHoudiniMode(false, created, late)).to.equal('swap')
  })
})

describe('parseHoudiniModeRows', function() {
  it('reads each order id, mode and receive time', function() {
    const events = parseHoudiniModeRows({
      results: [
        ['a', 'swapSend', '2026-11-12T07:42:07.192000Z'],
        ['b', null, '2026-11-12T07:42:08.000000Z'],
        ['c', 'somethingNew', '2026-11-12T07:42:09.000000Z'],
        ['d', 'stealthSend', '2026-11-12T07:42:10.000000Z']
      ]
    })
    expect([...events.entries()]).to.deep.equal([
      [
        'a',
        { mode: 'swapSend', receivedMs: Date.parse('2026-11-12T07:42:07.192Z') }
      ],
      [
        'b',
        { mode: undefined, receivedMs: Date.parse('2026-11-12T07:42:08Z') }
      ],
      [
        'c',
        { mode: undefined, receivedMs: Date.parse('2026-11-12T07:42:09Z') }
      ],
      [
        'd',
        { mode: 'stealthSend', receivedMs: Date.parse('2026-11-12T07:42:10Z') }
      ]
    ])
  })

  it('throws rather than guess', function() {
    expect(() => parseHoudiniModeRows({ error: 'nope' })).to.throw()
    expect(() =>
      parseHoudiniModeRows({ results: [['a', 'swap', 'not a time']] })
    ).to.throw('Bad PostHog event time')
    const full = Array.from({ length: POSTHOG_MAX_ROWS }, (_, i) => [
      `o${i}`,
      'swap',
      '2026-11-12T07:42:07.192000Z'
    ])
    expect(() => parseHoudiniModeRows({ results: full })).to.throw('rows')
  })
})

describe('queryHoudini modes', function() {
  const iso = (ms: number): string => new Date(ms).toISOString()

  const run = async (
    mode: HoudiniMode,
    fetchModes: FetchHoudiniModes
  ): Promise<{
    ids: string[]
    params: ReturnType<typeof makeParams>
    latestIsoDate: unknown
  }> => {
    const now = Date.now()
    const old = iso(now - 3 * HOUR)
    const orders = [
      makeOrder({ houdiniId: 'plain', created: old, anonymous: false }),
      makeOrder({ houdiniId: 'private', created: old, anonymous: true }),
      makeOrder({ houdiniId: 'send', created: old, anonymous: false }),
      makeOrder({ houdiniId: 'stealthSend', created: old, anonymous: true }),
      makeOrder({
        houdiniId: 'stealthSwapSend',
        created: old,
        anonymous: true
      }),
      // The best quote was a private route, but the user asked for a plain swap
      makeOrder({ houdiniId: 'plainOnPrivate', created: old, anonymous: true }),
      // Too young: its event may still be on the way
      makeOrder({
        houdiniId: 'young',
        created: iso(now - HOUR / 2),
        anonymous: false
      })
    ]
    const fetchPage: FetchHoudiniPage = async () => ({
      orders,
      totalPages: 1
    })
    const params = makeParams({
      apiKeys: { apiKey: 'key', apiSecret: 'secret' },
      settings: { latestIsoDate: iso(now - HOUR) }
    })
    const result = await queryHoudini(params, mode, fetchPage, fetchModes)
    return {
      ids: result.transactions.map(tx => tx.orderId),
      params,
      latestIsoDate: result.settings.latestIsoDate
    }
  }

  const fetchModes: FetchHoudiniModes = async () => {
    const receivedMs = Date.now() - 3 * HOUR + 1000
    return new Map([
      // Keyed lowercase, as parseHoudiniModeRows keys them:
      ['send', { mode: 'swapSend', receivedMs }],
      ['stealthsend', { mode: 'stealthSend', receivedMs }],
      ['stealthswapsend', { mode: 'stealthSwapSend', receivedMs }],
      ['plainonprivate', { mode: 'swap', receivedMs }],
      ['young', { mode: 'swapSend', receivedMs: Date.now() }]
    ])
  }

  it('gives each order to exactly one mode partner', async function() {
    expect((await run('swap', fetchModes)).ids).to.deep.equal([
      'plain',
      'plainOnPrivate'
    ])
    expect((await run('swapSend', fetchModes)).ids).to.deep.equal(['send'])
    expect((await run('stealthSwap', fetchModes)).ids).to.deep.equal([
      'private'
    ])
    expect((await run('stealthSwapSend', fetchModes)).ids).to.deep.equal([
      'stealthSwapSend'
    ])
    expect((await run('stealthSend', fetchModes)).ids).to.deep.equal([
      'stealthSend'
    ])
  })

  it('splits on the private-route flag without an event source', async function() {
    expect((await run('swap', noModes)).ids).to.deep.equal(['plain', 'send'])
    expect((await run('stealthSwap', noModes)).ids).to.deep.equal([
      'private',
      'stealthSend',
      'stealthSwapSend',
      'plainOnPrivate'
    ])
    expect((await run('swapSend', noModes)).ids).to.deep.equal([])
  })

  it('reads events from the settle window before the 48 hours', async function() {
    const calls: Array<[number, number]> = []
    const before = Date.now()
    await run('swap', async (fromMs, toMs) => {
      calls.push([fromMs, toMs])
      return undefined
    })
    const after = Date.now()
    expect(calls.length).to.equal(1)
    const [fromMs, toMs] = calls[0]
    expect(toMs).to.be.within(before, after)
    expect(toMs - fromMs).to.equal(48 * HOUR + HOUDINI_MODE_SETTLE_MS)
  })

  it('reports nothing and holds progress when the lookup fails', async function() {
    const { ids, params, latestIsoDate } = await run('swap', async () => {
      throw new Error('PostHog down')
    })
    expect(ids).to.deep.equal([])
    expect(latestIsoDate).to.equal(params.settings.latestIsoDate)
    expect(params.errors.length).to.equal(1)
    expect(params.errors[0]).to.include('PostHog down')
  })
})

describe('makeHoudiniWalkCache', function() {
  const makeWalk = (nowMs: number): HoudiniWalk => ({
    nowMs,
    complete: true,
    skipped: 0,
    standardTxs: [],
    events: undefined,
    eventsError: undefined
  })

  it('shares a walk in flight and a recent one', async function() {
    const cache = makeHoudiniWalkCache(HOUR)
    let walks = 0
    const walk = async (): Promise<HoudiniWalk> => {
      walks++
      return makeWalk(walks)
    }
    const [a, b] = await Promise.all([
      cache.get('k', walk),
      cache.get('k', walk)
    ])
    const c = await cache.get('k', walk)
    expect(walks).to.equal(1)
    expect(a).to.equal(b)
    expect(c).to.equal(a)
    // Another account walks on its own:
    await cache.get('other', walk)
    expect(walks).to.equal(2)
  })

  it('walks again once the shared walk is too old', async function() {
    const cache = makeHoudiniWalkCache(0)
    let walks = 0
    const walk = async (): Promise<HoudiniWalk> => makeWalk(++walks)
    await cache.get('k', walk)
    await cache.get('k', walk)
    expect(walks).to.equal(2)
  })

  it('shares a walk in flight however long it runs', async function() {
    const cache = makeHoudiniWalkCache(0)
    let walks = 0
    let finish = (): void => {}
    const slow = async (): Promise<HoudiniWalk> =>
      await new Promise(resolve => {
        walks++
        finish = () => resolve(makeWalk(walks))
      })
    const first = cache.get('k', slow)
    const second = cache.get('k', slow)
    finish()
    expect(await second).to.equal(await first)
    expect(walks).to.equal(1)
  })

  it('times the shared window from when the walk finished', async function() {
    // The walk outlasts the window, so timing it from the start would walk twice
    const cache = makeHoudiniWalkCache(200)
    let walks = 0
    const slow = async (): Promise<HoudiniWalk> => {
      walks++
      await new Promise(resolve => setTimeout(resolve, 300))
      return makeWalk(walks)
    }
    await cache.get('k', slow)
    await cache.get('k', slow)
    expect(walks).to.equal(1)
  })

  it('does not share a walk that threw', async function() {
    const cache = makeHoudiniWalkCache(HOUR)
    let walks = 0
    const walk = async (): Promise<HoudiniWalk> => {
      walks++
      if (walks === 1) throw new Error('down')
      return makeWalk(walks)
    }
    let error: unknown
    await cache.get('k', walk).catch(e => {
      error = e
    })
    expect(String(error)).to.contain('down')
    expect((await cache.get('k', walk)).nowMs).to.equal(2)
  })
})

describe('queryHoudini shared walk', function() {
  it('reads the feed and the events once for every mode partner', async function() {
    const created = new Date(Date.now() - 3 * HOUR).toISOString()
    let pages = 0
    let lookups = 0
    const fetchPage: FetchHoudiniPage = async () => {
      pages++
      return {
        orders: [
          makeOrder({ houdiniId: 'plain', created, anonymous: false }),
          makeOrder({ houdiniId: 'private', created, anonymous: true })
        ],
        totalPages: 1
      }
    }
    const fetchModes: FetchHoudiniModes = async () => {
      lookups++
      return new Map()
    }
    const cache = makeHoudiniWalkCache(HOUR)
    const ids: string[][] = []
    for (const mode of ['swap', 'stealthSwap', 'swapSend'] as const) {
      const params = makeParams({
        apiKeys: { apiKey: 'key', apiSecret: 'secret' },
        settings: { latestIsoDate: new Date(Date.now() - HOUR).toISOString() }
      })
      const result = await queryHoudini(
        params,
        mode,
        fetchPage,
        fetchModes,
        cache
      )
      ids.push(result.transactions.map(tx => tx.orderId))
    }
    expect(pages).to.equal(1)
    expect(lookups).to.equal(1)
    expect(ids).to.deep.equal([['plain'], ['private'], []])
  })

  it('holds every partner when the shared event lookup failed', async function() {
    const created = new Date(Date.now() - 3 * HOUR).toISOString()
    const fetchPage: FetchHoudiniPage = async () => ({
      orders: [makeOrder({ houdiniId: 'plain', created, anonymous: false })],
      totalPages: 1
    })
    const fetchModes: FetchHoudiniModes = async () => {
      throw new Error('PostHog error 503')
    }
    const cache = makeHoudiniWalkCache(HOUR)
    const latestIsoDate = new Date(Date.now() - HOUR).toISOString()
    for (const mode of ['swap', 'stealthSwap'] as const) {
      const params = makeParams({
        apiKeys: { apiKey: 'key', apiSecret: 'secret' },
        settings: { latestIsoDate }
      })
      const result = await queryHoudini(
        params,
        mode,
        fetchPage,
        fetchModes,
        cache
      )
      expect(result.transactions).to.deep.equal([])
      expect(result.settings.latestIsoDate).to.equal(latestIsoDate)
    }
  })
})

describe('Houdini mode partners', function() {
  it('register one partner id per mode', function() {
    const ids = [
      houdini,
      houdinisend,
      houdinistealth,
      houdinistealthswapsend,
      houdinistealthsend
    ].map(plugin => plugin.pluginId)
    expect(new Set(ids).size).to.equal(5)
    const byName = (a: string, b: string): number => a.localeCompare(b)
    expect([...ids].sort(byName)).to.deep.equal(
      Object.values(HOUDINI_MODE_PARTNERS).sort(byName)
    )
  })

  it('settles an order only past the window and its lag', function() {
    const created = Date.parse('2026-11-16T12:00:00.000Z')
    const edge = created + HOUDINI_MODE_SETTLE_MS + HOUDINI_MODE_LAG_MS
    expect(isHoudiniModeSettled(created, edge - 1)).to.equal(false)
    expect(isHoudiniModeSettled(created, edge)).to.equal(true)
  })

  it('throws when PostHog says it cut the result short', function() {
    expect(() =>
      parseHoudiniModeRows({
        results: [['a', 'swap', '2026-11-12T07:42:07.192000Z']],
        hasMore: true
      })
    ).to.throw('rows')
  })

  it('matches a mixed-case order id after an earlier partner stored it', async function() {
    const created = new Date(Date.now() - 3 * HOUR).toISOString()
    const fetchPage: FetchHoudiniPage = async () => ({
      orders: [makeOrder({ houdiniId: 'AbCdEf12', created, anonymous: false })],
      totalPages: 1
    })
    const fetchModes: FetchHoudiniModes = async () =>
      parseHoudiniModeRows({
        results: [
          [
            'AbCdEf12',
            'swapSend',
            new Date(Date.now() - 3 * HOUR + 1000).toISOString()
          ]
        ]
      })
    const cache = makeHoudiniWalkCache(HOUR)
    const query = async (mode: HoudiniMode): Promise<string[]> => {
      const params = makeParams({
        apiKeys: { apiKey: 'key', apiSecret: 'secret' },
        settings: { latestIsoDate: new Date(Date.now() - HOUR).toISOString() }
      })
      const result = await queryHoudini(
        params,
        mode,
        fetchPage,
        fetchModes,
        cache
      )
      // What the query engine does to each transaction it stores:
      for (const tx of result.transactions)
        tx.orderId = tx.orderId.toLowerCase()
      return result.transactions.map(tx => tx.orderId)
    }
    expect(await query('swapSend')).to.deep.equal(['abcdef12'])
    expect(await query('swap')).to.deep.equal([])
    expect(await query('swapSend')).to.deep.equal(['abcdef12'])
  })
})

describe('makeHoudiniModeQueries', function() {
  it('asks only about the given orders, lowercased and deduplicated', function() {
    const [query, ...rest] = makeHoudiniModeQueries(0, 1000, [
      'AbC1',
      'abc1',
      'x_y-2'
    ])
    expect(rest).to.deep.equal([])
    expect(query).to.contain("lower(properties.orderId) IN ('abc1', 'x_y-2')")
  })

  it('leaves out an id that could change the query', function() {
    const queries = makeHoudiniModeQueries(0, 1000, [
      "a') OR 1=1 --",
      'ok1',
      ''
    ])
    expect(queries.length).to.equal(1)
    expect(queries[0]).to.contain("IN ('ok1')")
    expect(queries[0]).not.to.contain('OR 1=1')
  })

  it('splits the ids into batches and sends none for no orders', function() {
    const ids = Array.from(
      { length: POSTHOG_ORDER_ID_BATCH * 2 + 1 },
      (_, i) => `o${i}`
    )
    expect(makeHoudiniModeQueries(0, 1000, ids).length).to.equal(3)
    expect(makeHoudiniModeQueries(0, 1000, [])).to.deep.equal([])
  })
})

describe('queryHoudini mode lookup', function() {
  it('asks PostHog about the orders the walk read', async function() {
    const created = new Date(Date.now() - 3 * HOUR).toISOString()
    const fetchPage: FetchHoudiniPage = async () => ({
      orders: [
        makeOrder({ houdiniId: 'One1', created, anonymous: false }),
        makeOrder({ houdiniId: 'two2', created, anonymous: true })
      ],
      totalPages: 1
    })
    const asked: string[][] = []
    const fetchModes: FetchHoudiniModes = async (fromMs, toMs, orderIds) => {
      asked.push(orderIds)
      return new Map()
    }
    const params = makeParams({
      apiKeys: { apiKey: 'key', apiSecret: 'secret' },
      settings: { latestIsoDate: new Date(Date.now() - HOUR).toISOString() }
    })
    await queryHoudini(params, 'swap', fetchPage, fetchModes)
    expect(asked).to.deep.equal([['One1', 'two2']])
  })

  it('raises an emergency when a hold nears the 48-hour edge', async function() {
    const HOLD = 48 * HOUR
    const run = async (ageMs: number): Promise<string[]> => {
      const created = new Date(Date.now() - ageMs).toISOString()
      const fetchPage: FetchHoudiniPage = async () => ({
        orders: [makeOrder({ houdiniId: 'held', created, anonymous: false })],
        totalPages: 1
      })
      const fetchModes: FetchHoudiniModes = async () => {
        throw new Error('PostHog error 503')
      }
      const params = makeParams({
        apiKeys: { apiKey: 'key', apiSecret: 'secret' },
        settings: { latestIsoDate: new Date(Date.now() - HOUR).toISOString() }
      })
      await queryHoudini(params, 'swap', fetchPage, fetchModes)
      return params.errors.filter(error => error.includes('EMERGENCY'))
    }
    expect(await run(3 * HOUR)).to.deep.equal([])
    expect((await run(HOLD - HOUDINI_HOLD_ALARM_MS + HOUR)).length).to.equal(1)
  })
})

describe('getHeldOrderLossMs', function() {
  it('is when the oldest settled order leaves the window', function() {
    const nowMs = Date.parse('2026-11-17T12:00:00.000Z')
    const tx = (ageMs: number): { timestamp: number } => ({
      timestamp: (nowMs - ageMs) / 1000
    })
    const txs = ([
      tx(10 * HOUR),
      tx(30 * HOUR),
      tx(HOUR / 2)
    ] as unknown) as Parameters<typeof getHeldOrderLossMs>[0]
    expect(getHeldOrderLossMs(txs, nowMs)).to.equal(
      nowMs - 30 * HOUR + 48 * HOUR
    )
    expect(
      getHeldOrderLossMs(([tx(HOUR / 2)] as unknown) as typeof txs, nowMs)
    ).to.equal(undefined)
  })
})
