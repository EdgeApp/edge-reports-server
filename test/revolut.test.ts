import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  collectRevolutOrders,
  processRevolutTx,
  resolveRevolutAsset,
  RevolutAttempt
} from '../src/partners/revolut'
import { PluginParams, ScopedLog } from '../src/types'

// Fixtures follow the shape of Revolut Ramp's GET /partners/api/2.0/orders
// payloads. Wallet addresses and transaction hashes are SYNTHETIC placeholders,
// never live user-linked identifiers; only the field structure and the mapping
// behaviour are load-bearing.

const noopLog: ScopedLog = Object.assign(() => undefined, {
  warn: () => undefined,
  error: () => undefined
})

const pluginParams: PluginParams = {
  apiKeys: {},
  settings: {},
  log: noopLog
}

const makeOrder = (overrides: object = {}): object => ({
  id: '00000000-0000-4000-8000-000000000001',
  fiat: { amount: 100.5, currency: 'EUR' },
  crypto: { amount: 0.001, currencyId: 'BTC' },
  created_at: '2026-06-01T08:09:57.677612Z',
  updated_at: '2026-06-01T08:14:11.888199Z',
  status: 'COMPLETED',
  payment: 'revolut',
  wallet: 'bc1qexamplewalletaddress00000000000000000',
  transaction_hash: 'a'.repeat(64),
  ...overrides
})

describe('resolveRevolutAsset', function() {
  it('maps a native asset to its chain with a null tokenId', function() {
    expect(resolveRevolutAsset('BTC')).to.deep.equal({
      currencyCode: 'BTC',
      chainPluginId: 'bitcoin',
      tokenId: null,
      evmChainId: undefined
    })
  })

  it('supplies an evmChainId for a native EVM asset', function() {
    expect(resolveRevolutAsset('ETH')).to.deep.equal({
      currencyCode: 'ETH',
      chainPluginId: 'ethereum',
      tokenId: null,
      evmChainId: 1
    })
  })

  it('splits a CODE-CHAIN token into a clean code and its chain', function() {
    // Revolut reports no contract address, so tokenId stays undefined rather
    // than being minted from a guess.
    expect(resolveRevolutAsset('USDT-POL')).to.deep.equal({
      currencyCode: 'USDT',
      chainPluginId: 'polygon',
      tokenId: undefined,
      evmChainId: 137
    })
  })

  it('maps a non-EVM token chain with no evmChainId', function() {
    expect(resolveRevolutAsset('USDT-TRON')).to.deep.equal({
      currencyCode: 'USDT',
      chainPluginId: 'tron',
      tokenId: undefined,
      evmChainId: undefined
    })
  })

  it('still yields a usable currency code for an unknown chain suffix', function() {
    expect(resolveRevolutAsset('FOO-NEWCHAIN')).to.deep.equal({
      currencyCode: 'FOO',
      chainPluginId: undefined,
      tokenId: undefined,
      evmChainId: undefined
    })
  })

  it('leaves an unknown bare code unmapped', function() {
    expect(resolveRevolutAsset('FOO')).to.deep.equal({
      currencyCode: 'FOO',
      chainPluginId: undefined,
      tokenId: undefined,
      evmChainId: undefined
    })
  })
})

describe('collectRevolutOrders', function() {
  it('collapses repeated attempts of one order id to a single entry', function() {
    const best = new Map<string, RevolutAttempt>()
    collectRevolutOrders(
      [
        makeOrder({ status: 'FAILED', updated_at: '2026-06-01T08:16:00.000Z' }),
        makeOrder({
          status: 'COMPLETED',
          updated_at: '2026-06-01T08:14:11.000Z'
        })
      ],
      best
    )

    expect(best.size).to.equal(1)
    // A settled attempt wins even though the failed one was updated later.
    expect(
      best.get('00000000-0000-4000-8000-000000000001')?.order.status
    ).to.equal('COMPLETED')
  })

  it('prefers the later attempt when neither is completed', function() {
    const best = new Map<string, RevolutAttempt>()
    collectRevolutOrders(
      [
        makeOrder({ status: 'FAILED', updated_at: '2026-06-01T08:10:00.000Z' }),
        makeOrder({ status: 'FAILED', updated_at: '2026-06-01T08:20:00.000Z' })
      ],
      best
    )

    expect(best.size).to.equal(1)
    expect(
      best.get('00000000-0000-4000-8000-000000000001')?.order.updated_at
    ).to.equal('2026-06-01T08:20:00.000Z')
  })

  it('collapses across pages, not just within one page', function() {
    const best = new Map<string, RevolutAttempt>()
    collectRevolutOrders(
      [makeOrder({ status: 'FAILED', updated_at: '2026-06-01T08:10:00.000Z' })],
      best
    )
    collectRevolutOrders([makeOrder({ status: 'COMPLETED' })], best)

    expect(best.size).to.equal(1)
    expect(
      best.get('00000000-0000-4000-8000-000000000001')?.order.status
    ).to.equal('COMPLETED')
  })

  it('keeps distinct order ids apart', function() {
    const best = new Map<string, RevolutAttempt>()
    collectRevolutOrders(
      [makeOrder(), makeOrder({ id: '00000000-0000-4000-8000-000000000002' })],
      best
    )
    expect(best.size).to.equal(2)
  })

  it('preserves the untouched payload of the winning attempt', function() {
    const winner = makeOrder({ status: 'COMPLETED' })
    const best = new Map<string, RevolutAttempt>()
    collectRevolutOrders([makeOrder({ status: 'FAILED' }), winner], best)

    expect(best.get('00000000-0000-4000-8000-000000000001')?.raw).to.deep.equal(
      winner
    )
  })
})

describe('processRevolutTx', function() {
  it('maps a completed order to a buy-direction fiat StandardTx', function() {
    const rawTx = makeOrder()
    const standardTx = processRevolutTx(rawTx, pluginParams)

    expect(standardTx.status).to.equal('complete')
    expect(standardTx.orderId).to.equal('00000000-0000-4000-8000-000000000001')
    expect(standardTx.direction).to.equal('buy')
    expect(standardTx.exchangeType).to.equal('fiat')
    expect(standardTx.paymentType).to.equal('revolut')
    // Fiat is always the deposit side on an on-ramp order.
    expect(standardTx.depositCurrency).to.equal('EUR')
    expect(standardTx.depositAmount).to.equal(100.5)
    expect(standardTx.payoutCurrency).to.equal('BTC')
    expect(standardTx.payoutAmount).to.equal(0.001)
    expect(standardTx.payoutChainPluginId).to.equal('bitcoin')
    expect(standardTx.payoutTokenId).to.equal(null)
    expect(standardTx.payoutAddress).to.equal(
      'bc1qexamplewalletaddress00000000000000000'
    )
    expect(standardTx.payoutTxid).to.equal('a'.repeat(64))
    expect(standardTx.isoDate).to.equal('2026-06-01T08:09:57.677Z')
    expect(standardTx.usdValue).to.equal(-1)
    expect(standardTx.rawTx).to.deep.equal(rawTx)
  })

  it('maps a failed order that carries no payment, wallet or hash', function() {
    // The common shape of a FAILED row: the optional fields are simply absent.
    const standardTx = processRevolutTx(
      makeOrder({
        status: 'FAILED',
        payment: null,
        wallet: null,
        transaction_hash: null
      }),
      pluginParams
    )

    expect(standardTx.status).to.equal('failed')
    expect(standardTx.paymentType).to.equal(null)
    expect(standardTx.payoutAddress).to.equal(undefined)
    expect(standardTx.payoutTxid).to.equal(undefined)
  })

  it('maps an in-flight order to pending', function() {
    const standardTx = processRevolutTx(
      makeOrder({ status: 'AWAITING_PAYMENT' }),
      pluginParams
    )
    expect(standardTx.status).to.equal('pending')
  })

  it('degrades an unrecognised status to other instead of throwing', function() {
    const standardTx = processRevolutTx(
      makeOrder({ status: 'SOME_NEW_STATUS' }),
      pluginParams
    )
    expect(standardTx.status).to.equal('other')
  })

  it('maps a card payment to the credit payment type', function() {
    const standardTx = processRevolutTx(
      makeOrder({ payment: 'card' }),
      pluginParams
    )
    expect(standardTx.paymentType).to.equal('credit')
  })

  it('degrades an unknown payment method to null rather than throwing', function() {
    const standardTx = processRevolutTx(
      makeOrder({ payment: 'some_new_method' }),
      pluginParams
    )
    expect(standardTx.paymentType).to.equal(null)
  })

  it('carries the token chain through to the payout fields', function() {
    const standardTx = processRevolutTx(
      makeOrder({ crypto: { amount: 25.5, currencyId: 'USDT-ETH' } }),
      pluginParams
    )
    expect(standardTx.payoutCurrency).to.equal('USDT')
    expect(standardTx.payoutChainPluginId).to.equal('ethereum')
    expect(standardTx.payoutEvmChainId).to.equal(1)
    expect(standardTx.payoutTokenId).to.equal(undefined)
  })

  it('stores the partner-reported USD fee as revenue on a settled order', function() {
    const standardTx = processRevolutTx(
      makeOrder({
        fees_partner_currency: {
          partner_fee: { amount: 1.51, currency: 'USD' }
        }
      }),
      pluginParams
    )
    expect(standardTx.revenueUsd).to.equal(1.51)
    expect(standardTx.revenueSource).to.equal('reported')
  })

  it('records no revenue on an unsettled attempt even when a fee is present', function() {
    // A failed attempt's fee is not revenue.
    const standardTx = processRevolutTx(
      makeOrder({
        status: 'FAILED',
        fees_partner_currency: {
          partner_fee: { amount: 1.51, currency: 'USD' }
        }
      }),
      pluginParams
    )
    expect(standardTx.revenueUsd).to.equal(undefined)
    expect(standardTx.revenueSource).to.equal(undefined)
  })

  it('records no revenue when the settlement currency is not USD', function() {
    // The plugin cannot convert honestly, so it abstains rather than guesses.
    const standardTx = processRevolutTx(
      makeOrder({
        fees_partner_currency: {
          partner_fee: { amount: 1.3, currency: 'EUR' }
        }
      }),
      pluginParams
    )
    expect(standardTx.revenueUsd).to.equal(undefined)
  })

  it('records no revenue when the fee block is absent', function() {
    const standardTx = processRevolutTx(makeOrder(), pluginParams)
    expect(standardTx.revenueUsd).to.equal(undefined)
    expect(standardTx.revenueSource).to.equal(undefined)
  })

  it('throws on a structurally invalid order', function() {
    expect(() =>
      processRevolutTx({ id: 'no-amounts' }, pluginParams)
    ).to.throw()
  })
})
