import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  NEXCHANGE_NETWORK_TO_PLUGIN_ID,
  NexchangeCurrencyInfoMap,
  parseApiDate,
  processNexchangeTx,
  resolveNexchangeAsset,
  toQueryIsoDate
} from '../src/partners/nexchange'

const currencyMap: NexchangeCurrencyInfoMap = {
  BTC: {
    code: 'BTC',
    is_fiat: false,
    network: 'BTC',
    contract_address: null,
    common_symbol: 'BTC'
  },
  USDTTRX: {
    code: 'USDTTRX',
    is_fiat: false,
    network: 'TRON',
    contract_address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    common_symbol: 'USDT'
  },
  USDCSOL: {
    code: 'USDCSOL',
    is_fiat: false,
    network: 'SOL',
    contract_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    common_symbol: 'USDC'
  },
  USDTERC: {
    code: 'USDTERC',
    is_fiat: false,
    network: 'ETH',
    contract_address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    common_symbol: 'USDT'
  },
  ETHBASE: {
    code: 'ETHBASE',
    is_fiat: false,
    network: 'BASE',
    contract_address: null,
    common_symbol: 'ETH'
  },
  HYPE: {
    code: 'HYPE',
    is_fiat: false,
    network: 'HyperEvm',
    contract_address: null,
    common_symbol: null
  },
  USDTMATIC: {
    code: 'USDTMATIC',
    is_fiat: false,
    network: 'MATIC',
    contract_address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    common_symbol: 'USDT-old'
  },
  USD: {
    code: 'USD',
    is_fiat: true,
    network: null,
    contract_address: null,
    common_symbol: null
  },
  XYZTOKEN: {
    code: 'XYZTOKEN',
    is_fiat: false,
    network: 'UNKNOWNNET',
    contract_address: '0xdeadbeef',
    common_symbol: 'XYZ'
  },
  BADTOKEN: {
    code: 'BADTOKEN',
    is_fiat: false,
    network: 'ATOM',
    contract_address: 'NOT A VALID DENOM',
    common_symbol: 'BAD'
  },
  // A token (has a contract address) on a chain Edge does not model tokens for.
  USDCXLM: {
    code: 'USDCXLM',
    is_fiat: false,
    network: 'XLM',
    contract_address:
      'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    common_symbol: 'USDC'
  }
}

function makeRawOrder(overrides: { [key: string]: any } = {}): unknown {
  return {
    orderId: 'NEX-DEFAULT',
    status: 'Released',
    createdAt: '2026-01-20T11:43:10+00:00',
    deposit: {
      currency: 'USDTTRX',
      amount: '100.00000000',
      address: 'TQhaM...sample',
      txid: '0xdep123'
    },
    payout: {
      currency: 'BTC',
      amount: '0.00145000',
      address: 'bc1q...sample',
      txid: '0xpay123'
    },
    countryCode: 'PT',
    ...overrides
  }
}

describe('nexchange plugin', () => {
  describe('processNexchangeTx', () => {
    it('maps Edge audit order payload into StandardTx with chain plugin and token ids', () => {
      const tx = processNexchangeTx(
        makeRawOrder({ orderId: 'NEX-ABCD1234' }),
        currencyMap
      )

      expect(tx.orderId).to.equal('NEX-ABCD1234')
      expect(tx.status).to.equal('complete')
      expect(tx.exchangeType).to.equal('swap')
      expect(tx.direction).to.equal(null)
      expect(tx.depositCurrency).to.equal('USDT')
      expect(tx.depositChainPluginId).to.equal('tron')
      expect(tx.depositTokenId).to.equal('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
      expect(tx.depositEvmChainId).to.equal(undefined)
      expect(tx.payoutCurrency).to.equal('BTC')
      expect(tx.payoutChainPluginId).to.equal('bitcoin')
      expect(tx.payoutTokenId).to.equal(null)
      expect(tx.depositAmount).to.equal(100)
      expect(tx.payoutAmount).to.equal(0.00145)
      expect(tx.countryCode).to.equal('PT')
      expect(tx.isoDate).to.equal('2026-01-20T11:43:10.000Z')
      expect(tx.timestamp).to.equal(1768909390)
    })

    const statusCases: Array<[string, string]> = [
      ['Released', 'complete'],
      ['completed', 'complete'],
      ['done', 'complete'],
      ['processing', 'processing'],
      ['confirming', 'processing'],
      ['pending', 'pending'],
      ['NEW', 'pending'],
      ['Waiting', 'pending'],
      ['expired', 'expired'],
      ['blocked', 'blocked'],
      ['Refund', 'refunded'],
      ['refunded', 'refunded'],
      ['cancelled', 'other'],
      ['canceled', 'other'],
      ['failed', 'other'],
      ['something-else', 'other']
    ]
    for (const [rawStatus, expected] of statusCases) {
      it(`maps status "${rawStatus}" to "${expected}"`, () => {
        const tx = processNexchangeTx(
          makeRawOrder({ status: rawStatus }),
          currencyMap
        )
        expect(tx.status).to.equal(expected)
      })
    }
  })

  describe('resolveNexchangeAsset', () => {
    it('lowercases and 0x-strips EVM token addresses and returns the EVM chain id', () => {
      const asset = resolveNexchangeAsset('USDTERC', currencyMap)
      expect(asset.currencyCode).to.equal('USDT')
      expect(asset.chainPluginId).to.equal('ethereum')
      expect(asset.tokenId).to.equal('dac17f958d2ee523a2206206994597c13d831ec7')
      expect(asset.evmChainId).to.equal(1)
    })

    it('returns null tokenId for native EVM assets (e.g. ETHBASE)', () => {
      const asset = resolveNexchangeAsset('ETHBASE', currencyMap)
      expect(asset.currencyCode).to.equal('ETH')
      expect(asset.chainPluginId).to.equal('base')
      expect(asset.tokenId).to.equal(null)
      expect(asset.evmChainId).to.equal(8453)
    })

    it('matches mixed-case n.exchange networks case-insensitively', () => {
      const asset = resolveNexchangeAsset('HYPE', currencyMap)
      expect(asset.chainPluginId).to.equal('hyperevm')
      expect(asset.tokenId).to.equal(null)
      expect(asset.evmChainId).to.equal(999)
    })

    it('returns unmapped fields when the currency is not in the catalog', () => {
      const asset = resolveNexchangeAsset('XYZ', currencyMap)
      expect(asset.currencyCode).to.equal('XYZ')
      expect(asset.chainPluginId).to.equal(undefined)
      expect(asset.tokenId).to.equal(undefined)
      expect(asset.evmChainId).to.equal(undefined)
    })

    it('returns unmapped fields for fiat currencies', () => {
      const asset = resolveNexchangeAsset('USD', currencyMap)
      expect(asset.currencyCode).to.equal('USD')
      expect(asset.chainPluginId).to.equal(undefined)
      expect(asset.tokenId).to.equal(undefined)
      expect(asset.evmChainId).to.equal(undefined)
    })

    it('returns unmapped fields when the network is unknown to Edge', () => {
      const asset = resolveNexchangeAsset('XYZTOKEN', currencyMap)
      expect(asset.currencyCode).to.equal('XYZ')
      expect(asset.chainPluginId).to.equal(undefined)
      expect(asset.tokenId).to.equal(undefined)
      expect(asset.evmChainId).to.equal(undefined)
    })

    it('keeps the raw currency code when common_symbol is non-alphanumeric (e.g. "USDT-old")', () => {
      const asset = resolveNexchangeAsset('USDTMATIC', currencyMap)
      expect(asset.currencyCode).to.equal('USDTMATIC')
      expect(asset.chainPluginId).to.equal('polygon')
      expect(asset.tokenId).to.equal('c2132d05d31c914a87c6611c10748aeb04b58e8f')
    })

    it('throws when a token chain has a contract address that fails createTokenId', () => {
      expect(() => resolveNexchangeAsset('BADTOKEN', currencyMap)).to.throw(
        /Invalid contract address/
      )
    })

    it('throws for a token (contract address) on a chain Edge does not model tokens for', () => {
      // USDC on Stellar: pricing it as native XLM would overcount volume, so
      // the unmapped token type must surface as an error rather than fall back
      // to tokenId: null.
      expect(() => resolveNexchangeAsset('USDCXLM', currencyMap)).to.throw(
        /Unknown tokenType for chainPluginId "stellar"/
      )
    })
  })

  describe('parseApiDate', () => {
    it('parses an offset-suffixed date', () => {
      const result = parseApiDate('2026-01-20T11:43:10+00:00')
      expect(result.isoDate).to.equal('2026-01-20T11:43:10.000Z')
      expect(result.timestamp).to.equal(1768909390)
    })

    it('parses a Z-suffixed date', () => {
      const result = parseApiDate('2026-01-20T11:43:10Z')
      expect(result.isoDate).to.equal('2026-01-20T11:43:10.000Z')
    })

    it('appends Z when no timezone suffix is present', () => {
      const result = parseApiDate('2026-01-20T11:43:10')
      expect(result.isoDate).to.equal('2026-01-20T11:43:10.000Z')
    })

    it('throws on an invalid date string', () => {
      expect(() => parseApiDate('not-a-date')).to.throw(/Invalid createdAt/)
    })
  })

  describe('toQueryIsoDate', () => {
    it('rewinds latestIsoDate by the lookback window', () => {
      const result = toQueryIsoDate('2026-01-20T00:00:00.000Z')
      expect(result).to.equal('2026-01-15T00:00:00.000Z')
    })

    it('clamps to the epoch when latestIsoDate is near zero', () => {
      const result = toQueryIsoDate('1970-01-01T00:00:00.000Z')
      expect(result).to.equal('1970-01-01T00:00:00.000Z')
    })
  })

  describe('NEXCHANGE_NETWORK_TO_PLUGIN_ID', () => {
    it('covers the representative n.exchange networks used by Edge users', () => {
      expect(NEXCHANGE_NETWORK_TO_PLUGIN_ID.eth).to.equal('ethereum')
      expect(NEXCHANGE_NETWORK_TO_PLUGIN_ID.bsc).to.equal('binancesmartchain')
      expect(NEXCHANGE_NETWORK_TO_PLUGIN_ID.sol).to.equal('solana')
    })

    it('maps both TRON and TRX (the v2 catalog and historical audit forms)', () => {
      expect(NEXCHANGE_NETWORK_TO_PLUGIN_ID.tron).to.equal('tron')
      expect(NEXCHANGE_NETWORK_TO_PLUGIN_ID.trx).to.equal('tron')
    })

    it('maps both MATIC and POL to the same Polygon chain id', () => {
      expect(NEXCHANGE_NETWORK_TO_PLUGIN_ID.matic).to.equal('polygon')
      expect(NEXCHANGE_NETWORK_TO_PLUGIN_ID.pol).to.equal('polygon')
    })
  })
})
