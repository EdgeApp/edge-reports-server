import { expect } from 'chai'
import { describe, it } from 'mocha'

import { processMoonpayTx, processMoonpayTxs } from '../src/partners/moonpay'
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

// A completed EUR to ETH buy, shaped like a Moonpay /v1/transactions row.
const makeBuy = (id: string, paymentMethod: string): unknown => ({
  id,
  createdAt: '2026-08-27T10:00:00.000Z',
  status: 'completed',
  baseCurrency: { id: 'eur-id', type: 'fiat', name: 'Euro', code: 'eur' },
  baseCurrencyAmount: 100,
  baseCurrencyId: 'eur-id',
  country: 'DEU',
  paymentMethod,
  cryptoTransactionId: '0xpayout',
  currency: {
    id: 'eth-id',
    type: 'crypto',
    name: 'Ethereum',
    code: 'eth',
    metadata: { chainId: '1', networkCode: 'ethereum' }
  },
  walletAddress: '0x1111111111111111111111111111111111111111',
  quoteCurrencyAmount: 0.04
})

describe('processMoonpayTx', () => {
  it('maps sepa_open_banking_payment to sepa', () => {
    // The production order that stalled Moonpay ingestion at 2026-08-26.
    const tx = processMoonpayTx(
      makeBuy(
        '69e4a95b-15be-49b0-9d47-0eef0fd324ba',
        'sepa_open_banking_payment'
      )
    )
    expect(tx.paymentType).to.equal('sepa')
    expect(tx.direction).to.equal('buy')
    expect(tx.status).to.equal('complete')
    expect(tx.payoutChainPluginId).to.equal('ethereum')
    expect(tx.payoutTokenId).to.equal(null)
  })
})

describe('processMoonpayTxs', () => {
  it('skips and logs an order with an unknown payment method and keeps the rest', () => {
    const { log, errors } = makeLog()
    const result = processMoonpayTxs(
      [
        makeBuy('order-1', 'credit_debit_card'),
        makeBuy('order-bad', 'some_new_payment_method'),
        makeBuy('order-2', 'sepa_bank_transfer')
      ],
      log
    )

    expect(result.skipped).to.equal(1)
    expect(result.standardTxs.map(tx => tx.orderId)).to.deep.equal([
      'order-1',
      'order-2'
    ])
    const skipLog = errors.find(message => message.includes('skipping'))
    expect(skipLog).to.include(
      'Unknown payment method: some_new_payment_method'
    )
    expect(skipLog).to.include('id=order-bad')
  })
})
