import { expect } from 'chai'
import { describe, it } from 'mocha'

import { processSimplexTx } from '../src/partners/simplex'
import { ScopedLog } from '../src/types'

const makeLog = (): { log: ScopedLog; warnings: string[] } => {
  const warnings: string[] = []
  const log: ScopedLog = Object.assign(() => undefined, {
    warn: (message: string) => {
      warnings.push(message)
    },
    error: () => undefined
  })
  return { log, warnings }
}

// An approved order as the Simplex transactions API returns it, trimmed to
// the fields ingestion reads.
const makeOrder = (cryptoCurrency: string): unknown => ({
  amount_usd: '250.00',
  amount_crypto: '249.1',
  fiat_total_amount: '250.00',
  created_at: 1762300800,
  order_id: 'e75aa09c-0000-4000-8000-000000000000',
  country: 'US',
  crypto_currency: cryptoCurrency,
  currency: 'USD',
  status_name: 'approved'
})

const payoutOf = (
  cryptoCurrency: string
): {
  chain: string | undefined
  evm: number | undefined
  token: string | null | undefined
  warnings: string[]
} => {
  const { log, warnings } = makeLog()
  const tx = processSimplexTx(makeOrder(cryptoCurrency), log)
  return {
    chain: tx.payoutChainPluginId,
    evm: tx.payoutEvmChainId,
    token: tx.payoutTokenId,
    warnings
  }
}

describe('processSimplexTx', () => {
  it('maps a suffixed token code to its chain and token', () => {
    expect(payoutOf('USDT-TRC20')).to.deep.equal({
      chain: 'tron',
      evm: undefined,
      token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      warnings: []
    })
    expect(payoutOf('USDT-POL')).to.deep.equal({
      chain: 'polygon',
      evm: 137,
      token: 'c2132d05d31c914a87c6611c10748aeb04b58e8f',
      warnings: []
    })
  })

  it('maps a bare token code to its Ethereum token', () => {
    expect(payoutOf('USDT')).to.deep.equal({
      chain: 'ethereum',
      evm: 1,
      token: 'dac17f958d2ee523a2206206994597c13d831ec7',
      warnings: []
    })
  })

  it('maps native codes to a null tokenId', () => {
    expect(payoutOf('BTC')).to.deep.equal({
      chain: 'bitcoin',
      evm: undefined,
      token: null,
      warnings: []
    })
    expect(payoutOf('ETH-OPTIMISM')).to.deep.equal({
      chain: 'optimism',
      evm: 10,
      token: null,
      warnings: []
    })
  })

  it('maps BNB to BNB Smart Chain, not the retired Beacon Chain', () => {
    expect(payoutOf('BNB')).to.deep.equal({
      chain: 'binancesmartchain',
      evm: 56,
      token: null,
      warnings: []
    })
  })

  it('matches codes without regard to case', () => {
    expect(payoutOf('usdc-sol').chain).to.equal('solana')
  })

  it('stores the chain of a token that has no Edge builtin', () => {
    expect(payoutOf('USDT-TON')).to.deep.equal({
      chain: 'ton',
      evm: undefined,
      token: undefined,
      warnings: []
    })
  })

  it('warns about a code missing from the table and keeps the order', () => {
    const { log, warnings } = makeLog()
    const tx = processSimplexTx(makeOrder('XMR'), log)

    expect(tx.orderId).to.equal('e75aa09c-0000-4000-8000-000000000000')
    expect(tx.payoutCurrency).to.equal('XMR')
    expect(tx.payoutChainPluginId).to.equal(undefined)
    expect(tx.payoutTokenId).to.equal(undefined)
    expect(tx.usdValue).to.equal(250)
    expect(warnings).to.have.length(1)
    expect(warnings[0]).to.include('XMR')
  })
})
