import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  aggregateCampaigns,
  asConversionEvent,
  ConversionEvent,
  installerOf,
  lookupOf,
  MAX_CAMPAIGN_RANGE_DAYS,
  NO_PROMO,
  ORGANIC,
  parseCampaignRange,
  promoOf
} from '../src/util/campaigns'
import { makeTx } from './conversionFixtures'

const makeEvent = (fields: Partial<ConversionEvent>): ConversionEvent =>
  asConversionEvent({ event: 'Buy_Success', date: '2026-09-20', ...fields })

describe('campaign attribution', function() {
  it('credits the account referral, then the device referral', function() {
    expect(
      installerOf(
        makeEvent({
          refAccountInstallerId: 'acct',
          refDeviceInstallerId: 'dev'
        })
      )
    ).equals('acct')
    expect(
      installerOf(
        makeEvent({ refAccountInstallerId: '', refDeviceInstallerId: 'dev' })
      )
    ).equals('dev')
    expect(installerOf(makeEvent({}))).equals(ORGANIC)
  })

  it('uses the first promotion', function() {
    expect(promoOf(makeEvent({ promoIds: ['p1', 'p2'] }))).equals('p1')
    expect(promoOf(makeEvent({ promoIds: [] }))).equals(NO_PROMO)
  })

  it('joins on the provider id, not the chain plugin id', function() {
    expect(
      lookupOf(
        makeEvent({
          pluginId: 'bitcoin',
          fiatProviderId: 'paybis',
          orderId: 'x'
        })
      )
    ).deep.equals({ pluginId: 'paybis', orderId: 'x' })
    expect(lookupOf(makeEvent({ fiatProviderId: 'simplex' }))).equals(undefined)
  })
})

describe('aggregateCampaigns', function() {
  it('sums settled USD once per order under the reports partner', function() {
    const settled = { key: 'edge_banxa3:b1', doc: makeTx('edge_banxa3:b1') }
    const pending = {
      key: 'edge_banxa3:b2',
      doc: makeTx('edge_banxa3:b2', { status: 'pending' })
    }
    const events = [
      makeEvent({
        fiatProviderId: 'banxa',
        orderId: 'b1',
        refAccountInstallerId: 'web'
      }),
      makeEvent({
        fiatProviderId: 'banxa',
        orderId: 'b1',
        refAccountInstallerId: 'web'
      }),
      makeEvent({ fiatProviderId: 'banxa', orderId: 'b2' }),
      makeEvent({ fiatProviderId: 'banxa', orderId: 'b3' })
    ]
    const report = aggregateCampaigns('edge', events, [
      settled,
      settled,
      pending,
      undefined
    ])
    expect(report.rows).deep.equals([
      {
        date: '2026-09-20',
        pluginId: 'banxa3',
        installer: 'web',
        promo: NO_PROMO,
        usdValue: 100,
        count: 1
      }
    ])
    expect(report.joins).deep.equals([
      { pluginId: 'banxa', events: 4, matched: 3, settled: 2 }
    ])
  })
})

describe('parseCampaignRange', function() {
  it('requires a bounded, ordered range', function() {
    expect(parseCampaignRange('2026-09-01', '2026-09-28')).not.to.have.property(
      'error'
    )
    expect(parseCampaignRange(undefined, '2026-09-28')).to.have.property(
      'error'
    )
    expect(parseCampaignRange('2026-09-28', '2026-09-01')).to.have.property(
      'error'
    )
    expect(parseCampaignRange('2025-01-01', '2026-02-06')).to.have.property(
      'error',
      `The range may not exceed ${MAX_CAMPAIGN_RANGE_DAYS} days`
    )
  })
})
