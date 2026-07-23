import { expect } from 'chai'
import { describe, it } from 'mocha'

import { processNymTx } from '../src/partners/nym'

// Fixtures mirror real EdgeTransactionRecord payloads captured from NYM's live
// GET /api/partner/v1/reports/transactions endpoint. Amounts are native-unit
// strings; processNymTx converts them to major units via the asset decimals
// (DEFAULT_DECIMALS when no live map is passed).
describe('processNymTx', function() {
  it('maps a completed order to a StandardTx with major-unit amounts', function() {
    const rawTx = {
      orderId: 'order_e73fd5b1c95f4f58',
      status: 'completed',
      createdDate: '2026-07-23T16:39:52.238Z',
      // Real data leaves completedDate null even when completed.
      completedDate: null,
      sourceNetwork: 'ethereum',
      sourceTokenId: null,
      sourceCurrencyCode: 'ETH',
      sourceAmount: '15899800000000000', // 0.0158998 ETH (18 decimals)
      sourceEvmChainId: 1,
      destinationNetwork: 'NYM',
      destinationTokenId: null,
      destinationCurrencyCode: 'NYM',
      destinationAmount: '1633042311', // 1633.042311 NYM (6 decimals)
      destinationEvmChainId: null,
      payinAddress: '0x84F2089CBa3c9680F301bEd56C82e108a6Ab416a',
      payoutAddress: 'n1fj7fapafrrjxgf8p8qpk0sles7nt8230clvamt',
      payinTxid:
        '0xb78ecf0e0a9e44afd030d2f74cbc9f8e3a10fef09559794363b328fac90702df',
      payoutTxid:
        'DAB0D9F9531464D687C3E5993B1A5D7645622CAF055CEB96BDFDA1283CF29151'
    }

    const standardTx = processNymTx(rawTx)

    expect(standardTx.status).to.equal('complete')
    expect(standardTx.orderId).to.equal('order_e73fd5b1c95f4f58')
    expect(standardTx.exchangeType).to.equal('swap')
    expect(standardTx.depositCurrency).to.equal('ETH')
    expect(standardTx.depositAmount).to.equal(0.0158998)
    expect(standardTx.depositAddress).to.equal(
      '0x84F2089CBa3c9680F301bEd56C82e108a6Ab416a'
    )
    expect(standardTx.depositTxid).to.equal(rawTx.payinTxid)
    expect(standardTx.payoutCurrency).to.equal('NYM')
    expect(standardTx.payoutAmount).to.equal(1633.042311)
    expect(standardTx.payoutAddress).to.equal(
      'n1fj7fapafrrjxgf8p8qpk0sles7nt8230clvamt'
    )
    expect(standardTx.payoutTxid).to.equal(rawTx.payoutTxid)
    // Timestamp keys off createdDate (completedDate is null here).
    expect(standardTx.isoDate).to.equal('2026-07-23T16:39:52.238Z')
    expect(standardTx.usdValue).to.equal(-1)
    expect(standardTx.rawTx).to.deep.equal(rawTx)
  })

  it('converts a token amount using a passed-in live decimals map', function() {
    const standardTx = processNymTx(
      {
        orderId: 'order_ffdd5efef0d54a85',
        status: 'expired',
        createdDate: '2026-07-24T04:08:20.021Z',
        completedDate: null,
        sourceCurrencyCode: 'USDT',
        sourceTokenId: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        sourceAmount: '32468489', // 32.468489 USDT (6 decimals)
        payinAddress: '0x84F2089CBa3c9680F301bEd56C82e108a6Ab416a',
        payinTxid: null,
        destinationCurrencyCode: 'NYM',
        destinationTokenId: null,
        destinationAmount: '1901660695', // 1901.660695 NYM (6 decimals)
        payoutAddress: 'n1uyqr62rpsn5wjxux74h8lrdypt6pnxgqltds2g',
        payoutTxid: null
      },
      {
        // Live /currencies overlay keyed CODE|tokenIdLower.
        'USDT|0xdac17f958d2ee523a2206206994597c13d831ec7': 6,
        'NYM|': 6
      }
    )

    expect(standardTx.status).to.equal('expired')
    expect(standardTx.depositCurrency).to.equal('USDT')
    expect(standardTx.depositAmount).to.equal(32.468489)
    expect(standardTx.payoutAmount).to.equal(1901.660695)
    // Nullable txids degrade to undefined, not throw.
    expect(standardTx.depositTxid).to.equal(undefined)
    expect(standardTx.payoutTxid).to.equal(undefined)
  })

  it('degrades an unknown status to other', function() {
    const standardTx = processNymTx({
      orderId: 'order_unknownstatus',
      status: 'some-new-status',
      createdDate: '2026-07-22T00:00:00.000Z',
      sourceCurrencyCode: 'BTC',
      sourceAmount: '10000', // 0.0001 BTC (8 decimals)
      destinationCurrencyCode: 'NYM',
      destinationAmount: '5000000' // 5 NYM (6 decimals)
    })

    expect(standardTx.status).to.equal('other')
    expect(standardTx.depositAmount).to.equal(0.0001)
    expect(standardTx.payoutAmount).to.equal(5)
  })

  it('throws for an asset with no known decimals so the caller can skip it', function() {
    expect(() =>
      processNymTx({
        orderId: 'order_unknownasset',
        status: 'completed',
        createdDate: '2026-07-22T00:00:00.000Z',
        sourceCurrencyCode: 'FOO',
        sourceAmount: '100',
        destinationCurrencyCode: 'NYM',
        destinationAmount: '5000000'
      })
    ).to.throw(/Unknown decimals for FOO/)
  })

  it('clamps a non-numeric native amount to 0', function() {
    const standardTx = processNymTx({
      orderId: 'order_badamount',
      status: 'completed',
      createdDate: '2026-07-22T00:00:00.000Z',
      sourceCurrencyCode: 'BTC',
      sourceAmount: 'not-a-number',
      destinationCurrencyCode: 'NYM',
      destinationAmount: '5000000'
    })

    // NaN must never reach StandardTx (it serializes to null in CouchDB).
    expect(standardTx.depositAmount).to.equal(0)
    expect(standardTx.payoutAmount).to.equal(5)
  })
})
