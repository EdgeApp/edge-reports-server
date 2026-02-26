import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  makeNexchangeHeaders,
  processNexchangeTx
} from '../src/partners/nexchange'

describe('nexchange plugin', () => {
  it('maps Edge audit order payload into StandardTx', () => {
    const raw = {
      orderId: 'NEX-ABCD1234',
      status: 'Released',
      createdAt: '2026-01-20T11:43:10+00:00',
      deposit: {
        currency: 'USDT',
        amount: '100.00000000',
        address: 'TQhaM...sample',
        txid: '0xdep123'
      },
      payout: {
        currency: 'btc',
        amount: '0.00145000',
        address: 'bc1q...sample',
        txid: '0xpay123'
      },
      countryCode: 'PT'
    }

    const tx = processNexchangeTx(raw)

    expect(tx.orderId).to.equal('NEX-ABCD1234')
    expect(tx.status).to.equal('complete')
    expect(tx.exchangeType).to.equal('swap')
    expect(tx.direction).to.equal(null)
    expect(tx.depositCurrency).to.equal('USDT')
    expect(tx.payoutCurrency).to.equal('BTC')
    expect(tx.depositAmount).to.equal(100)
    expect(tx.payoutAmount).to.equal(0.00145)
    expect(tx.countryCode).to.equal('PT')
    expect(tx.isoDate).to.equal('2026-01-20T11:43:10.000Z')
    expect(tx.timestamp).to.equal(1768909390)
  })

  it('supports both x-api-key and Authorization header modes', () => {
    const both = makeNexchangeHeaders('secret', 'both')
    expect(both).to.deep.equal({
      'x-api-key': 'secret',
      Authorization: 'ApiKey secret'
    })

    const legacy = makeNexchangeHeaders('secret', 'authorization')
    expect(legacy).to.deep.equal({
      Authorization: 'ApiKey secret'
    })
  })
})
