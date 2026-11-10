import { expect } from 'chai'
import { describe, it } from 'mocha'

import { StandardTx } from '../src/types'
import { planTxUpdate } from '../src/util/updateTx'

const storedTx: StandardTx = {
  status: 'complete',
  orderId: 'qjl6mh4xv0inshu7',
  countryCode: null,
  depositTxid: 'deposit-txid',
  depositAddress: undefined,
  depositCurrency: 'BTC',
  depositChainPluginId: 'bitcoin',
  depositEvmChainId: undefined,
  depositTokenId: null,
  depositAmount: 0.01,
  direction: null,
  exchangeType: 'swap',
  paymentType: null,
  payoutTxid: 'payout-txid',
  payoutAddress: undefined,
  payoutCurrency: 'USDT',
  payoutChainPluginId: 'ethereum',
  payoutEvmChainId: 1,
  payoutTokenId: 'dac17f958d2ee523a2206206994597c13d831ec7',
  payoutAmount: 1000,
  timestamp: 1762300800,
  isoDate: '2025-11-05T00:00:00.000Z',
  usdValue: 1000,
  rawTx: {}
}

// The same order read during a catalog outage: every chain field unknown.
const degradedTx: StandardTx = {
  ...storedTx,
  depositChainPluginId: undefined,
  depositEvmChainId: undefined,
  depositTokenId: undefined,
  payoutChainPluginId: undefined,
  payoutEvmChainId: undefined,
  payoutTokenId: undefined
}

describe('planTxUpdate', () => {
  it('does not rewrite a stored order whose re-read lost its chains', () => {
    const { tx, changedFields } = planTxUpdate(storedTx, degradedTx)

    expect(changedFields).to.deep.equal([])
    expect(tx.depositChainPluginId).to.equal('bitcoin')
    expect(tx.payoutChainPluginId).to.equal('ethereum')
  })

  it('keeps stored chains when another field changes', () => {
    const { tx, changedFields } = planTxUpdate(storedTx, {
      ...degradedTx,
      status: 'refunded'
    })

    expect(changedFields).to.deep.equal(['status'])
    expect(tx.status).to.equal('refunded')
    expect(tx.depositChainPluginId).to.equal('bitcoin')
    expect(tx.depositTokenId).to.equal(null)
    expect(tx.payoutChainPluginId).to.equal('ethereum')
    expect(tx.payoutEvmChainId).to.equal(1)
    expect(tx.payoutTokenId).to.equal(
      'dac17f958d2ee523a2206206994597c13d831ec7'
    )
  })

  it('fills chains a stored order is missing', () => {
    const { tx, changedFields } = planTxUpdate(degradedTx, storedTx)

    expect(changedFields).to.deep.equal([
      'depositChainPluginId',
      'depositTokenId',
      'payoutChainPluginId',
      'payoutEvmChainId',
      'payoutTokenId'
    ])
    expect(tx.payoutChainPluginId).to.equal('ethereum')
  })

  it('replaces a stored chain with a different defined value', () => {
    const { tx, changedFields } = planTxUpdate(storedTx, {
      ...storedTx,
      payoutChainPluginId: 'tron',
      payoutEvmChainId: undefined,
      payoutTokenId: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    })

    // A new chain takes the leg as read: the old EVM chain id does not stay.
    expect(changedFields).to.deep.equal([
      'payoutChainPluginId',
      'payoutEvmChainId',
      'payoutTokenId'
    ])
    expect(tx.payoutChainPluginId).to.equal('tron')
    expect(tx.payoutEvmChainId).to.equal(undefined)
  })

  it('never pairs a stored token with a different chain', () => {
    const { tx } = planTxUpdate(storedTx, {
      ...storedTx,
      payoutChainPluginId: 'polygon',
      payoutEvmChainId: 137,
      payoutTokenId: undefined
    })

    expect(tx.payoutChainPluginId).to.equal('polygon')
    expect(tx.payoutEvmChainId).to.equal(137)
    expect(tx.payoutTokenId).to.equal(undefined)
    // The deposit leg is untouched by the payout change.
    expect(tx.depositChainPluginId).to.equal('bitcoin')
  })

  it('keeps a stored token when the read names the same chain', () => {
    const { tx, changedFields } = planTxUpdate(storedTx, {
      ...storedTx,
      payoutTokenId: undefined
    })

    expect(changedFields).to.deep.equal([])
    expect(tx.payoutTokenId).to.equal(
      'dac17f958d2ee523a2206206994597c13d831ec7'
    )
  })

  it('treats a null tokenId as known', () => {
    const { tx, changedFields } = planTxUpdate(storedTx, {
      ...storedTx,
      payoutTokenId: null
    })

    expect(changedFields).to.deep.equal(['payoutTokenId'])
    expect(tx.payoutTokenId).to.equal(null)
  })
})
