import { expect } from 'chai'
import { describe, it } from 'mocha'

import { processKadoTx, resolveKadoChain } from '../src/partners/kado'

describe('processKadoTx', function() {
  it('stores the payout chain on a buy', function() {
    const standardTx = processKadoTx({
      _id: 'kado-buy-btc',
      walletAddress: 'bc1qexamplewalletaddress00000000000000000',
      createdAt: '2024-01-26T00:55:30.547Z',
      type: 'buy',
      walletType: 'manual_input',
      cryptoCurrency: 'BTC',
      network: 'bitcoin',
      receiveUnitCount: 0.001,
      paidAmountUsd: 50,
      paymentMethod: 'wire_transfer'
    })
    expect(standardTx.direction).to.equal('buy')
    expect(standardTx.depositCurrency).to.equal('USD')
    expect(standardTx.depositChainPluginId).to.equal(undefined)
    expect(standardTx.payoutCurrency).to.equal('BTC')
    expect(standardTx.payoutChainPluginId).to.equal('bitcoin')
  })

  it('treats Solana and solana as the same chain', function() {
    const standardTx = processKadoTx({
      _id: 'kado-buy-sol',
      walletAddress: 'SoLExamp1eAddress000000000000000000000000',
      createdAt: '2024-01-26T00:55:30.547Z',
      type: 'buy',
      walletType: 'manual_input',
      cryptoCurrency: 'SOL',
      network: 'Solana',
      receiveUnitCount: 1,
      paidAmountUsd: 20,
      paymentMethod: 'wire_transfer'
    })
    expect(standardTx.payoutChainPluginId).to.equal('solana')
  })

  it('maps ethereum to pluginId plus evmChainId', function() {
    expect(resolveKadoChain('ethereum')).to.deep.equal({
      chainPluginId: 'ethereum',
      evmChainId: 1,
      tokenId: undefined
    })
  })

  it('throws for an unknown network', function() {
    expect(() =>
      processKadoTx({
        _id: 'kado-unknown',
        walletAddress: 'addr',
        createdAt: '2024-01-26T00:55:30.547Z',
        type: 'buy',
        walletType: 'manual_input',
        cryptoCurrency: 'XYZ',
        network: 'not-a-chain',
        receiveUnitCount: 1,
        paidAmountUsd: 1,
        paymentMethod: 'wire_transfer'
      })
    ).to.throw(/Unknown Kado network "not-a-chain"/)
  })
})
