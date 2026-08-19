import { expect } from 'chai'
import { describe, it } from 'mocha'

import { getAnalytics } from '../src/apiAnalytics'
import {
  inputFour,
  inputOne,
  inputThree,
  inputTwo,
  outputFour,
  outputOne,
  outputThree,
  outputTwo
} from './testData.json'

describe('apiAnalytics function tests', function() {
  const withoutChainedPairs = (
    result: ReturnType<typeof getAnalytics>
  ): ReturnType<typeof getAnalytics> => {
    const copy = JSON.parse(JSON.stringify(result))
    for (const period of ['hour', 'day', 'month'] as const) {
      for (const bucket of copy.result[period]) {
        delete bucket.chainedPairs
      }
    }
    return copy
  }

  it('A Real Coinswitch Query for Month of July 2020', function() {
    expect(
      JSON.stringify(
        withoutChainedPairs(
          getAnalytics(
            inputOne,
            1594023608,
            1596055300,
            'edge',
            'coinswitch',
            'month'
          )
        )
      )
    ).equals(JSON.stringify(outputOne))
  })
  it('Create All 3 Buckets', function() {
    expect(
      JSON.stringify(
        withoutChainedPairs(
          getAnalytics(
            inputTwo,
            1300000000,
            1300070000,
            'app-dummy',
            'partner-dummy',
            'month|day|hour'
          )
        )
      )
    ).equals(JSON.stringify(outputTwo))
  })
  it('Leap Year Test', function() {
    expect(
      JSON.stringify(
        withoutChainedPairs(
          getAnalytics(
            inputThree,
            1708992000,
            1709424000,
            'app-dummy',
            'partner-dummy',
            'day|hour'
          )
        )
      )
    ).equals(JSON.stringify(outputThree))
  })
  it('Year Rollover', function() {
    expect(
      JSON.stringify(
        withoutChainedPairs(
          getAnalytics(
            inputFour,
            1672444800,
            1706918400,
            'app-dummy',
            'partner-dummy',
            'month'
          )
        )
      )
    ).equals(JSON.stringify(outputFour))
  })
  it('dual-writes chainedPairs with pluginId when chain is present', function() {
    const result = getAnalytics(
      [
        {
          orderId: '1',
          depositCurrency: 'USDC',
          payoutCurrency: 'ETH',
          depositChainPluginId: 'ethereum',
          payoutChainPluginId: 'ethereum',
          timestamp: 1594351955,
          usdValue: 100
        }
      ],
      1594023608,
      1596055300,
      'edge',
      'coinswitch',
      'month'
    )
    const month = result.result.month.find(bucket => bucket.numTxs > 0)
    expect(month).to.not.equal(undefined)
    if (month == null) return
    expect(month.currencyPairs['USDC-ETH']).to.equal(100)
    expect(month.chainedPairs?.['USDC@ethereum>ETH@ethereum']).to.equal(100)
  })
  it('keys chainedPairs without @ when chain is absent', function() {
    const result = getAnalytics(
      [
        {
          orderId: '1',
          depositCurrency: 'DOGE',
          payoutCurrency: 'ETH',
          timestamp: 1594351955,
          usdValue: 50
        }
      ],
      1594023608,
      1596055300,
      'edge',
      'coinswitch',
      'month'
    )
    const month = result.result.month.find(bucket => bucket.numTxs > 0)
    expect(month).to.not.equal(undefined)
    if (month == null) return
    expect(month.currencyPairs['DOGE-ETH']).to.equal(50)
    expect(month.chainedPairs?.['DOGE>ETH']).to.equal(50)
  })
  it('keeps a fiat leg ticker-only in chainedPairs', function() {
    const result = getAnalytics(
      [
        {
          orderId: '1',
          depositCurrency: 'USD',
          payoutCurrency: 'BTC',
          payoutChainPluginId: 'bitcoin',
          timestamp: 1594351955,
          usdValue: 25
        }
      ],
      1594023608,
      1596055300,
      'edge',
      'banxa',
      'month'
    )
    const month = result.result.month.find(bucket => bucket.numTxs > 0)
    expect(month).to.not.equal(undefined)
    if (month == null) return
    expect(month.chainedPairs?.['USD>BTC@bitcoin']).to.equal(25)
  })
})
