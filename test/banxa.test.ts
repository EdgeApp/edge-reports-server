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
 * request count, and the coin catalog with a fixed list. Snoozes return at once
 * and are recorded rather than slept.
 */
const makeIo = (
  respondToOrders: (requestIndex: number) => Response
): BanxaIo & { orderUrls: string[]; snoozes: number[] } => {
  const orderUrls: string[] = []
  const snoozes: number[] = []
  return {
    orderUrls,
    snoozes,
    fetch: async request => {
      const url = String(request)
      if (url.includes('/v2/crypto/')) return jsonResponse(coinCatalog)
      orderUrls.push(url)
      return respondToOrders(orderUrls.length - 1)
    },
    snooze: async ms => {
      snoozes.push(ms)
    }
  }
}

describe('queryBanxa', () => {
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
})
