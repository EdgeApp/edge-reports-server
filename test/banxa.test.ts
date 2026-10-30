import { expect } from 'chai'
import { describe, it } from 'mocha'
import { Response } from 'node-fetch'

import { BanxaIo, queryBanxa } from '../src/partners/banxa'
import { PluginParams, ScopedLog } from '../src/types'

const DAY = 1000 * 60 * 60 * 24

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * DAY).toISOString()

const makeParams = (
  latestIsoDate: string
): PluginParams & { errors: string[]; warnings: string[] } => {
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
  return {
    apiKeys: {
      apiKey: 'key',
      apiKeyV2: 'keyV2',
      partnerId: 'edge',
      partnerUrl: 'https://banxa.test',
      secret: 'secret'
    },
    settings: { latestIsoDate },
    log,
    errors,
    warnings
  }
}

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200 })

const ordersResponse = (orders: unknown[] = []): Response =>
  jsonResponse({ data: { orders } })

const makeOrder = (overrides: { [key: string]: unknown } = {}): unknown => ({
  id: 'order1',
  status: 'complete',
  created_at: '01-Oct-2026 10:00:00',
  country: 'US',
  fiat_amount: 100,
  fiat_code: 'USD',
  coin_amount: 0.001,
  coin_code: 'BTC',
  order_type: 'CRYPTO-BUY',
  payment_type: 'Primer Credit Card',
  wallet_address: 'bc1qexample',
  blockchain: { code: 'BTC', description: 'Bitcoin' },
  ...overrides
})

const coinCatalog = [{ id: 'BTC', blockchains: [{ id: 'BTC' }] }]

/**
 * Answers the orders endpoint from `respondToOrders`, called with the zero-based
 * request count, and the coin catalog from `respondToCatalog`. Snoozes return at
 * once and are recorded rather than slept.
 */
const makeIo = (
  respondToOrders: (requestIndex: number) => Response,
  respondToCatalog: (requestIndex: number) => Response = () =>
    jsonResponse(coinCatalog)
): BanxaIo & { orderUrls: string[]; snoozes: number[] } => {
  const orderUrls: string[] = []
  const snoozes: number[] = []
  let catalogRequests = 0
  return {
    orderUrls,
    snoozes,
    fetch: async request => {
      const url = String(request)
      if (url.includes('/v2/crypto/')) {
        return respondToCatalog(catalogRequests++)
      }
      orderUrls.push(url)
      return respondToOrders(orderUrls.length - 1)
    },
    snooze: async ms => {
      snoozes.push(ms)
    }
  }
}

describe('queryBanxa', () => {
  // Stays first: the plugin caches the catalog for later tests once it loads
  it('retries a transient coin catalog response', async () => {
    const io = makeIo(
      () => ordersResponse([makeOrder()]),
      requestIndex =>
        requestIndex === 0
          ? new Response('unavailable', { status: 503 })
          : jsonResponse(coinCatalog)
    )
    const result = await queryBanxa(makeParams(daysAgo(1)), io)

    expect(result.transactions.length).to.be.greaterThan(0)
    expect(io.snoozes).to.deep.equal([2000])
  })

  it('turns a complete order into a transaction', async () => {
    const io = makeIo(() => ordersResponse([makeOrder()]))
    const result = await queryBanxa(makeParams(daysAgo(1)), io)

    expect(result.transactions.length).to.be.greaterThan(0)
    const [tx] = result.transactions
    expect(tx.orderId).to.equal('order1')
    expect(tx.direction).to.equal('buy')
    expect(tx.paymentType).to.equal('credit')
    expect(tx.payoutChainPluginId).to.equal('bitcoin')
  })

  it('leaves latestIsoDate unchanged when the first window fails', async () => {
    const latestIsoDate = daysAgo(30)
    const io = makeIo(() => new Response('unauthorized', { status: 401 }))
    const result = await queryBanxa(makeParams(latestIsoDate), io)

    expect(result.settings.latestIsoDate).to.equal(latestIsoDate)
  })

  it('does not move latestIsoDate back when it is in the future', async () => {
    const latestIsoDate = new Date(Date.now() + 30 * DAY).toISOString()
    const io = makeIo(() => ordersResponse())
    const result = await queryBanxa(makeParams(latestIsoDate), io)

    expect(io.orderUrls).to.have.length(0)
    expect(result.settings.latestIsoDate).to.equal(latestIsoDate)
  })

  it('keeps earlier windows when a later window fails', async () => {
    const latestIsoDate = daysAgo(30)
    // The first window only re-reads the rollback, the second and third advance
    const io = makeIo(requestIndex =>
      requestIndex < 3
        ? ordersResponse([makeOrder({ id: `order${requestIndex}` })])
        : new Response('unauthorized', { status: 401 })
    )
    const result = await queryBanxa(makeParams(latestIsoDate), io)

    const expected = new Date(
      new Date(latestIsoDate).getTime() + 14 * DAY
    ).toISOString()
    expect(result.settings.latestIsoDate).to.equal(expected)
    expect(result.transactions.map(tx => tx.orderId)).to.deep.equal([
      'order0',
      'order1',
      'order2'
    ])
  })

  it('retries a 429 with backoff and then succeeds', async () => {
    const io = makeIo(requestIndex =>
      requestIndex === 0
        ? new Response('rate limited', { status: 429 })
        : ordersResponse([makeOrder()])
    )
    const params = makeParams(daysAgo(1))
    const result = await queryBanxa(params, io)

    expect(io.snoozes).to.deep.equal([2000])
    expect(io.orderUrls[0]).to.equal(io.orderUrls[1])
    expect(result.transactions.length).to.be.greaterThan(0)
    expect(params.errors).to.deep.equal([])
    expect(params.warnings).to.have.length(1)
  })

  it('gives up on a persistent 5xx after the retry limit', async () => {
    const latestIsoDate = daysAgo(1)
    const io = makeIo(() => new Response('down', { status: 500 }))
    const params = makeParams(latestIsoDate)
    const result = await queryBanxa(params, io)

    expect(io.orderUrls).to.have.length(5)
    expect(io.snoozes).to.deep.equal([2000, 4000, 6000, 8000])
    expect(result.settings.latestIsoDate).to.equal(latestIsoDate)
    expect(params.errors[0]).to.include('500 - down')
  })

  for (const status of [401, 403]) {
    it(`fails on a ${status} without retrying`, async () => {
      const io = makeIo(() => new Response('denied', { status }))
      const params = makeParams(daysAgo(1))
      await queryBanxa(params, io)

      expect(io.orderUrls).to.have.length(1)
      expect(io.snoozes).to.deep.equal([])
      expect(params.errors[0]).to.include(`${status} - denied`)
    })
  }

  it('finishes at the current time when every window succeeds', async () => {
    const before = new Date().toISOString()
    const io = makeIo(() => ordersResponse())
    const result = await queryBanxa(makeParams(daysAgo(30)), io)

    expect(result.settings.latestIsoDate >= before).to.equal(true)
  })
})
