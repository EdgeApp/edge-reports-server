import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  processXgramTxWithCurrencies,
  XgramCurrencies
} from '../src/partners/xgram'

const currencies: XgramCurrencies = {
  BTC: {
    coinName: 'Bitcoin',
    network: 'Bitcoin',
    contract: ''
  },
  ADA: {
    coinName: 'Cardano',
    network: 'ADA',
    contract: ''
  },
  USDT: {
    coinName: 'Tether',
    network: 'ERC20',
    contract: '0xdac17f958d2ee523a2206206994597c13d831ec7'
  },
  USDTTRC20: {
    coinName: 'Tether',
    network: 'TRC20',
    contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
  },
  ZEC: {
    coinName: 'Zcash',
    network: 'Zcash',
    contract: ''
  }
}

describe('processXgramTx', () => {
  it('maps source and destination asset IDs', () => {
    const tx = processXgramTxWithCurrencies(
      {
        id: 'dyv3a2tdbgipvh0',
        'x-status': 'x-completed',
        'x-fromCcy': 'BTC',
        'x-toCcy': 'USDT',
        'x-ccyDepositAddress': 'bc1q8tgkyamr4jvlfw2ccaqg5gd2tskqs9h6r7fra7',
        'x-ccyDepositHash': 'deposit-hash',
        'x-ccyDestinationAddress': '0xf12fb83D413c509506635A663D188B1Dc7fA0C47',
        'x-ccyExpectedAmountFrom': 0.01334746,
        'x-ccyExpectedAmountTo': 992.5,
        'x-ccyAmountFrom': '0.0133',
        'x-ccyAmountTo': '990.1',
        date: '27.05.2026 20:57:28',
        txId: 'payout-hash'
      },
      currencies
    )

    expect(tx.status).equals('complete')
    expect(tx.depositCurrency).equals('BTC')
    expect(tx.depositAmount).equals(0.0133)
    expect(tx.depositChainPluginId).equals('bitcoin')
    expect(tx.depositEvmChainId).equals(undefined)
    expect(tx.depositTokenId).equals(null)
    expect(tx.payoutCurrency).equals('USDT')
    expect(tx.payoutAmount).equals(990.1)
    expect(tx.payoutChainPluginId).equals('ethereum')
    expect(tx.payoutEvmChainId).equals(1)
    expect(tx.payoutTokenId).equals('dac17f958d2ee523a2206206994597c13d831ec7')
    expect(tx.isoDate).equals('2026-05-27T20:57:28.000Z')
  })

  it('uses expected amounts and chain-specific token IDs for pending rows', () => {
    const tx = processXgramTxWithCurrencies(
      {
        id: 'tmah3a2td9cp20q0',
        'x-status': 'x-new',
        'x-fromCcy': 'USDTTRC20',
        'x-toCcy': 'BTC',
        'x-ccyDepositAddress': '0xcc56c6a4B3Fa0Cc4b672f8bDfd08f420F901d7D3',
        'x-ccyDepositHash': null,
        'x-ccyDestinationAddress': 'bc1qcrean77uds2gwggjzyry4vw30j80j7lhhvvczl',
        'x-ccyExpectedAmountFrom': 1001.699001,
        'x-ccyExpectedAmountTo': 0.01308,
        'x-ccyAmountFrom': null,
        'x-ccyAmountTo': null,
        date: '27.05.2026 20:56:54',
        txId: null
      },
      currencies
    )

    expect(tx.status).equals('pending')
    expect(tx.depositCurrency).equals('USDTTRC20')
    expect(tx.depositAmount).equals(1001.699001)
    expect(tx.depositChainPluginId).equals('tron')
    expect(tx.depositTokenId).equals('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
    expect(tx.payoutCurrency).equals('BTC')
    expect(tx.payoutAmount).equals(0.01308)
    expect(tx.payoutChainPluginId).equals('bitcoin')
    expect(tx.payoutTokenId).equals(null)
  })

  it('maps historical native currencies missing from the currency API', () => {
    const tx = processXgramTxWithCurrencies(
      {
        id: 'talr3a0e49fplpog',
        'x-status': 'x-timeout',
        'x-fromCcy': 'ZEC',
        'x-toCcy': 'ADA',
        'x-ccyDepositAddress': 't1example',
        'x-ccyDepositHash': null,
        'x-ccyDestinationAddress': 'addr1example',
        'x-ccyExpectedAmountFrom': 1.2,
        'x-ccyExpectedAmountTo': 123,
        'x-ccyAmountFrom': null,
        'x-ccyAmountTo': null,
        date: '12.05.2026 20:07:51',
        txId: null
      },
      currencies
    )

    expect(tx.status).equals('expired')
    expect(tx.depositChainPluginId).equals('zcash')
    expect(tx.depositTokenId).equals(null)
    expect(tx.payoutChainPluginId).equals('cardano')
    expect(tx.payoutTokenId).equals(null)
  })
})
