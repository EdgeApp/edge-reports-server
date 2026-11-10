import { expect } from 'chai'
import { describe, it } from 'mocha'

import { processLibertyxTx } from '../src/partners/libertyx'

describe('processLibertyxTx', () => {
  it('records the payout as native bitcoin', () => {
    const tx = processLibertyxTx({
      all_transactions_usd_sum: 1250.5,
      date_us_eastern: '2025-11-04'
    })

    expect(tx.orderId).to.equal('2025-11-04')
    expect(tx.depositCurrency).to.equal('USD')
    expect(tx.depositChainPluginId).to.equal(undefined)
    expect(tx.payoutCurrency).to.equal('BTC')
    expect(tx.payoutChainPluginId).to.equal('bitcoin')
    expect(tx.payoutEvmChainId).to.equal(undefined)
    expect(tx.payoutTokenId).to.equal(null)
    expect(tx.usdValue).to.equal(1250.5)
  })
})
