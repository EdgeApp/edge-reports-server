import { expect } from 'chai'
import { describe, it } from 'mocha'

import { processExolixTx } from '../src/partners/exolix'
import { processLifiTx } from '../src/partners/lifi'
import { PluginParams, ScopedLog } from '../src/types'
import { createTokenId } from '../src/util/asEdgeTokenId'

const noopLog: ScopedLog = Object.assign(() => undefined, {
  warn: () => undefined,
  error: () => undefined
})
const pluginParams: PluginParams = { settings: {}, apiKeys: {}, log: noopLog }

describe('HyperCore token ids', function() {
  it('keeps a 16-byte token id', function() {
    expect(
      createTokenId('hypercore', 'USDC', '0x6d1e7cde53bA9467B783Cb7c530CE054')
    ).to.equal('6d1e7cde53ba9467b783cb7c530ce054')
  })

  it('strips the zero padding of a 20-byte token id', function() {
    expect(
      createTokenId(
        'hypercore',
        'USDC',
        '0x6d1e7cde53bA9467B783Cb7c530CE05400000000'
      )
    ).to.equal('6d1e7cde53ba9467b783cb7c530ce054')
  })

  it('rejects an EVM address', function() {
    expect(() =>
      createTokenId(
        'hypercore',
        'USDC',
        '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
      )
    ).to.throw('Invalid HyperCore token id')
  })
})

describe('Exolix HyperCore', function() {
  it('reads the HYPE network as HyperCore', function() {
    const tx = processExolixTx({
      id: 'order',
      status: 'success',
      coinFrom: { coinCode: 'ETH', network: 'ETH', contract: null },
      coinTo: {
        coinCode: 'HYPE',
        network: 'HYPE',
        contract: '0x0d01dc56dcaaca66ad901c959b4011ec'
      },
      amount: 0.05,
      amountTo: 1.4,
      depositAddress: 'deposit',
      withdrawalAddress: 'withdrawal',
      hashIn: { hash: 'in' },
      hashOut: { hash: 'out' },
      createdAt: '2026-09-29T00:00:00.000Z'
    })
    expect(tx.payoutChainPluginId).to.equal('hypercore')
    expect(tx.payoutEvmChainId).to.equal(undefined)
    expect(tx.payoutTokenId).to.equal(null)
  })
})

interface LifiToken {
  address: string
  chainId: number
  symbol: string
  decimals: number
  coinKey?: string
}

describe('LI.FI HyperCore', function() {
  const makeTransfer = (
    payoutToken: LifiToken,
    payoutDecimals = 18
  ): unknown => ({
    sending: {
      txHash: '0xsend',
      amount: '20000000',
      token: {
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        chainId: 42161,
        symbol: 'USDC',
        decimals: 6,
        coinKey: 'USDC'
      },
      gasToken: {
        address: '0x0000000000000000000000000000000000000000',
        chainId: 42161,
        symbol: 'ETH',
        decimals: 18,
        coinKey: 'ETH'
      },
      timestamp: 1790640000
    },
    receiving: {
      txHash: '0xreceive',
      amount: '1885000000',
      token: payoutToken,
      gasToken: {
        address: '0x0D01DC56DcaaCa66aD901c959B4011ec00000000',
        chainId: payoutToken.chainId,
        symbol: 'HYPE',
        decimals: payoutDecimals,
        coinKey: 'HYPE'
      },
      timestamp: 1790640060
    },
    toAddress: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    status: 'DONE'
  })

  it('reads chain 1337 as HyperCore', function() {
    const tx = processLifiTx(
      makeTransfer(
        {
          address: '0x6d1e7cde53bA9467B783Cb7c530CE05400000000',
          chainId: 1337,
          symbol: 'USDC',
          decimals: 8
        },
        8
      ),
      pluginParams
    )
    expect(tx.depositChainPluginId).to.equal('arbitrum')
    expect(tx.payoutChainPluginId).to.equal('hypercore')
    expect(tx.payoutEvmChainId).to.equal(undefined)
    expect(tx.payoutTokenId).to.equal('6d1e7cde53ba9467b783cb7c530ce054')
    expect(tx.payoutAmount).to.equal(18.85)
  })

  it('reads HyperCore HYPE as the native coin', function() {
    const tx = processLifiTx(
      makeTransfer(
        {
          address: '0x0D01DC56DcaaCa66aD901c959B4011ec00000000',
          chainId: 1337,
          symbol: 'HYPE',
          decimals: 8,
          coinKey: 'HYPE'
        },
        8
      ),
      pluginParams
    )
    expect(tx.payoutChainPluginId).to.equal('hypercore')
    expect(tx.payoutTokenId).to.equal(null)
  })

  it('still reads chain 999 as HyperEVM', function() {
    const tx = processLifiTx(
      makeTransfer({
        address: '0x0000000000000000000000000000000000000000',
        chainId: 999,
        symbol: 'HYPE',
        decimals: 18,
        coinKey: 'HYPE'
      }),
      pluginParams
    )
    expect(tx.payoutChainPluginId).to.equal('hyperevm')
    expect(tx.payoutEvmChainId).to.equal(999)
    expect(tx.payoutTokenId).to.equal(null)
  })
})
