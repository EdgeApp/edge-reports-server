import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  processChangeNowTx,
  setChangeNowCurrencies
} from '../src/partners/changenow'
import {
  processLetsExchangeTx,
  setLetsExchangeCoins
} from '../src/partners/letsexchange'
import { processLifiTx } from '../src/partners/lifi'
import {
  NexchangeCurrencyInfoMap,
  resolveNexchangeAsset
} from '../src/partners/nexchange'
import { processRangoTx } from '../src/partners/rango'
import {
  processSideshiftTx,
  setSideshiftCoins
} from '../src/partners/sideshift'
import { PluginParams, ScopedLog } from '../src/types'
import { tokenTypes } from '../src/util/asEdgeTokenId'
import { EVM_CHAIN_IDS, REVERSE_EVM_CHAIN_IDS } from '../src/util/chainIds'

// Silent logger so test output stays clean; the processors never branch on it.
const noopLog: ScopedLog = Object.assign(() => undefined, {
  warn: () => undefined,
  error: () => undefined
})

const pluginParams: PluginParams = {
  apiKeys: {},
  settings: {},
  log: noopLog
}

// USDG on Robinhood Chain, from the live ChangeNOW currency list.
const USDG_CONTRACT = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'
const USDG_TOKEN_ID = '5fc5360d0400a0fd4f2af552add042d716f1d168'
const BASE_USDC_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

describe('Robinhood Chain', () => {
  it('is an EVM chain with id 4663', () => {
    expect(EVM_CHAIN_IDS.robinhood).to.equal(4663)
    expect(REVERSE_EVM_CHAIN_IDS[4663]).to.equal('robinhood')
    expect(tokenTypes.robinhood).to.equal('evm')
  })

  it('maps a ChangeNOW order on network "hood"', async () => {
    setChangeNowCurrencies([
      {
        ticker: 'btc',
        network: 'btc',
        tokenContract: undefined,
        legacyTicker: undefined
      },
      {
        ticker: 'eth',
        network: 'hood',
        tokenContract: undefined,
        legacyTicker: 'ethhood'
      },
      {
        ticker: 'usdg',
        network: 'hood',
        tokenContract: USDG_CONTRACT,
        legacyTicker: undefined
      }
    ])

    const tx = await processChangeNowTx(
      {
        createdAt: '2026-09-25T12:00:00.000Z',
        requestId: 'cn-hood-1',
        status: 'finished',
        payin: {
          currency: 'btc',
          network: 'btc',
          address: 'bc1qexample',
          amount: 0.01
        },
        payout: {
          currency: 'usdg',
          network: 'hood',
          address: '0x1111111111111111111111111111111111111111',
          amount: 1100
        }
      },
      pluginParams
    )

    expect(tx.depositChainPluginId).to.equal('bitcoin')
    expect(tx.depositTokenId).to.equal(null)
    expect(tx.payoutCurrency).to.equal('USDG')
    expect(tx.payoutChainPluginId).to.equal('robinhood')
    expect(tx.payoutEvmChainId).to.equal(4663)
    expect(tx.payoutTokenId).to.equal(USDG_TOKEN_ID)
  })

  it('maps a ChangeNOW native ETH payout on "hood"', async () => {
    setChangeNowCurrencies([
      {
        ticker: 'btc',
        network: 'btc',
        tokenContract: undefined,
        legacyTicker: undefined
      },
      {
        ticker: 'eth',
        network: 'hood',
        tokenContract: undefined,
        legacyTicker: 'ethhood'
      }
    ])

    const tx = await processChangeNowTx(
      {
        createdAt: '2026-09-25T12:00:00.000Z',
        requestId: 'cn-hood-2',
        status: 'finished',
        payin: {
          currency: 'btc',
          network: 'btc',
          address: 'bc1qexample',
          amount: 0.01
        },
        payout: {
          currency: 'eth',
          network: 'hood',
          address: '0x1111111111111111111111111111111111111111',
          amount: 0.3
        }
      },
      pluginParams
    )

    expect(tx.payoutChainPluginId).to.equal('robinhood')
    expect(tx.payoutEvmChainId).to.equal(4663)
    expect(tx.payoutTokenId).to.equal(null)
  })

  it('maps a Rango swap from blockchain "ROBINHOOD"', () => {
    const tx = processRangoTx(
      {
        requestId: 'rango-hood-1',
        transactionTime: '2026-09-25T12:00:00.000+00:00',
        status: 'success',
        stepsSummary: [
          {
            swapper: { swapperId: 'Relay' },
            fromToken: {
              blockchainData: { blockchain: 'ROBINHOOD' },
              symbol: 'ETH',
              address: null,
              decimals: 18,
              realAmount: 0.5
            },
            toToken: {
              blockchainData: { blockchain: 'BASE' },
              symbol: 'USDC',
              address: BASE_USDC_CONTRACT,
              decimals: 6,
              realAmount: 1800
            },
            status: 'success',
            stepNumber: 1
          }
        ]
      },
      pluginParams
    )

    expect(tx.depositChainPluginId).to.equal('robinhood')
    expect(tx.depositEvmChainId).to.equal(4663)
    expect(tx.depositTokenId).to.equal(null)
    expect(tx.payoutChainPluginId).to.equal('base')
    expect(tx.payoutTokenId).to.equal(BASE_USDC_CONTRACT.slice(2))
  })

  it('maps a LI.FI transfer on chain 4663 to robinhood, not ethereum', () => {
    // The gas token is ETH, which alone would read as Ethereum mainnet. The
    // chain id must win.
    const robinhoodEth = {
      address: '0x0000000000000000000000000000000000000000',
      chainId: 4663,
      symbol: 'ETH',
      decimals: 18,
      coinKey: 'ETH'
    }
    const tx = processLifiTx(
      {
        sending: {
          txHash: '0xsend',
          amount: '1000000',
          token: {
            address: USDG_CONTRACT,
            chainId: 4663,
            symbol: 'USDG',
            decimals: 6
          },
          gasToken: robinhoodEth,
          amountUSD: '1.00',
          timestamp: 1790000000
        },
        receiving: {
          txHash: '0xreceive',
          amount: '500000000000000',
          token: robinhoodEth,
          gasToken: robinhoodEth,
          timestamp: 1790000060
        },
        toAddress: '0x1111111111111111111111111111111111111111',
        status: 'DONE'
      },
      pluginParams
    )

    expect(tx.depositChainPluginId).to.equal('robinhood')
    expect(tx.depositEvmChainId).to.equal(4663)
    expect(tx.depositTokenId).to.equal(USDG_TOKEN_ID)
    expect(tx.payoutChainPluginId).to.equal('robinhood')
    expect(tx.payoutEvmChainId).to.equal(4663)
    expect(tx.payoutTokenId).to.equal(null)
  })

  it('maps a SideShift order on network "robinhood"', async () => {
    // A /v2/coins response trimmed to the rows this order touches.
    setSideshiftCoins([
      { coin: 'BTC', networks: ['bitcoin'] },
      { coin: 'ETH', networks: ['ethereum', 'robinhood'] },
      {
        coin: 'USDG',
        networks: ['robinhood'],
        tokenDetails: { robinhood: { contractAddress: USDG_CONTRACT } }
      }
    ])
    const tx = await processSideshiftTx(
      {
        id: 'ss-hood-1',
        status: 'settled',
        depositAddress: {
          address: '0x2222222222222222222222222222222222222222'
        },
        depositAsset: 'USDG',
        depositNetwork: 'robinhood',
        depositHash: '0xdeposit',
        invoiceAmount: '100',
        settleAddress: { address: 'bc1qexample' },
        settleAmount: '0.001',
        settleAsset: 'BTC',
        settleNetwork: 'bitcoin',
        settleHash: 'btcsettle',
        createdAt: '2026-09-20T10:00:00.000Z'
      },
      pluginParams
    )

    expect(tx.depositChainPluginId).to.equal('robinhood')
    expect(tx.depositEvmChainId).to.equal(4663)
    expect(tx.depositTokenId).to.equal(USDG_TOKEN_ID)
    expect(tx.payoutChainPluginId).to.equal('bitcoin')
    expect(tx.payoutTokenId).to.equal(null)
  })

  it('maps a LetsExchange order on network ROBINHOOD', async () => {
    const letsExchangeParams: PluginParams = {
      apiKeys: { affiliateId: 'test', apiKey: 'test' },
      settings: {},
      log: noopLog
    }
    // A /v1/coins response trimmed to the rows this order touches. Seeding
    // for the same apiKey keeps processLetsExchangeTx off the network.
    setLetsExchangeCoins('test', [
      {
        code: 'BTC',
        network_code: 'BTC',
        contract_address: null,
        chain_id: null
      },
      {
        code: 'ETH',
        network_code: 'ROBINHOOD',
        contract_address: null,
        chain_id: '4663'
      },
      {
        code: 'USDG',
        network_code: 'ROBINHOOD',
        contract_address: USDG_CONTRACT,
        chain_id: '4663'
      }
    ])
    const tx = await processLetsExchangeTx(
      {
        status: 'success',
        transaction_id: 'le-hood-1',
        hash_in: 'btcdeposit',
        deposit: 'bc1qexample',
        coin_from: 'BTC',
        deposit_amount: '0.001',
        withdrawal: '0x1111111111111111111111111111111111111111',
        coin_to: 'USDG',
        withdrawal_amount: '100',
        created_at: '2026-09-20 10:00:00',
        coin_from_network: 'BTC',
        coin_to_network: 'ROBINHOOD'
      },
      letsExchangeParams
    )

    expect(tx.depositChainPluginId).to.equal('bitcoin')
    expect(tx.depositTokenId).to.equal(null)
    expect(tx.payoutChainPluginId).to.equal('robinhood')
    expect(tx.payoutEvmChainId).to.equal(4663)
    expect(tx.payoutTokenId).to.equal(USDG_TOKEN_ID)
  })

  it('resolves the Nexchange ETHRH currency on network ROBINHOOD', () => {
    const currencyMap: NexchangeCurrencyInfoMap = {
      ETHRH: {
        code: 'ETHRH',
        is_fiat: false,
        network: 'ROBINHOOD',
        contract_address: null,
        common_symbol: 'ETH'
      }
    }
    const asset = resolveNexchangeAsset('ETHRH', currencyMap)
    expect(asset.currencyCode).to.equal('ETH')
    expect(asset.chainPluginId).to.equal('robinhood')
    expect(asset.evmChainId).to.equal(4663)
    expect(asset.tokenId).to.equal(null)
  })
})
