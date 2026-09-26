import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  loadChangellyCurrencyMap,
  makeChangellyCurrencyMap,
  processChangellyTx,
  walkChangellyTxs
} from '../src/partners/changelly'
import { ScopedLog } from '../src/types'

const makeLog = (): { log: ScopedLog; errors: string[] } => {
  const errors: string[] = []
  const log: ScopedLog = Object.assign(() => undefined, {
    warn: () => undefined,
    error: (message: string) => {
      errors.push(message)
    }
  })
  return { log, errors }
}

// A getCurrenciesFull response, trimmed to the fields ingestion reads.
const currencyMap = makeChangellyCurrencyMap({
  jsonrpc: '2.0',
  id: 'test',
  result: [
    {
      name: 'btc',
      ticker: 'btc',
      blockchain: 'bitcoin',
      contractAddress: null
    },
    {
      name: 'usdt20',
      ticker: 'usdt20',
      blockchain: 'ethereum',
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
    },
    {
      name: 'usdtrx',
      ticker: 'usdtrx',
      blockchain: 'tron',
      contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    },
    {
      name: 'eth',
      ticker: 'eth',
      blockchain: 'ethereum',
      contractAddress: ''
    },
    {
      name: 'newcoin',
      ticker: 'newcoin',
      blockchain: 'some_new_chain',
      contractAddress: null
    },
    // A malformed row is dropped without failing the catalog.
    { name: 'broken' }
  ]
})

const makeOrder = (
  id: string,
  currencyFrom: string,
  currencyTo: string,
  createdAt: number = 1790000000
): unknown => ({
  id,
  status: 'finished',
  payinHash: '0xpayin',
  payoutHash: '0xpayout',
  payinAddress: 'bc1qexample',
  currencyFrom,
  amountFrom: '0.05',
  payoutAddress: '0x1111111111111111111111111111111111111111',
  currencyTo,
  amountTo: '3000',
  createdAt
})

describe('processChangellyTx', () => {
  it('stores chain ids for a BTC to USDT (ERC-20) order', () => {
    const { log, errors } = makeLog()
    const tx = processChangellyTx(
      makeOrder('cl-1', 'btc', 'usdt20'),
      currencyMap,
      log
    )

    expect(tx.depositCurrency).to.equal('BTC')
    expect(tx.depositChainPluginId).to.equal('bitcoin')
    expect(tx.depositEvmChainId).to.equal(undefined)
    expect(tx.depositTokenId).to.equal(null)
    expect(tx.payoutCurrency).to.equal('USDT20')
    expect(tx.payoutChainPluginId).to.equal('ethereum')
    expect(tx.payoutEvmChainId).to.equal(1)
    expect(tx.payoutTokenId).to.equal(
      'dac17f958d2ee523a2206206994597c13d831ec7'
    )
    expect(errors).to.deep.equal([])
  })

  it('maps a native EVM asset with an empty contract and a Tron token', () => {
    const { log } = makeLog()
    const tx = processChangellyTx(
      makeOrder('cl-2', 'ETH', 'usdtrx'),
      currencyMap,
      log
    )

    expect(tx.depositChainPluginId).to.equal('ethereum')
    expect(tx.depositEvmChainId).to.equal(1)
    expect(tx.depositTokenId).to.equal(null)
    expect(tx.payoutChainPluginId).to.equal('tron')
    expect(tx.payoutTokenId).to.equal('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
  })

  it('keeps the order but leaves an unresolvable leg without a chain', () => {
    const { log, errors } = makeLog()
    const tx = processChangellyTx(
      makeOrder('cl-3', 'newcoin', 'unlisted'),
      currencyMap,
      log
    )

    expect(tx.orderId).to.equal('cl-3')
    expect(tx.depositChainPluginId).to.equal(undefined)
    expect(tx.depositTokenId).to.equal(undefined)
    expect(tx.payoutChainPluginId).to.equal(undefined)
    expect(tx.payoutTokenId).to.equal(undefined)
    expect(errors.some(e => e.includes('"some_new_chain"'))).to.equal(true)
    expect(errors.some(e => e.includes('ticker unlisted'))).to.equal(true)
  })

  it('stores no chain ids when the catalog failed to load', () => {
    const { log, errors } = makeLog()
    const tx = processChangellyTx(
      makeOrder('cl-4', 'btc', 'usdt20'),
      new Map(),
      log
    )

    expect(tx.depositChainPluginId).to.equal(undefined)
    expect(tx.payoutChainPluginId).to.equal(undefined)
    expect(errors).to.deep.equal([])
  })
})

describe('walkChangellyTxs', () => {
  // A cursor rewound to 2026-06-01 for a backfill.
  const rewound = {
    latestTimeStamp: 1780272000,
    firstAttempt: false,
    offset: 0
  }

  it('keeps a rewound cursor when the walk errors before reaching it', async () => {
    const { log, errors } = makeLog()
    const pages: unknown[] = [
      {
        result: [
          makeOrder('cl-new', 'btc', 'usdt20', 1790000000),
          makeOrder('cl-mid', 'btc', 'usdt20', 1785000000)
        ]
      },
      // getTransactionsPromised resolves the SDK error code on failure.
      -32600
    ]
    const result = await walkChangellyTxs(
      async offset => pages[offset / 300],
      currencyMap,
      rewound,
      log
    )

    expect(result.transactions.map(tx => tx.orderId)).to.deep.equal([
      'cl-new',
      'cl-mid'
    ])
    expect(result.settings.latestTimeStamp).to.equal(1780272000)
    expect(errors).to.have.length(1)
  })

  it('skips and logs an unprocessable order and walks past it', async () => {
    const { log, errors } = makeLog()
    const broken = {
      ...(makeOrder('cl-bad', 'btc', 'usdt20', 1785000000) as object),
      payinHash: undefined
    }
    const result = await walkChangellyTxs(
      async () => ({
        result: [
          makeOrder('cl-new', 'btc', 'usdt20', 1790000000),
          broken,
          makeOrder('cl-old', 'btc', 'usdt20', 1779000000)
        ]
      }),
      currencyMap,
      rewound,
      log
    )

    expect(result.transactions.map(tx => tx.orderId)).to.deep.equal([
      'cl-new',
      'cl-old'
    ])
    expect(result.settings.latestTimeStamp).to.equal(1790000000)
    expect(errors).to.have.length(1)
    expect(errors[0]).to.include('skipping unprocessable order')
    expect(errors[0]).to.include('cl-bad')
  })

  it('advances a first-attempt cursor on error, resuming from its offset', async () => {
    const { log } = makeLog()
    const pages: unknown[] = [
      { result: [makeOrder('cl-new', 'btc', 'usdt20', 1790000000)] },
      -32600
    ]
    const result = await walkChangellyTxs(
      async offset => pages[offset / 300],
      currencyMap,
      { latestTimeStamp: 0, firstAttempt: true, offset: 0 },
      log
    )

    expect(result.settings).to.deep.equal({
      latestTimeStamp: 1790000000,
      firstAttempt: true,
      offset: 300
    })
  })

  it('advances the cursor once the walk passes the lookback', async () => {
    const { log, errors } = makeLog()
    const result = await walkChangellyTxs(
      async () => ({
        result: [
          makeOrder('cl-new', 'btc', 'usdt20', 1790000000),
          makeOrder('cl-old', 'btc', 'usdt20', 1779000000)
        ]
      }),
      currencyMap,
      rewound,
      log
    )

    expect(result.transactions).to.have.length(2)
    expect(result.settings.latestTimeStamp).to.equal(1790000000)
    expect(errors).to.deep.equal([])
  })
})

describe('loadChangellyCurrencyMap', () => {
  it('logs an empty catalog as an error', async () => {
    const { log, errors } = makeLog()
    const sdk = {
      _request: (
        _method: string,
        _params: unknown,
        callback: (err: unknown, data: unknown) => void
      ) => callback(null, { jsonrpc: '2.0', id: 'test', result: [] })
    }
    const map = await loadChangellyCurrencyMap(sdk, log)

    expect(map.size).to.equal(0)
    expect(errors).to.have.length(1)
    expect(errors[0]).to.include('0 entries')
  })
})
