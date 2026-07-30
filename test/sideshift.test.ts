import { expect } from 'chai'
import { describe, it } from 'mocha'

import { getSideshiftAccounts, querySideshift } from '../src/partners/sideshift'
import { ScopedLog, StandardTx } from '../src/types'

// Mirrors QUERY_LOOKBACK in src/partners/sideshift.ts (5 days). The plugin
// starts each account a lookback window before its cursor.
const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5

interface FakeAccount {
  affiliateId: string
  affiliateSecret: string
}
interface RawOrder {
  orderId: string
  isoDate: string
}
interface Captured {
  affiliateId: string
  startTime: number
}

// Silent logger so test output stays clean; the plugin never branches on it.
const noopLog: ScopedLog = Object.assign(() => undefined, {
  warn: () => undefined,
  error: () => undefined
})

const makeTx = (orderId: string, isoDate: string): StandardTx => ({
  orderId,
  countryCode: null,
  depositTxid: undefined,
  depositAddress: 'deposit-address',
  depositCurrency: 'BTC',
  depositChainPluginId: 'bitcoin',
  depositEvmChainId: undefined,
  depositTokenId: null,
  depositAmount: 1,
  direction: undefined,
  exchangeType: 'swap',
  paymentType: null,
  payoutTxid: undefined,
  payoutAddress: 'payout-address',
  payoutCurrency: 'ETH',
  payoutChainPluginId: 'ethereum',
  payoutEvmChainId: 1,
  payoutTokenId: null,
  payoutAmount: 2,
  status: 'complete',
  isoDate,
  timestamp: new Date(isoDate).getTime() / 1000,
  usdValue: -1,
  rawTx: { id: orderId }
})

const processOrder = async (rawTx: unknown): Promise<StandardTx> => {
  const order = rawTx as RawOrder
  return makeTx(order.orderId, order.isoDate)
}

// Returns the configured orders for an affiliateId on the FIRST call, then an
// empty array so the per-account query loop terminates deterministically
// without touching the live Sideshift API.
const makeFakeFetcher = (ordersByAffiliateId: {
  [affiliateId: string]: RawOrder[]
}): {
  fetchOrders: (
    account: FakeAccount,
    startTime: number,
    now: number
  ) => Promise<unknown[]>
  calls: Captured[]
} => {
  const calls: Captured[] = []
  const served = new Set<string>()
  const fetchOrders = async (
    account: FakeAccount,
    startTime: number
  ): Promise<unknown[]> => {
    calls.push({ affiliateId: account.affiliateId, startTime })
    if (served.has(account.affiliateId)) return []
    served.add(account.affiliateId)
    return ordersByAffiliateId[account.affiliateId] ?? []
  }
  return { fetchOrders, calls }
}

const firstStartTimeFor = (calls: Captured[], affiliateId: string): number => {
  const call = calls.find(c => c.affiliateId === affiliateId)
  if (call == null) throw new Error(`no fetch for ${affiliateId}`)
  return call.startTime
}

describe('getSideshiftAccounts', function() {
  it('returns one account when no added account is configured', function() {
    const accounts = getSideshiftAccounts({
      sideshiftAffiliateId: 'PRIMARY',
      sideshiftAffiliateSecret: 'sprimary',
      sideshiftAffiliateId2: undefined,
      sideshiftAffiliateSecret2: undefined
    })
    expect(accounts).to.deep.equal([
      { affiliateId: 'PRIMARY', affiliateSecret: 'sprimary' }
    ])
  })

  it('returns both accounts when an added account is configured', function() {
    const accounts = getSideshiftAccounts({
      sideshiftAffiliateId: 'PRIMARY',
      sideshiftAffiliateSecret: 'sprimary',
      sideshiftAffiliateId2: 'ADDED',
      sideshiftAffiliateSecret2: 'sadded'
    })
    expect(accounts).to.deep.equal([
      { affiliateId: 'PRIMARY', affiliateSecret: 'sprimary' },
      { affiliateId: 'ADDED', affiliateSecret: 'sadded' }
    ])
  })

  it('dedupes when the added affiliateId equals the primary', function() {
    const accounts = getSideshiftAccounts({
      sideshiftAffiliateId: 'SAME',
      sideshiftAffiliateSecret: 'sprimary',
      sideshiftAffiliateId2: 'SAME',
      sideshiftAffiliateSecret2: 'sadded'
    })
    expect(accounts).to.deep.equal([
      { affiliateId: 'SAME', affiliateSecret: 'sprimary' }
    ])
  })

  it('throws when only one of the added-account fields is configured', function() {
    // A half-configured pair means the operator intended a second account.
    // Silently querying only the primary would hide the misconfiguration.
    expect(() =>
      getSideshiftAccounts({
        sideshiftAffiliateId: 'PRIMARY',
        sideshiftAffiliateSecret: 'sprimary',
        sideshiftAffiliateId2: 'ADDED',
        sideshiftAffiliateSecret2: undefined
      })
    ).to.throw('Sideshift config error')
    expect(() =>
      getSideshiftAccounts({
        sideshiftAffiliateId: 'PRIMARY',
        sideshiftAffiliateSecret: 'sprimary',
        sideshiftAffiliateId2: undefined,
        sideshiftAffiliateSecret2: 'sadded'
      })
    ).to.throw('Sideshift config error')
  })
})

describe('querySideshift dual-account merge', function() {
  it('single account: queries one account and tracks its cursor', async function() {
    const { fetchOrders, calls } = makeFakeFetcher({
      PRIMARY: [{ orderId: 'o1', isoDate: '2025-06-05T00:00:00.000Z' }]
    })
    const result = await querySideshift(
      {
        apiKeys: {
          sideshiftAffiliateId: 'PRIMARY',
          sideshiftAffiliateSecret: 'sprimary'
        },
        settings: {},
        log: noopLog
      },
      fetchOrders,
      processOrder
    )

    expect(result.transactions.map(tx => tx.orderId)).to.deep.equal(['o1'])
    expect(result.settings.latestIsoDate).to.equal('2025-06-05T00:00:00.000Z')
    expect(result.settings.accounts).to.deep.equal({
      PRIMARY: '2025-06-05T00:00:00.000Z'
    })
    // Only the primary account was queried.
    expect(calls.every(c => c.affiliateId === 'PRIMARY')).to.equal(true)
  })

  it('dual account: merges both streams and keeps the max overall cursor', async function() {
    const { fetchOrders, calls } = makeFakeFetcher({
      PRIMARY: [{ orderId: 'n1', isoDate: '2025-06-10T00:00:00.000Z' }],
      ADDED: [{ orderId: 'o1', isoDate: '2025-06-02T00:00:00.000Z' }]
    })
    const result = await querySideshift(
      {
        apiKeys: {
          sideshiftAffiliateId: 'PRIMARY',
          sideshiftAffiliateSecret: 'sprimary',
          sideshiftAffiliateId2: 'ADDED',
          sideshiftAffiliateSecret2: 'sadded'
        },
        settings: {},
        log: noopLog
      },
      fetchOrders,
      processOrder
    )

    expect(
      result.transactions
        .map(tx => tx.orderId)
        .sort((a, b) => a.localeCompare(b))
    ).to.deep.equal(['n1', 'o1'])
    // Overall cursor is the newest order across both accounts.
    expect(result.settings.latestIsoDate).to.equal('2025-06-10T00:00:00.000Z')
    // Per-account cursors track each account independently.
    expect(result.settings.accounts).to.deep.equal({
      PRIMARY: '2025-06-10T00:00:00.000Z',
      ADDED: '2025-06-02T00:00:00.000Z'
    })
    expect(calls.some(c => c.affiliateId === 'PRIMARY')).to.equal(true)
    expect(calls.some(c => c.affiliateId === 'ADDED')).to.equal(true)
  })

  it('legacy progress doc: primary inherits the cursor, the added account backfills from epoch', async function() {
    const { fetchOrders, calls } = makeFakeFetcher({
      PRIMARY: [{ orderId: 'n1', isoDate: '2025-02-10T00:00:00.000Z' }],
      ADDED: [{ orderId: 'o1', isoDate: '2025-02-05T00:00:00.000Z' }]
    })
    const legacyCursor = '2025-01-01T00:00:00.000Z'
    await querySideshift(
      {
        apiKeys: {
          sideshiftAffiliateId: 'PRIMARY',
          sideshiftAffiliateSecret: 'sprimary',
          sideshiftAffiliateId2: 'ADDED',
          sideshiftAffiliateSecret2: 'sadded'
        },
        // No `accounts` map: simulates a progress doc written before this change.
        settings: { latestIsoDate: legacyCursor },
        log: noopLog
      },
      fetchOrders,
      processOrder
    )

    // Primary keeps the pre-existing watermark...
    expect(firstStartTimeFor(calls, 'PRIMARY')).to.equal(
      new Date(legacyCursor).getTime() - QUERY_LOOKBACK
    )
    // ...while the newly-added account backfills from the epoch default
    // (1970 - lookback is negative, clamped to 0) so its history is not skipped.
    expect(firstStartTimeFor(calls, 'ADDED')).to.equal(0)
  })

  it('per-account cursors: one account does not skip the other', async function() {
    const { fetchOrders, calls } = makeFakeFetcher({
      PRIMARY: [{ orderId: 'n1', isoDate: '2025-05-10T00:00:00.000Z' }],
      ADDED: [{ orderId: 'o1', isoDate: '2025-03-10T00:00:00.000Z' }]
    })
    await querySideshift(
      {
        apiKeys: {
          sideshiftAffiliateId: 'PRIMARY',
          sideshiftAffiliateSecret: 'sprimary',
          sideshiftAffiliateId2: 'ADDED',
          sideshiftAffiliateSecret2: 'sadded'
        },
        settings: {
          latestIsoDate: '2025-01-01T00:00:00.000Z',
          accounts: {
            PRIMARY: '2025-05-01T00:00:00.000Z',
            ADDED: '2025-03-01T00:00:00.000Z'
          }
        },
        log: noopLog
      },
      fetchOrders,
      processOrder
    )

    // Each account resumes from its OWN cursor, not the shared/legacy one.
    expect(firstStartTimeFor(calls, 'PRIMARY')).to.equal(
      new Date('2025-05-01T00:00:00.000Z').getTime() - QUERY_LOOKBACK
    )
    expect(firstStartTimeFor(calls, 'ADDED')).to.equal(
      new Date('2025-03-01T00:00:00.000Z').getTime() - QUERY_LOOKBACK
    )
  })

  it('does not skip an unprocessable order: it aborts the page and holds the cursor', async function() {
    // Reviewer preference (peachbits): an unprocessable order (e.g. an unmapped
    // coin or network) must fail loudly rather than be silently skipped. A
    // stopped account is noticed; a stray "skipped order" log is not. The thrown
    // error surfaces through the block-level retry path, so the order is never
    // recorded and the cursor never advances past it. The block-level retry
    // snoozes once before the fake fetcher empties, so allow for that.
    this.timeout(20000)
    const { fetchOrders } = makeFakeFetcher({
      PRIMARY: [{ orderId: 'bad', isoDate: '2025-06-02T00:00:00.000Z' }]
    })
    const throwingProcess = async (): Promise<StandardTx> => {
      throw new Error('Unknown network: bsv')
    }
    const result = await querySideshift(
      {
        apiKeys: {
          sideshiftAffiliateId: 'PRIMARY',
          sideshiftAffiliateSecret: 'sprimary'
        },
        settings: {},
        log: noopLog
      },
      fetchOrders,
      throwingProcess
    )

    // Nothing is recorded and the cursor stays at the epoch default rather than
    // advancing past unreported revenue.
    expect(result.transactions).to.deep.equal([])
    expect(result.settings.accounts.PRIMARY).to.equal(
      '1970-01-01T00:00:00.000Z'
    )
  })
})
