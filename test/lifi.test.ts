import { expect } from 'chai'
import { describe, it } from 'mocha'

import { processLifiTransfers } from '../src/partners/lifi'
import { PluginParams, ScopedLog } from '../src/types'

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

const ethereumEth = {
  address: '0x0000000000000000000000000000000000000000',
  chainId: 1,
  symbol: 'ETH',
  decimals: 18,
  coinKey: 'ETH'
}
const baseEth = { ...ethereumEth, chainId: 8453 }

const makeTransfer = (
  txHash: string,
  sendingToken: typeof ethereumEth
): unknown => ({
  sending: {
    txHash,
    amount: '1000000000000000000',
    token: sendingToken,
    gasToken: sendingToken,
    amountUSD: '2500.00',
    timestamp: 1790000000
  },
  receiving: {
    txHash: `${txHash}-receive`,
    amount: '990000000000000000',
    token: baseEth,
    gasToken: baseEth,
    timestamp: 1790000060
  },
  toAddress: '0x1111111111111111111111111111111111111111',
  status: 'DONE'
})

describe('processLifiTransfers', () => {
  it('skips and logs an unprocessable transfer and keeps the rest of the page', () => {
    const { log, errors } = makeLog()
    const pluginParams: PluginParams = { apiKeys: {}, settings: {}, log }

    // Chain id 99999 is unknown and its gas token code maps to no chain, so
    // processLifiTx throws "Missing chain plugin id" for it.
    const unknownChainToken = {
      address: '0x0000000000000000000000000000000000000000',
      chainId: 99999,
      symbol: 'XYZ',
      decimals: 18,
      coinKey: 'XYZ'
    }
    const result = processLifiTransfers(
      [
        makeTransfer('0xgood1', ethereumEth),
        makeTransfer('0xbad', unknownChainToken),
        makeTransfer('0xgood2', ethereumEth)
      ],
      pluginParams
    )

    expect(result.skipped).to.equal(1)
    expect(result.standardTxs.map(tx => tx.orderId)).to.deep.equal([
      '0xgood1',
      '0xgood2'
    ])
    expect(result.standardTxs[0].depositChainPluginId).to.equal('ethereum')
    expect(result.standardTxs[0].payoutChainPluginId).to.equal('base')

    const skipLog = errors.find(message => message.includes('skipping'))
    expect(skipLog).to.include('Missing chain plugin id')
    expect(skipLog).to.include('sending.txHash=0xbad')
  })

  it('skips a transfer that fails the cleaner', () => {
    const { log, errors } = makeLog()
    const pluginParams: PluginParams = { apiKeys: {}, settings: {}, log }

    const result = processLifiTransfers(
      [{ status: 'DONE' }, makeTransfer('0xgood', ethereumEth)],
      pluginParams
    )

    expect(result.skipped).to.equal(1)
    expect(result.standardTxs.map(tx => tx.orderId)).to.deep.equal(['0xgood'])
    expect(
      errors.some(message => message.includes('sending.txHash=unknown'))
    ).to.equal(true)
  })
})
