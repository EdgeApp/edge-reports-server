import { expect } from 'chai'
import { describe, it } from 'mocha'

import { processNymTx } from '../src/partners/nym'
import { PluginParams, ScopedLog } from '../src/types'

// Fixtures follow the shape of NYM's GET /api/partner/v1/reports/transactions
// payloads. Addresses and txids are SYNTHETIC placeholders (never live
// user-linked identifiers); only the field structure and the native-unit amount
// math are load-bearing. processNymTx converts native-unit amount strings to
// major units via the asset decimals (DEFAULT_DECIMALS when no live map is
// passed). The USDT contract address in the decimals-map case is the public
// canonical USDT token contract, not user data.
// Silent logger so test output stays clean; processNymTx only logs on a
// cleaner failure.
const noopLog: ScopedLog = Object.assign(() => undefined, {
  warn: () => undefined,
  error: () => undefined
})

// processNymTx follows the uniform `(rawTx, pluginParams)` processor contract,
// so every case passes params even though only `log` is consumed.
const pluginParams: PluginParams = {
  apiKeys: {},
  settings: {},
  log: noopLog
}

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
      payinAddress: '0x1111111111111111111111111111111111111111',
      payoutAddress: 'n1exampledepositaddr00000000000000000000',
      payinTxid:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      payoutTxid:
        'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    }

    const standardTx = processNymTx(rawTx, pluginParams)

    expect(standardTx.status).to.equal('complete')
    expect(standardTx.orderId).to.equal('order_e73fd5b1c95f4f58')
    expect(standardTx.exchangeType).to.equal('swap')
    expect(standardTx.depositCurrency).to.equal('ETH')
    expect(standardTx.depositAmount).to.equal(0.0158998)
    expect(standardTx.depositAddress).to.equal(
      '0x1111111111111111111111111111111111111111'
    )
    expect(standardTx.depositTxid).to.equal(rawTx.payinTxid)
    expect(standardTx.payoutCurrency).to.equal('NYM')
    expect(standardTx.payoutAmount).to.equal(1633.042311)
    expect(standardTx.payoutAddress).to.equal(
      'n1exampledepositaddr00000000000000000000'
    )
    expect(standardTx.payoutTxid).to.equal(rawTx.payoutTxid)
    // Timestamp keys off createdDate (completedDate is null here).
    expect(standardTx.isoDate).to.equal('2026-07-23T16:39:52.238Z')
    expect(standardTx.usdValue).to.equal(-1)
    expect(standardTx.rawTx).to.deep.equal(rawTx)
    expect(standardTx.depositChainPluginId).to.equal('ethereum')
    expect(standardTx.depositEvmChainId).to.equal(1)
    expect(standardTx.depositTokenId).to.equal(null)
    expect(standardTx.payoutChainPluginId).to.equal('nym')
    expect(standardTx.payoutEvmChainId).to.equal(undefined)
    expect(standardTx.payoutTokenId).to.equal(null)
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
        sourceNetwork: 'ethereum',
        sourceEvmChainId: 1,
        payinAddress: '0x1111111111111111111111111111111111111111',
        payinTxid: null,
        destinationCurrencyCode: 'NYM',
        destinationTokenId: null,
        destinationAmount: '1901660695', // 1901.660695 NYM (6 decimals)
        destinationNetwork: 'NYM',
        payoutAddress: 'n1examplepayoutaddr000000000000000000000',
        payoutTxid: null
      },
      pluginParams,
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
    expect(standardTx.depositChainPluginId).to.equal('ethereum')
    expect(standardTx.depositTokenId).to.equal(
      'dac17f958d2ee523a2206206994597c13d831ec7'
    )
    expect(standardTx.payoutChainPluginId).to.equal('nym')
    expect(standardTx.payoutTokenId).to.equal(null)
    // Nullable txids degrade to undefined, not throw.
    expect(standardTx.depositTxid).to.equal(undefined)
    expect(standardTx.payoutTxid).to.equal(undefined)
  })

  it('degrades an unknown status to other', function() {
    const standardTx = processNymTx(
      {
        orderId: 'order_unknownstatus',
        status: 'some-new-status',
        createdDate: '2026-07-22T00:00:00.000Z',
        sourceCurrencyCode: 'BTC',
        sourceAmount: '10000', // 0.0001 BTC (8 decimals)
        destinationCurrencyCode: 'NYM',
        destinationAmount: '5000000' // 5 NYM (6 decimals)
      },
      pluginParams
    )

    expect(standardTx.status).to.equal('other')
    expect(standardTx.depositAmount).to.equal(0.0001)
    expect(standardTx.payoutAmount).to.equal(5)
  })

  it('throws for an asset with no known decimals so the caller can skip it', function() {
    expect(() =>
      processNymTx(
        {
          orderId: 'order_unknownasset',
          status: 'completed',
          createdDate: '2026-07-22T00:00:00.000Z',
          sourceCurrencyCode: 'FOO',
          sourceAmount: '100',
          destinationCurrencyCode: 'NYM',
          destinationAmount: '5000000'
        },
        pluginParams
      )
    ).to.throw(/Unknown decimals for FOO/)
  })

  it('clamps a non-numeric native amount to 0', function() {
    const standardTx = processNymTx(
      {
        orderId: 'order_badamount',
        status: 'completed',
        createdDate: '2026-07-22T00:00:00.000Z',
        sourceCurrencyCode: 'BTC',
        sourceAmount: 'not-a-number',
        destinationCurrencyCode: 'NYM',
        destinationAmount: '5000000'
      },
      pluginParams
    )

    // NaN must never reach StandardTx (it serializes to null in CouchDB).
    expect(standardTx.depositAmount).to.equal(0)
    expect(standardTx.payoutAmount).to.equal(5)
  })

  it('maps reports-API BTC and nyx aliases to Edge pluginIds', function() {
    const standardTx = processNymTx(
      {
        orderId: 'order_aliases',
        status: 'completed',
        createdDate: '2026-07-22T00:00:00.000Z',
        sourceCurrencyCode: 'BTC',
        sourceAmount: '10000',
        sourceNetwork: 'BTC',
        destinationCurrencyCode: 'NYM',
        destinationAmount: '5000000',
        destinationNetwork: 'nyx'
      },
      pluginParams
    )
    expect(standardTx.depositChainPluginId).to.equal('bitcoin')
    expect(standardTx.payoutChainPluginId).to.equal('nym')
  })

  it('throws for an unknown NYM network name', function() {
    expect(() =>
      processNymTx(
        {
          orderId: 'order_unknownnet',
          status: 'completed',
          createdDate: '2026-07-22T00:00:00.000Z',
          sourceCurrencyCode: 'ETH',
          sourceAmount: '1000000000000000000',
          sourceNetwork: 'sepolia',
          destinationCurrencyCode: 'NYM',
          destinationAmount: '5000000',
          destinationNetwork: 'NYM'
        },
        pluginParams
      )
    ).to.throw(/Unknown NYM network "sepolia"/)
  })
})
