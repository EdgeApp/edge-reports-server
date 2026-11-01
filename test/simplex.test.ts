import { expect } from 'chai'
import { createServer, RequestListener } from 'http'
import { describe, it } from 'mocha'
import { AddressInfo, Socket } from 'net'
import { Response } from 'node-fetch'

import { querySimplex, SimplexIo } from '../src/partners/simplex'
import { PluginParams, ScopedLog } from '../src/types'
import { retryFetch } from '../src/util'

const DAY = 60 * 60 * 24
const nowSeconds = (): number => Date.now() / 1000

// The sample response Simplex sent us, with the placeholder fields filled in.
const makePayment = (overrides: { [key: string]: unknown } = {}): unknown => ({
  payment_id: '3fa85224-5717-4562-b3fc-2c963f66afa6',
  created_at: '2024-10-14T12:24:19.719Z',
  payment_status: 'approved',
  blockchain_txn_id: 'c8358813047e32a24ab88dbeed5452a81f3cbdb299bc33dc603fe07c',
  network_fee: { amount: 0.0045, currency: 'BTC' },
  payment_method: 'credit_card',
  fiat_total: { amount: 123.45, amount_usd: 200.5, currency: 'GBP' },
  crypto_total: { amount: 0.0036443, currency: 'BTC' },
  crypto_fee_total: { amount: 0.0045, currency: 'BTC' },
  references: {
    tracking_reference_id: 'tracking1',
    original_http_ref_url: 'https://url.com',
    order_id: 'order1'
  },
  country: 'GB',
  ...overrides
})

const makePage = (data: unknown[], after?: string): Response =>
  new Response(
    JSON.stringify({
      request_id: 'request1',
      paging: { cursors: { before: 'before1', after } },
      data
    }),
    { status: 200 }
  )

interface Request {
  url: URL
  headers: { [key: string]: string }
}

const makeIo = (
  respond: (requestIndex: number, request: Request) => Response
): SimplexIo & { requests: Request[]; snoozes: number[] } => {
  const requests: Request[] = []
  const snoozes: number[] = []
  return {
    requests,
    snoozes,
    fetch: async (url, init) => {
      const request: Request = {
        url: new URL(String(url)),
        headers: init?.headers as { [key: string]: string }
      }
      requests.push(request)
      return respond(requests.length - 1, request)
    },
    snooze: async ms => {
      snoozes.push(ms)
    }
  }
}

const makeParams = (
  lastTimestamp: number | undefined,
  apiKey: string | undefined = 'testKey'
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
    apiKeys: { apiKey },
    settings: { lastTimestamp },
    log,
    errors,
    warnings
  }
}

/**
 * Runs a query against a loopback server, since only a real socket reproduces a
 * body that never finishes. The plugin's own timeout is recorded, then shortened
 * so the test does not wait it out.
 */
const queryLoopback = async (
  params: PluginParams,
  handler: RequestListener
): Promise<{
  result: Awaited<ReturnType<typeof querySimplex>>
  timeouts: Array<number | undefined>
}> => {
  const sockets: Socket[] = []
  const server = createServer(handler)
  server.on('connection', socket => sockets.push(socket))
  await new Promise<void>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve())
  )
  const { port } = server.address() as AddressInfo

  const timeouts: Array<number | undefined> = []
  const io: SimplexIo = {
    fetch: async (_url, init) => {
      timeouts.push(init?.timeout)
      return await retryFetch(`http://127.0.0.1:${port}/`, {
        ...init,
        timeout: 200
      })
    },
    snooze: async () => undefined
  }
  try {
    return { result: await querySimplex(params, io), timeouts }
  } finally {
    sockets.forEach(socket => socket.destroy())
    server.close()
  }
}

describe('querySimplex', () => {
  it('maps the sample response to a standard transaction', async () => {
    const payment = makePayment()
    const io = makeIo(() => makePage([payment]))
    const result = await querySimplex(makeParams(nowSeconds() - DAY), io)

    expect(result.error).to.equal(undefined)
    expect(result.transactions).to.deep.equal([
      {
        status: 'complete',
        orderId: 'order1',
        countryCode: 'GB',
        depositTxid: undefined,
        depositAddress: undefined,
        depositCurrency: 'GBP',
        depositChainPluginId: undefined,
        depositEvmChainId: undefined,
        depositTokenId: undefined,
        depositAmount: 123.45,
        direction: 'buy',
        exchangeType: 'fiat',
        paymentType: 'credit',
        payoutTxid: 'c8358813047e32a24ab88dbeed5452a81f3cbdb299bc33dc603fe07c',
        payoutAddress: undefined,
        payoutCurrency: 'BTC',
        payoutChainPluginId: undefined,
        payoutEvmChainId: undefined,
        payoutTokenId: undefined,
        payoutAmount: 0.0036443,
        timestamp: 1728908659.719,
        isoDate: '2024-10-14T12:24:19.719Z',
        usdValue: 200.5,
        rawTx: payment
      }
    ])
  })

  it('sends the documented host, auth header and range', async () => {
    const lastTimestamp = nowSeconds() - DAY
    const io = makeIo(() => makePage([]))
    await querySimplex(makeParams(lastTimestamp), io)

    expect(io.requests).to.have.length(1)
    const { url, headers } = io.requests[0]
    expect(url.origin + url.pathname).to.equal(
      'https://backend-wallet-api.simplexcc.com/reporting/v1/payments'
    )
    expect(headers.Authorization).to.equal('ApiKey testKey')
    expect(url.searchParams.get('limit')).to.equal('100')
    expect(url.searchParams.has('cursor')).to.equal(false)
    expect(url.searchParams.get('start_at')).to.equal(
      new Date((lastTimestamp - 5 * DAY) * 1000).toISOString()
    )
  })

  it('walks the cursor until the last page omits it', async () => {
    const io = makeIo(requestIndex =>
      requestIndex === 0
        ? makePage([makePayment({ payment_id: 'p1', references: {} })], 'next1')
        : makePage([makePayment({ payment_id: 'p2', references: {} })])
    )
    const result = await querySimplex(makeParams(nowSeconds() - DAY), io)

    expect(
      io.requests.map(({ url }) => url.searchParams.get('cursor'))
    ).to.eql([null, 'next1'])
    expect(result.transactions.map(tx => tx.orderId)).to.eql(['p1', 'p2'])
  })

  it('stops on an empty page that still returns a cursor', async () => {
    const io = makeIo(() => makePage([], 'next1'))
    await querySimplex(makeParams(nowSeconds() - DAY), io)
    expect(io.requests).to.have.length(1)
  })

  it('splits a long range into windows, oldest first', async () => {
    const io = makeIo(() => makePage([]))
    await querySimplex(makeParams(nowSeconds() - 65 * DAY), io)

    const starts = io.requests.map(({ url }) =>
      String(url.searchParams.get('start_at'))
    )
    expect(starts).to.have.length(3)
    expect(starts[0] < starts[1]).to.equal(true)
    expect(starts[1] < starts[2]).to.equal(true)
    expect(io.requests[0].url.searchParams.get('end_at')).to.equal(starts[1])
  })

  it('advances progress on a run with no payments', async () => {
    const lastTimestamp = nowSeconds() - DAY
    const io = makeIo(() => makePage([]))
    const result = await querySimplex(makeParams(lastTimestamp), io)

    expect(result.settings.lastTimestamp).to.be.greaterThan(lastTimestamp)
    expect(result.error).to.equal(undefined)
  })

  it('floors the query at the API start date', async () => {
    const io = makeIo(() => makePage([]))
    await querySimplex(makeParams(0), io)
    expect(io.requests[0].url.searchParams.get('start_at')).to.equal(
      '2020-08-10T00:00:00.000Z'
    )
  })

  it('starts from the API start date with no saved progress', async () => {
    const io = makeIo(() => makePage([]))
    await querySimplex(makeParams(undefined), io)
    expect(io.requests[0].url.searchParams.get('start_at')).to.equal(
      '2020-08-10T00:00:00.000Z'
    )
  })

  it('makes no request without an API key', async () => {
    const io = makeIo(() => makePage([]))
    const params = makeParams(1000)
    params.apiKeys = {}
    const result = await querySimplex(params, io)

    expect(io.requests).to.have.length(0)
    expect(result).to.deep.equal({
      settings: { lastTimestamp: 1000 },
      transactions: []
    })
  })

  it('reports an auth failure without moving progress', async () => {
    const lastTimestamp = nowSeconds() - DAY
    const io = makeIo(
      () => new Response('{"message":"Invalid API key"}', { status: 401 })
    )
    const params = makeParams(lastTimestamp)
    const result = await querySimplex(params, io)

    expect(result.settings.lastTimestamp).to.equal(lastTimestamp)
    expect(result.transactions).to.have.length(0)
    expect(result.error).to.include('401')
    expect(result.error).to.not.include('testKey')
    expect(params.errors).to.have.length(1)
    expect(io.requests).to.have.length(1)
  })

  it('retries a transient response', async () => {
    const io = makeIo(requestIndex =>
      requestIndex === 0
        ? new Response('unavailable', { status: 503 })
        : makePage([makePayment()])
    )
    const result = await querySimplex(makeParams(nowSeconds() - DAY), io)

    expect(io.snoozes).to.eql([2000])
    expect(result.error).to.equal(undefined)
    expect(result.transactions).to.have.length(1)
  })

  it('keeps completed windows when a later one fails', async () => {
    const lastTimestamp = nowSeconds() - 65 * DAY
    const io = makeIo(requestIndex =>
      requestIndex === 0
        ? makePage([makePayment()])
        : new Response('{"message":"Forbidden"}', { status: 403 })
    )
    const result = await querySimplex(makeParams(lastTimestamp), io)

    expect(result.transactions).to.have.length(1)
    expect(result.error).to.include('403')
    expect(result.settings.lastTimestamp).to.be.closeTo(
      lastTimestamp - 5 * DAY + 30 * DAY,
      1
    )
  })

  it('holds progress when a window fails on a later page', async () => {
    const lastTimestamp = nowSeconds() - DAY
    const io = makeIo(requestIndex =>
      requestIndex === 0
        ? makePage([makePayment()], 'next1')
        : new Response('{"message":"Forbidden"}', { status: 403 })
    )
    const result = await querySimplex(makeParams(lastTimestamp), io)

    expect(result.settings.lastTimestamp).to.equal(lastTimestamp)
    expect(result.transactions).to.have.length(0)
    expect(result.error).to.include('403')
  })

  it('reports a connection cut partway through a page', async () => {
    const lastTimestamp = nowSeconds() - DAY
    const { result, timeouts } = await queryLoopback(
      makeParams(lastTimestamp),
      (_request, response) => {
        response.writeHead(200, { 'Content-Length': '1000' })
        response.write('{"data":[', () => response.socket?.destroy())
      }
    )

    expect(timeouts[0]).to.be.greaterThan(0)
    expect(result.settings.lastTimestamp).to.equal(lastTimestamp)
    expect(result.transactions).to.have.length(0)
    expect(result.error).to.include('Response timeout')
  })

  it('reports a server that never responds', async () => {
    const lastTimestamp = nowSeconds() - DAY
    const { result, timeouts } = await queryLoopback(
      makeParams(lastTimestamp),
      () => undefined
    )

    expect(timeouts[0]).to.be.greaterThan(0)
    expect(result.settings.lastTimestamp).to.equal(lastTimestamp)
    expect(result.transactions).to.have.length(0)
    expect(result.error).to.include('network timeout')
  })

  it('quarantines a malformed payment and keeps the rest', async () => {
    const lastTimestamp = nowSeconds() - DAY
    const io = makeIo(() =>
      makePage([
        makePayment({ fiat_total: { currency: 'GBP' } }),
        makePayment({ payment_id: 'p2', references: {} })
      ])
    )
    const params = makeParams(lastTimestamp)
    const result = await querySimplex(params, io)

    expect(result.transactions.map(tx => tx.orderId)).to.eql(['p2'])
    expect(result.settings.lastTimestamp).to.be.greaterThan(lastTimestamp)
    expect(result.error).to.include('1 payment(s) skipped')
    expect(params.errors[0]).to.include(
      'payment_id=3fa85224-5717-4562-b3fc-2c963f66afa6'
    )
    expect(params.errors[0]).to.not.include('c8358813')
  })

  it('holds progress when the page itself is malformed', async () => {
    const lastTimestamp = nowSeconds() - DAY
    const io = makeIo(
      () => new Response(JSON.stringify({ rows: [] }), { status: 200 })
    )
    const result = await querySimplex(makeParams(lastTimestamp), io)

    expect(result.settings.lastTimestamp).to.equal(lastTimestamp)
    expect(result.error).to.include('data')
  })

  it('maps a refund and keeps an unrecognized status', async () => {
    const io = makeIo(() =>
      makePage([
        makePayment({ payment_status: 'refunded' }),
        makePayment({ payment_status: 'chargeback' })
      ])
    )
    const result = await querySimplex(makeParams(nowSeconds() - DAY), io)

    expect(result.transactions.map(tx => tx.status)).to.eql([
      'refunded',
      'other'
    ])
  })

  it('falls back to payment_id when there is no order id', async () => {
    const io = makeIo(() =>
      makePage([
        makePayment({ payment_id: 'p1', references: undefined }),
        makePayment({ payment_id: 'p2', references: {} }),
        makePayment({ payment_id: 'p3', references: { order_id: null } }),
        makePayment({ payment_id: 'p4', references: { order_id: '' } }),
        makePayment({ payment_id: 'p5', references: { order_id: '  ' } }),
        makePayment({ payment_id: 'p6', references: { order_id: 'order6' } })
      ])
    )
    const result = await querySimplex(makeParams(nowSeconds() - DAY), io)

    expect(result.transactions.map(tx => tx.orderId)).to.eql([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'order6'
    ])
    expect(result.error).to.equal(undefined)
  })

  it('quarantines a payment with no usable id', async () => {
    const lastTimestamp = nowSeconds() - DAY
    const io = makeIo(() =>
      makePage([
        makePayment({ payment_id: '', references: { order_id: '' } }),
        makePayment({ payment_id: 'p2', references: {} })
      ])
    )
    const params = makeParams(lastTimestamp)
    const result = await querySimplex(params, io)

    expect(result.transactions.map(tx => tx.orderId)).to.eql(['p2'])
    expect(result.settings.lastTimestamp).to.be.greaterThan(lastTimestamp)
    expect(result.error).to.include('1 payment(s) skipped')
    expect(params.errors[0]).to.include('blank id')
  })

  it('accepts amounts as strings and rejects non-numeric ones', async () => {
    const io = makeIo(() =>
      makePage([
        makePayment({
          fiat_total: {
            amount: '100.0000',
            amount_usd: '75.5',
            currency: 'USD'
          }
        })
      ])
    )
    const result = await querySimplex(makeParams(nowSeconds() - DAY), io)
    expect(result.transactions[0].depositAmount).to.equal(100)
    expect(result.transactions[0].usdValue).to.equal(75.5)

    const badIo = makeIo(() =>
      makePage([
        makePayment({
          crypto_total: { amount: 'not a number', currency: 'BTC' }
        })
      ])
    )
    const badParams = makeParams(nowSeconds() - DAY)
    const badResult = await querySimplex(badParams, badIo)
    expect(badResult.transactions).to.have.length(0)
    expect(badParams.errors[0]).to.include('Expected an amount')
  })

  it('keeps a payment with an unknown method and warns', async () => {
    const io = makeIo(() =>
      makePage([makePayment({ payment_method: 'carrier_pigeon' })])
    )
    const params = makeParams(nowSeconds() - DAY)
    const result = await querySimplex(params, io)

    expect(result.transactions[0].paymentType).to.equal(null)
    expect(params.warnings).to.have.length(1)
    expect(params.warnings[0]).to.include('carrier_pigeon')
  })

  it('tolerates a null txid and a missing country', async () => {
    const io = makeIo(() =>
      makePage([makePayment({ blockchain_txn_id: null, country: undefined })])
    )
    const result = await querySimplex(makeParams(nowSeconds() - DAY), io)

    expect(result.transactions[0].payoutTxid).to.equal(undefined)
    expect(result.transactions[0].countryCode).to.equal(null)
  })
})
