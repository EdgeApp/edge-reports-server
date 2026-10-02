import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  FetchMptradePage,
  processMptradeTx,
  processMptradeTxs,
  queryMptrade
} from '../src/partners/mptrade'
import { PluginParams, ScopedLog } from '../src/types'

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

const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000'

interface Token {
  address: string
  symbol: string
  decimals: number
  chainId: number
  isNative: boolean
}

const ethereumUsdt: Token = {
  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  symbol: 'USDT',
  decimals: 6,
  chainId: 1,
  isNative: false
}
const bitcoin: Token = {
  address: NATIVE_ADDRESS,
  symbol: 'BTC',
  decimals: 8,
  chainId: 999000313,
  isNative: true
}
const solanaUsdc: Token = {
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  decimals: 6,
  chainId: 1399811149,
  isNative: false
}
const hypercoreUsdc: Token = {
  address: '0x6d1e7cde53ba9467b783cb7c530ce054',
  symbol: 'USDC',
  decimals: 8,
  chainId: 1337,
  isNative: false
}
const filecoin: Token = {
  address: NATIVE_ADDRESS,
  symbol: 'FIL',
  decimals: 18,
  chainId: 314,
  isNative: true
}

interface OrderOptions {
  txId?: string
  status?: string
  srcToken?: Token
  dstToken?: Token
  timestamp?: number | string
  settled?: boolean
}

// Shaped like a GET /getTransactions row. An unsettled order has no payout
// leg yet, which MoonPay Trade reports as null dstTx and dstTxHash.
const makeOrder = (opts: OrderOptions = {}): unknown => {
  const {
    txId = '0xorder1',
    status = 'success',
    srcToken = ethereumUsdt,
    dstToken = bitcoin,
    timestamp = 1790959163,
    settled = true
  } = opts
  return {
    txId,
    status,
    sender: '0x1111111111111111111111111111111111111111',
    srcChainId: srcToken.chainId,
    dstChainId: dstToken.chainId,
    srcTxHash: `${txId}-src`,
    dstTxHash: settled ? `${txId}-dst` : null,
    usdValue: 2499.5,
    usdRates: { srcToken: 0.9998, dstToken: 85148, timestamp: 1790959167929 },
    srcTx: {
      toAddress: '0x2222222222222222222222222222222222222222',
      txHash: `${txId}-src`,
      chainId: srcToken.chainId,
      value: '0',
      timestamp,
      paymentToken: { ...srcToken, amount: '2500000000', usdAmount: 2499.5 },
      revertReason: null
    },
    dstTx: settled
      ? {
          toAddress: 'bc1qpayoutaddress',
          txHash: `${txId}-dst`,
          chainId: dstToken.chainId,
          value: '2930000',
          timestamp: 1790959763,
          paymentToken: { ...dstToken, amount: '2930000', usdAmount: 2494.8 },
          revertReason: null
        }
      : null,
    actionRequest: {
      actionType: 'swap-action',
      recipient: 'bc1qrecipientaddress'
    },
    actionResponse: {
      txId,
      vmId: 'evm',
      amountIn: { ...srcToken, amount: '2500000000', usdAmount: 2499.5 },
      amountOut: { ...dstToken, amount: '2940000', usdAmount: 2503.3 }
    }
  }
}

describe('processMptradeTx', function() {
  it('maps a settled token to native order', function() {
    const tx = processMptradeTx(makeOrder(), makeParams())

    expect(tx.status).to.equal('complete')
    expect(tx.orderId).to.equal('0xorder1')
    expect(tx.exchangeType).to.equal('swap')

    expect(tx.depositTxid).to.equal('0xorder1-src')
    expect(tx.depositAddress).to.equal(
      '0x2222222222222222222222222222222222222222'
    )
    expect(tx.depositCurrency).to.equal('USDT')
    expect(tx.depositChainPluginId).to.equal('ethereum')
    expect(tx.depositEvmChainId).to.equal(1)
    expect(tx.depositTokenId).to.equal(
      'dac17f958d2ee523a2206206994597c13d831ec7'
    )
    expect(tx.depositAmount).to.equal(2500)

    expect(tx.payoutTxid).to.equal('0xorder1-dst')
    expect(tx.payoutAddress).to.equal('bc1qrecipientaddress')
    expect(tx.payoutCurrency).to.equal('BTC')
    expect(tx.payoutChainPluginId).to.equal('bitcoin')
    expect(tx.payoutEvmChainId).to.equal(undefined)
    expect(tx.payoutTokenId).to.equal(null)
    expect(tx.payoutAmount).to.equal(0.0293)

    expect(tx.timestamp).to.equal(1790959163)
    expect(tx.isoDate).to.equal('2026-10-02T16:39:23.000Z')
    expect(tx.usdValue).to.equal(2499.5)
  })

  it('falls back to the quoted payout while the order is unsettled', function() {
    const tx = processMptradeTx(
      makeOrder({ status: 'pending', settled: false }),
      makeParams()
    )

    expect(tx.status).to.equal('pending')
    expect(tx.payoutTxid).to.equal(undefined)
    expect(tx.payoutCurrency).to.equal('BTC')
    expect(tx.payoutChainPluginId).to.equal('bitcoin')
    expect(tx.payoutAmount).to.equal(0.0294)
    expect(tx.payoutAddress).to.equal('bc1qrecipientaddress')
  })

  it('maps every documented status', function() {
    const expected: { [status: string]: string } = {
      success: 'complete',
      completed: 'complete',
      submitted: 'processing',
      pending: 'pending',
      'not yet created': 'pending',
      'requires refund': 'refunded',
      refunded: 'refunded',
      failed: 'failed',
      expired: 'expired',
      'some new status': 'other'
    }
    for (const status of Object.keys(expected)) {
      const tx = processMptradeTx(makeOrder({ status }), makeParams())
      expect(tx.status, status).to.equal(expected[status])
    }
  })

  it('warns about a status it does not know', function() {
    const params = makeParams()
    processMptradeTx(makeOrder({ status: 'some new status' }), params)
    expect(params.warnings.join('\n')).to.include(
      'unknown status "some new status"'
    )

    const known = makeParams()
    processMptradeTx(makeOrder({ status: 'success' }), known)
    expect(known.warnings).to.deep.equal([])
  })

  it('uses the chain token id format on non-EVM chains', function() {
    const tx = processMptradeTx(
      makeOrder({ srcToken: solanaUsdc }),
      makeParams()
    )

    expect(tx.depositChainPluginId).to.equal('solana')
    expect(tx.depositEvmChainId).to.equal(undefined)
    expect(tx.depositTokenId).to.equal(
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    )
  })

  it('reads chain 314 as native Filecoin, not Filecoin FEVM', function() {
    const tx = processMptradeTx(makeOrder({ srcToken: filecoin }), makeParams())

    expect(tx.depositChainPluginId).to.equal('filecoin')
    expect(tx.depositEvmChainId).to.equal(undefined)
    expect(tx.depositTokenId).to.equal(null)
  })

  it('keeps an order on a chain with no token id format', function() {
    const tx = processMptradeTx(
      makeOrder({ dstToken: hypercoreUsdc }),
      makeParams()
    )

    expect(tx.payoutChainPluginId).to.equal('hypercore')
    expect(tx.payoutTokenId).to.equal(undefined)
    expect(tx.payoutCurrency).to.equal('USDC')
  })

  it('keeps an order on an unknown chain and warns', function() {
    const params = makeParams()
    const tx = processMptradeTx(
      makeOrder({ dstToken: { ...bitcoin, chainId: 424242 } }),
      params
    )

    expect(tx.payoutChainPluginId).to.equal(undefined)
    expect(tx.payoutTokenId).to.equal(undefined)
    expect(tx.payoutAmount).to.equal(0.0293)
    expect(params.warnings.join('\n')).to.include('unknown chain id 424242')
  })

  it('leaves the token id unset for a token on a chain without tokens', function() {
    const params = makeParams()
    const tx = processMptradeTx(
      makeOrder({
        dstToken: { ...bitcoin, address: '0xabc', isNative: false }
      }),
      params
    )

    expect(tx.payoutChainPluginId).to.equal('bitcoin')
    expect(tx.payoutTokenId).to.equal(undefined)
    expect(params.warnings.join('\n')).to.include('no token id for BTC')
  })

  it('accepts the numeric-string timestamp of older records', function() {
    const tx = processMptradeTx(
      makeOrder({ timestamp: '1790959163' }),
      makeParams()
    )

    expect(tx.timestamp).to.equal(1790959163)
    expect(tx.isoDate).to.equal('2026-10-02T16:39:23.000Z')
  })
})

describe('processMptradeTxs', function() {
  it('skips and logs an unprocessable order and keeps the rest of the page', function() {
    const params = makeParams()
    const result = processMptradeTxs(
      [
        makeOrder({ txId: '0xgood1' }),
        { txId: '0xbad', status: 'success' },
        makeOrder({ txId: '0xgood2' })
      ],
      params
    )

    expect(result.skipped).to.equal(1)
    expect(result.standardTxs.map(tx => tx.orderId)).to.deep.equal([
      '0xgood1',
      '0xgood2'
    ])
    const skipLog = params.errors.find(message => message.includes('skipping'))
    expect(skipLog).to.include('Missing token details')
    expect(skipLog).to.include('txId=0xbad')
  })
})

describe('queryMptrade', function() {
  it('returns nothing without calling the API when no key is configured', async function() {
    let calls = 0
    const fetchPage: FetchMptradePage = async () => {
      calls++
      return { txs: [], cursor: { next: null } }
    }
    const result = await queryMptrade(
      makeParams({ apiKeys: { apiKey: '' } }),
      fetchPage
    )

    expect(calls).to.equal(0)
    expect(result.transactions).to.deep.equal([])
  })

  it('follows the cursor, dedupes across blocks, and advances progress', async function() {
    const calls: Array<{
      apiKey: string
      startDate: number
      endDate: number
      cursor: string | undefined
    }> = []
    const fetchPage: FetchMptradePage = async (
      apiKey,
      startDate,
      endDate,
      cursor
    ) => {
      calls.push({ apiKey, startDate, endDate, cursor })
      if (cursor == null) {
        return {
          txs: [makeOrder({ txId: '0xa' }), makeOrder({ txId: '0xb' })],
          cursor: { next: 'page2' }
        }
      }
      return { txs: [makeOrder({ txId: '0xc' })], cursor: { next: null } }
    }

    const before = Date.now()
    // Seven days back with a five-day lookback spans three five-day blocks.
    const latestIsoDate = new Date(
      before - 1000 * 60 * 60 * 24 * 7
    ).toISOString()
    const result = await queryMptrade(
      makeParams({ apiKeys: { apiKey: 'key' }, settings: { latestIsoDate } }),
      fetchPage
    )

    // Three blocks of two pages each, every block returning the same orders.
    expect(calls.length).to.equal(6)
    expect(calls.map(call => call.cursor)).to.deep.equal([
      undefined,
      'page2',
      undefined,
      'page2',
      undefined,
      'page2'
    ])
    expect(calls.every(call => call.apiKey === 'key')).to.equal(true)
    // Blocks are contiguous and walked oldest to newest.
    expect(calls[2].startDate).to.equal(calls[0].endDate)
    expect(calls[4].startDate).to.equal(calls[2].endDate)

    expect(result.transactions.map(tx => tx.orderId)).to.deep.equal([
      '0xa',
      '0xb',
      '0xc'
    ])
    expect(new Date(result.settings.latestIsoDate).getTime()).to.be.greaterThan(
      before - 1
    )
  })

  it('narrows a time block that overflows the page cap', async function() {
    const DAY = 60 * 60 * 24
    const spans: number[] = []
    // Any block wider than two days never runs out of pages.
    const fetchPage: FetchMptradePage = async (
      apiKey,
      startDate,
      endDate,
      cursor
    ) => {
      const span = endDate - startDate
      if (cursor == null) spans.push(span)
      if (span > 2 * DAY) return { txs: [], cursor: { next: 'more' } }
      return {
        txs: [makeOrder({ txId: `0x${startDate}` })],
        cursor: { next: null }
      }
    }

    const before = Date.now()
    const params = makeParams({
      apiKeys: { apiKey: 'key' },
      settings: { latestIsoDate: new Date(before).toISOString() }
    })
    const result = await queryMptrade(params, fetchPage)

    // The five-day lookback is tried whole, halved twice, then read in four
    // blocks of at most 1.25 days.
    expect(spans.slice(0, 2).every(span => span > 2 * DAY)).to.equal(true)
    expect(spans.slice(2).every(span => span <= 2 * DAY)).to.equal(true)
    expect(result.transactions.length).to.equal(spans.length - 2)
    expect(new Date(result.settings.latestIsoDate).getTime()).to.be.greaterThan(
      before - 1
    )
    expect(params.warnings.join('\n')).to.include('narrowing the time block')
  })

  it('stops without retrying when the response has the wrong shape', async function() {
    let calls = 0
    const fetchPage: FetchMptradePage = async () => {
      calls++
      return { error: 'nope' }
    }
    const latestIsoDate = new Date().toISOString()
    const params = makeParams({
      apiKeys: { apiKey: 'key' },
      settings: { latestIsoDate }
    })
    const result = await queryMptrade(params, fetchPage)

    expect(calls).to.equal(1)
    expect(result.transactions).to.deep.equal([])
    expect(result.settings.latestIsoDate).to.equal(latestIsoDate)
    expect(params.errors.join('\n')).to.include('unexpected response shape')
  })
})
