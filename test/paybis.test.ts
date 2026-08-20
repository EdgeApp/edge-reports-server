import { expect } from 'chai'
import { describe, it } from 'mocha'

import { processPaybisTx } from '../src/partners/paybis'

describe('processPaybisTx', function() {
  it('stores the payout chain on a fiat-to-crypto buy', function() {
    const rawTx = {
      id: 'pb-buy-btc',
      gateway: 'fiat_to_crypto',
      status: 'completed',
      from: { name: 'Credit/Debit Card' },
      to: {
        name: 'Bitcoin',
        address: 'bc1qexamplewalletaddress00000000000000000',
        asset: {
          id: 'BTC',
          name: 'Bitcoin',
          blockchain: { name: 'bitcoin', network: 'mainnet' }
        }
      },
      createdAt: '2026-06-01T00:07:05.000Z',
      amounts: {
        spentOriginal: { amount: '100', currency: 'USD' },
        spentFiat: { amount: '100', currency: 'USD' },
        receivedOriginal: { amount: '0.001', currency: 'BTC' },
        receivedFiat: { amount: '100', currency: 'USD' }
      },
      user: { country: { name: 'United States', code: 'US' } }
    }

    const standardTx = processPaybisTx(rawTx)
    expect(standardTx.direction).to.equal('buy')
    expect(standardTx.depositCurrency).to.equal('USD')
    expect(standardTx.depositChainPluginId).to.equal(undefined)
    expect(standardTx.payoutCurrency).to.equal('BTC')
    expect(standardTx.payoutChainPluginId).to.equal('bitcoin')
    expect(standardTx.payoutEvmChainId).to.equal(undefined)
  })

  it('distinguishes USDT ERC20 from USDT TRC20 via blockchain.name', function() {
    const trc20 = processPaybisTx({
      id: 'pb-usdt-trc20',
      gateway: 'fiat_to_crypto',
      status: 'completed',
      from: { name: 'Credit/Debit Card' },
      to: {
        name: 'Tether (TRC20)',
        address: 'TExampleTronAddress000000000000000000',
        asset: {
          id: 'USDT-TRC20',
          name: 'Tether (TRC20)',
          blockchain: { name: 'tron', network: 'mainnet' }
        }
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      amounts: {
        spentOriginal: { amount: '20', currency: 'USD' },
        spentFiat: { amount: '20', currency: 'USD' },
        receivedOriginal: { amount: '20', currency: 'USDT' },
        receivedFiat: { amount: '20', currency: 'USD' }
      },
      user: { country: null }
    })
    expect(trc20.payoutCurrency).to.equal('USDT')
    expect(trc20.payoutChainPluginId).to.equal('tron')

    const erc20 = processPaybisTx({
      id: 'pb-usdt-erc20',
      gateway: 'fiat_to_crypto',
      status: 'completed',
      from: { name: 'Credit/Debit Card' },
      to: {
        name: 'Tether (ERC20)',
        address: '0x1111111111111111111111111111111111111111',
        asset: {
          id: 'USDT',
          name: 'Tether (ERC20)',
          blockchain: { name: 'ethereum', network: 'mainnet' }
        }
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      amounts: {
        spentOriginal: { amount: '20', currency: 'USD' },
        spentFiat: { amount: '20', currency: 'USD' },
        receivedOriginal: { amount: '20', currency: 'USDT' },
        receivedFiat: { amount: '20', currency: 'USD' }
      },
      user: { country: null }
    })
    expect(erc20.payoutChainPluginId).to.equal('ethereum')
    expect(erc20.payoutEvmChainId).to.equal(1)
  })

  it('stores the deposit chain on a crypto-to-fiat sell', function() {
    const standardTx = processPaybisTx({
      id: 'pb-sell-eth',
      gateway: 'crypto_to_fiat',
      status: 'completed',
      from: {
        name: 'Ethereum',
        asset: {
          id: 'ETH',
          name: 'Ethereum',
          blockchain: { name: 'ethereum', network: 'mainnet' }
        }
      },
      to: { name: 'Credit/Debit Card' },
      hash:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      createdAt: '2026-06-01T00:00:00.000Z',
      amounts: {
        spentOriginal: { amount: '0.01', currency: 'ETH' },
        spentFiat: { amount: '30', currency: 'USD' },
        receivedOriginal: { amount: '30', currency: 'USD' },
        receivedFiat: { amount: '30', currency: 'USD' }
      },
      user: { country: null }
    })
    expect(standardTx.direction).to.equal('sell')
    expect(standardTx.depositCurrency).to.equal('ETH')
    expect(standardTx.depositChainPluginId).to.equal('ethereum')
    expect(standardTx.depositEvmChainId).to.equal(1)
    expect(standardTx.payoutChainPluginId).to.equal(undefined)
  })

  it('throws for an unknown blockchain.name', function() {
    expect(() =>
      processPaybisTx({
        id: 'pb-unknown-chain',
        gateway: 'fiat_to_crypto',
        status: 'completed',
        from: { name: 'Credit/Debit Card' },
        to: {
          name: 'Mystery',
          asset: {
            id: 'XYZ',
            blockchain: { name: 'not-a-chain', network: 'mainnet' }
          }
        },
        createdAt: '2026-06-01T00:00:00.000Z',
        amounts: {
          spentOriginal: { amount: '1', currency: 'USD' },
          spentFiat: { amount: '1', currency: 'USD' },
          receivedOriginal: { amount: '1', currency: 'XYZ' },
          receivedFiat: { amount: '1', currency: 'USD' }
        },
        user: { country: null }
      })
    ).to.throw(/Unknown Paybis blockchain "not-a-chain"/)
  })
})
