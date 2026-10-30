import { expect } from 'chai'
import { createServer, Server } from 'http'
import { after, before, beforeEach, describe, it } from 'mocha'
import { AddressInfo } from 'net'
import { Response } from 'node-fetch'

import { config } from '../src/config'
import { BanxaIo, queryBanxa } from '../src/partners/banxa'
import { PluginParams, ScopedLog, StandardTx } from '../src/types'

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
    expect(result.error).to.include('401 - unauthorized')
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
    expect(result.error).to.include('401 - unauthorized')
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

  it('keeps an order with an unmapped payment type', async () => {
    const io = makeIo(requestIndex =>
      requestIndex === 0
        ? ordersResponse([
            makeOrder({ id: 'unmapped', payment_type: 'Mystery Pay' }),
            makeOrder({ id: 'mapped' })
          ])
        : ordersResponse()
    )
    const before = new Date().toISOString()
    const params = makeParams(daysAgo(1))
    const result = await queryBanxa(params, io)

    expect(result.transactions.map(tx => tx.paymentType)).to.deep.equal([
      null,
      'credit'
    ])
    expect(result.transactions[0].orderId).to.equal('unmapped')
    expect(result.error).to.equal(undefined)
    expect(result.settings.latestIsoDate >= before).to.equal(true)
    expect(params.warnings).to.deep.equal([
      'Unknown payment method: Mystery Pay for unmapped'
    ])
  })

  const queryOneOrder = async (overrides: {
    [key: string]: unknown
  }): Promise<StandardTx> => {
    const io = makeIo(() => ordersResponse([makeOrder(overrides)]))
    const result = await queryBanxa(makeParams(daysAgo(1)), io)
    return result.transactions[0]
  }

  it('sets payoutTxid from tx_hash on a complete buy', async () => {
    const tx = await queryOneOrder({ tx_hash: 'hash1' })

    expect(tx.payoutTxid).to.equal('hash1')
    expect(tx.depositTxid).to.equal(undefined)
  })

  it('sets depositTxid from tx_hash on a sell', async () => {
    const tx = await queryOneOrder({
      order_type: 'CRYPTO-SELL',
      tx_hash: 'hash1'
    })

    expect(tx.depositTxid).to.equal('hash1')
    expect(tx.payoutTxid).to.equal(undefined)
  })

  it('accepts a null or missing tx_hash', async () => {
    for (const overrides of [{ tx_hash: null }, {}]) {
      const tx = await queryOneOrder(overrides)

      expect(tx.orderId).to.equal('order1')
      expect(tx.payoutTxid).to.equal(undefined)
    }
  })

  it('finishes at the current time when every window succeeds', async () => {
    const before = new Date().toISOString()
    const io = makeIo(() => ordersResponse())
    const result = await queryBanxa(makeParams(daysAgo(30)), io)

    expect(result.settings.latestIsoDate >= before).to.equal(true)
    expect(result.error).to.equal(undefined)
  })
})

describe('runPlugin with the Banxa plugin', () => {
  const realCouchDbFullpath = config.couchDbFullpath
  let runPlugin: typeof import('../src/queryEngine').runPlugin
  let server: Server
  let serverUrl: string

  // Stands in for both Couch and Banxa, since runPlugin talks to them directly
  let progressDoc: { progressCache: { latestIsoDate: string } } | undefined
  let progressSaves: number
  let orderRequests: number
  let orderStatus: (requestIndex: number) => number

  before(async function() {
    this.timeout(60000)
    server = createServer((request, response) => {
      const send = (status: number, body: unknown): void => {
        response.writeHead(status, {
          Connection: 'close',
          'Content-Type': 'application/json'
        })
        response.end(JSON.stringify(body))
      }
      const url = request.url ?? ''
      if (!url.startsWith('/reports_progresscache')) {
        const status = orderStatus(orderRequests++)
        send(status, status === 200 ? { data: { orders: [] } } : 'denied')
      } else if (request.method === 'GET') {
        if (progressDoc == null) send(404, { error: 'not_found' })
        else send(200, progressDoc)
      } else {
        let body = ''
        request.on('data', chunk => {
          body += String(chunk)
        })
        request.on('end', () => {
          progressDoc = JSON.parse(body)
          progressSaves++
          send(201, { ok: true, id: 'progress', rev: `${progressSaves}-rev` })
        })
      }
    })
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const { port } = server.address() as AddressInfo
    serverUrl = `http://127.0.0.1:${port}`

    // The engine binds its database connection to this value when it loads
    config.couchDbFullpath = serverUrl
    ;({ runPlugin } = await import('../src/queryEngine'))
  })

  after(done => {
    config.couchDbFullpath = realCouchDbFullpath
    server.close(done)
  })

  beforeEach(() => {
    progressSaves = 0
    orderRequests = 0
  })

  const runBanxa = async (): Promise<string> =>
    await runPlugin({
      app: {
        _id: 'edge',
        _rev: '1-rev',
        appId: 'edge',
        appName: 'Edge',
        partnerIds: {
          banxa: {
            pluginId: 'banxa',
            revShareRate: undefined,
            apiKeys: {
              apiKey: 'key',
              apiKeyV2: 'keyV2',
              partnerId: 'edge',
              partnerUrl: serverUrl,
              secret: 'secret'
            }
          }
        }
      },
      partnerId: 'banxa',
      pluginId: 'banxa'
    })

  const startProgressAt = (latestIsoDate: string): void => {
    progressDoc = { progressCache: { latestIsoDate } }
  }

  it('reports repeated 401s as failures and keeps progress', async () => {
    const latestIsoDate = daysAgo(30)
    startProgressAt(latestIsoDate)
    orderStatus = () => 401

    for (let run = 1; run <= 3; run++) {
      const status = await runBanxa()

      expect(status).to.include('banxa Error:')
      expect(status).to.include('401')
      expect(status).to.not.include('Successful')
      expect(progressDoc?.progressCache.latestIsoDate).to.equal(latestIsoDate)
    }
    expect(orderRequests).to.equal(3)
  })

  it('saves completed windows and then reports the failure', async () => {
    const latestIsoDate = daysAgo(30)
    startProgressAt(latestIsoDate)
    orderStatus = requestIndex => (requestIndex < 3 ? 200 : 401)

    const status = await runBanxa()

    expect(status).to.include('banxa Error:')
    expect(progressSaves).to.equal(1)
    expect(progressDoc?.progressCache.latestIsoDate).to.equal(
      new Date(new Date(latestIsoDate).getTime() + 14 * DAY).toISOString()
    )
  })

  it('reports success when every window completes', async () => {
    const latestIsoDate = daysAgo(30)
    startProgressAt(latestIsoDate)
    orderStatus = () => 200

    const status = await runBanxa()

    expect(status).to.include('Successful update')
    const savedDate = progressDoc?.progressCache.latestIsoDate ?? ''
    expect(savedDate > latestIsoDate).to.equal(true)
  })
})
