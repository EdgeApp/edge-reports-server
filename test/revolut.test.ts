import { expect } from 'chai'
import { describe, it } from 'mocha'

import { queryRevolut, processRevolutTx } from '../src/partners/revolut'
import * as util from '../src/util'

const baseRawTx = {
  id: 'revolut-order',
  type: 'buy',
  created_at: '2026-07-24T12:34:56.000Z',
  fiat_amount: 125.5,
  fiat_currency: 'usd',
  crypto_amount: 0.01,
  crypto_currency: 'btc',
  wallet_address: 'bc1qwallet',
  tx_hash: 'revolut-txid',
  country_code: 'US',
  payment_method: 'card',
  state: 'completed'
}

describe('Revolut transaction mapping', function() {
  it('maps buy orders as fiat deposits and crypto payouts', function() {
    const standardTx = processRevolutTx(baseRawTx)

    expect(standardTx).to.include({
      orderId: 'revolut-order',
      countryCode: 'US',
      depositCurrency: 'USD',
      depositAmount: 125.5,
      direction: 'buy',
      exchangeType: 'fiat',
      paymentType: 'credit',
      payoutTxid: 'revolut-txid',
      payoutAddress: 'bc1qwallet',
      payoutCurrency: 'BTC',
      payoutAmount: 0.01,
      status: 'complete',
      isoDate: '2026-07-24T12:34:56.000Z',
      timestamp: 1784896496,
      usdValue: -1
    })
    expect(standardTx.depositTxid).equals(undefined)
  })

  it('maps sell orders as crypto deposits and fiat payouts', function() {
    const standardTx = processRevolutTx({
      ...baseRawTx,
      type: 'sell',
      fiat_amount: 250,
      fiat_currency: 'eur',
      crypto_amount: 1.5,
      crypto_currency: 'eth',
      payment_method: 'bank_transfer'
    })

    expect(standardTx).to.include({
      depositTxid: 'revolut-txid',
      depositCurrency: 'ETH',
      depositAmount: 1.5,
      direction: 'sell',
      paymentType: 'banktransfer',
      payoutCurrency: 'EUR',
      payoutAmount: 250
    })
    expect(standardTx.payoutTxid).equals(undefined)
    expect(standardTx.payoutAddress).equals(undefined)
  })

  it('ignores null or mistyped optional fields', function() {
    const standardTx = processRevolutTx({
      ...baseRawTx,
      wallet_address: null,
      tx_hash: 123,
      country_code: false,
      payment_method: 'new_provider'
    })

    expect(standardTx.countryCode).equals(null)
    expect(standardTx.paymentType).equals(null)
    expect(standardTx.payoutTxid).equals(undefined)
    expect(standardTx.payoutAddress).equals(undefined)
  })

  for (const testCase of [
    { revolutMethod: undefined, paymentType: null },
    { revolutMethod: 'revolut', paymentType: 'revolut' },
    { revolutMethod: 'card', paymentType: 'credit' },
    { revolutMethod: 'bank_transfer', paymentType: 'banktransfer' },
    { revolutMethod: 'apple_pay', paymentType: 'applepay' },
    { revolutMethod: 'google_pay', paymentType: 'googlepay' }
  ]) {
    it(`maps ${testCase.revolutMethod ?? 'missing'} payment method`, function() {
      const rawTx: any = { ...baseRawTx }
      if (testCase.revolutMethod == null) {
        delete rawTx.payment_method
      } else {
        rawTx.payment_method = testCase.revolutMethod
      }

      const standardTx = processRevolutTx(rawTx)

      expect(standardTx.paymentType).equals(testCase.paymentType)
    })
  }

  it('does not ingest a repeated cursor page', async function() {
    const oldRetryFetch = util.retryFetch
    const oldSnooze = util.snooze
    const latestIsoDate = '2026-07-20T00:00:00.000Z'
    let callCount = 0

    ;(util as any).retryFetch = async () => {
      callCount++
      return {
        ok: true,
        json: async () => ({
          transactions: [
            {
              ...baseRawTx,
              id: `revolut-order-${callCount}`,
              created_at: '2026-07-21T00:00:00.000Z'
            }
          ],
          next_cursor: 'same-cursor'
        }),
        text: async () => ''
      }
    }
    ;(util as any).snooze = async () => {}

    try {
      const result = await queryRevolut({
        settings: { latestIsoDate },
        apiKeys: { apiKey: 'revolut-api-key' }
      })

      expect(callCount).equals(2)
      expect(result.transactions.map(tx => tx.orderId)).deep.equals([
        'revolut-order-1'
      ])
      expect(result.settings.latestIsoDate).equals(latestIsoDate)
    } finally {
      ;(util as any).retryFetch = oldRetryFetch
      ;(util as any).snooze = oldSnooze
    }
  })

  it('does not re-append successful pages during retry', async function() {
    const oldRetryFetch = util.retryFetch
    const oldSnooze = util.snooze
    const latestIsoDate = '2026-07-20T00:00:00.000Z'
    let callCount = 0

    ;(util as any).retryFetch = async (_url: string) => {
      callCount++
      if (callCount === 2) throw new Error('temporary failure')

      return {
        ok: true,
        json: async () => ({
          transactions: [
            {
              ...baseRawTx,
              id: 'revolut-order-1',
              created_at: '2026-07-21T00:00:00.000Z'
            }
          ],
          next_cursor: callCount === 1 ? 'page-2' : undefined
        }),
        text: async () => ''
      }
    }
    ;(util as any).snooze = async () => {}

    try {
      const result = await queryRevolut({
        settings: { latestIsoDate },
        apiKeys: { apiKey: 'revolut-api-key' }
      })

      expect(callCount).equals(3)
      expect(result.transactions.map(tx => tx.orderId)).deep.equals([
        'revolut-order-1'
      ])
    } finally {
      ;(util as any).retryFetch = oldRetryFetch
      ;(util as any).snooze = oldSnooze
    }
  })

  it('advances settings after empty history', async function() {
    const oldRetryFetch = util.retryFetch
    const oldSnooze = util.snooze
    const oldDateNow = Date.now
    const now = Date.parse('2026-07-24T00:00:00.000Z')

    ;(Date as any).now = () => now
    ;(util as any).retryFetch = async () => ({
      ok: true,
      json: async () => ({ transactions: [], next_cursor: undefined }),
      text: async () => ''
    })
    ;(util as any).snooze = async () => {}

    try {
      const result = await queryRevolut({
        settings: { latestIsoDate: '2026-07-20T00:00:00.000Z' },
        apiKeys: { apiKey: 'revolut-api-key' }
      })

      expect(result.transactions).deep.equals([])
      expect(result.settings.latestIsoDate).equals('2026-07-24T00:00:00.000Z')
    } finally {
      Date.now = oldDateNow
      ;(util as any).retryFetch = oldRetryFetch
      ;(util as any).snooze = oldSnooze
    }
  })
})
