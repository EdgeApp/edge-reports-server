import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  BridgeTokens,
  decodeSubmittedDeposits,
  FetchBridgelessJson,
  processBridgelessTx,
  queryBridgeless
} from '../src/partners/bridgeless'
import { PluginParams, ScopedLog } from '../src/types'

const makeLog = (): {
  log: ScopedLog
  errors: string[]
  warnings: string[]
} => {
  const errors: string[] = []
  const warnings: string[] = []
  const log: ScopedLog = Object.assign(() => undefined, {
    warn: (message: string) => {
      warnings.push(message)
    },
    error: (message: string) => {
      errors.push(message)
    }
  })
  return { log, errors, warnings }
}

const makeParams = (
  overrides: Partial<PluginParams> = {}
): PluginParams & { errors: string[]; warnings: string[] } => {
  const { log, errors, warnings } = makeLog()
  return { apiKeys: {}, settings: {}, log, errors, warnings, ...overrides }
}

// Bridgeless mainnet tx AD7056D6... at height 8028531: one validator's
// MsgSubmitTransactions for an Edge (referral 2) Zano BTC -> BTC order
const EDGE_SUBMIT_TX =
  'CuEGCt4GCiIvY29yZS5icmlkZ2UuTXNnU3VibWl0VHJhbnNhY3Rpb25zErcGCi1icmlkZ2UxdDh4dzU2YXhnczRjcHU1M3N0NGRlMnU3dW15N21xcWthYXV5bHgShQYKATISQjB4ODgwYjUxYTExYTE5Yjg3NTY4MTI5N2VmNGI1YmM2ODNhNzVmNzAyMGE1NTgzZmFjMjIzZjNkMmZiNDVjMWVmZCCyy+sBKkAwNDBhMTgwYWNhNDE5NGExNThjMTc5NDVkZDExNWRiNDIwODZmNmYwNzRjMWY3NzgzODYyMWE0OTI3ZmZmYTkxMgYxNTUzNTdCKmJjMXF6Mnc1OGdybHI0cmQ0YXEzdnF0dHF0czR4ODdsY3d3a2RhYWF3MEoBMFJCMHhhYjhiMDgyMTc2MWY0YWU5ZmJjNDY0NGU5ZjJhYWIzN2Y0Y2U1ZWYwMjBhMzEwYTVjNDA1MmYzZjc1MTNkMjJjWioweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDByBjE1NDg5MXoDNDY2ggG8AzAxMDAwMDAwMDEyY2E4MThmMGY0ZWY0NjIxZTVjODJmMjgxMDM0ZjZjZWI2YzEzNDVkYTAyNTkxYTY4MTc5MWFmMzg2YmJlZWRjMDEwMDAwMDA2YTQ3MzA0NDAyMjAxMWUwNGMwYmMzODQyNmI3OTVkY2ZkNTMxMjBiNGI0MDFkMmE0YzkwMmU5YzRjYzkyZmJhZGFiNDk2NDUzMjc1MDIyMDU4MzJhYTEzYjIxYjU0MzM3MWMyZTI1NTNiNmM0NDYwZjI1ZjljODNjOTY5MDQ0ODdjNjZkOTIxOGE2ZDUwMWQwMTIxMDNmM2U3MGY5NWIwOGY2MjM4YWNjYTIxZGFiOTA4YTQ2Y2FiMWU0Y2U4YTA3NjFhMmQxMTM1MzIxOGM5OTUyNzAyZmZmZmZmZmYwMjI5NWMwMjAwMDAwMDAwMDAxNjAwMTQxMjlkNDNhMDdmMWQ0NmRhZjQxMTYwMTZiMDJlMTUzMWZkZmMzOWQ2NTBiNjFiMDkwMDAwMDAwMDE5NzZhOTE0OGYxMGI1MmMxMzBhY2ZlY2FlNGYxMWYzOGFkZmNlNWE5MjJiMGMyZTg4YWMwMDAwMDAwMIgBAhKBAQpbCk8KKC9ldGhlcm1pbnQuY3J5cHRvLnYxLmV0aHNlY3AyNTZrMS5QdWJLZXkSIwohAyTZDcUCau1WqRASJUFTq/FMzs3lGvfjRmb+vnod90uREgQKAggBGL3NBRIiChsKB2FicmlkZ2USEDQwMDAwMDAwMDAwMDAwMDAQgJL0ARpBgL8rbhJEmOXjBEvat7TMlMrviDVOqbtNjfaHBBPEG2AZeZulCnPSRyipNm2RV9NnuX8bvAk1BrabZaPk6WTI5gA='

// Bridgeless mainnet tx F393A1DE... at height 8015357: an order with no
// referral, so referral_id is left off the wire
const OTHER_SUBMIT_TX =
  'Cq8ECqwECiIvY29yZS5icmlkZ2UuTXNnU3VibWl0VHJhbnNhY3Rpb25zEoUECi1icmlkZ2UxNTM5Z21mNXh0bXJzOHdueGNjdmwwMmpmY3UzOXMwbDUwa3R1MmUS0wMKBTEzNDQxEkIweDhhOThkODUyNmJhZTU0OWQyNjJiZjg5MWQ5Mjg2YjA5ZjE0M2Y3YTIzM2NjMWQyZGEwYThjNDExY2ZlYmJmYWYYASDym+kDKioweGUzZmExMmJiZWEzZDlkOTRkYzFjMGM4Y2VhOGExMjQ2YWYxY2U0NjMyFjE4MDYwMDAwMDAwMDAwMDAwMDAwMDA6KjB4ODI1ZjczODQ1QTQxYjZDMEQzRmIwMzk0NDJEQkUyNjNBMjQxODQyZkIqMHg4MjVmNzM4NDVhNDFiNmMwZDNmYjAzOTQ0MmRiZTI2M2EyNDE4NDJmSgExWioweEM5ZkFFYkE4NmU4NTY3NDc3NzgzQjg0MzI5NDVGMTMxRDg0RTNmZEFihAEweDg3ZjUyYzAwZGU1NmRkNWM5OTI0YmZmYmUyMTJlYjNiOTFjMzRhM2I2Mjk0Yzg2NTg5ZmViNzE0YWI0Y2QxNzUwNjg1NGNiZTJjOGY2NTg1NDg0OTc5NTNlN2YwZWI2NTQ1NzFjM2NlNjgwYWY1YzU3NTViMmQxZjA5MTcwOTA4MWJoAXIWMTgwMDU4MjAwMDAwMDAwMDAwMDAwMHoTNTQxODAwMDAwMDAwMDAwMDAwMBKBAQpbCk8KKC9ldGhlcm1pbnQuY3J5cHRvLnYxLmV0aHNlY3AyNTZrMS5QdWJLZXkSIwohA4taeZnNMzp7wO4WgYikit9BOiq+4nHnskLCap1Aq6yvEgQKAggBGMueBRIiChsKB2FicmlkZ2USEDQwMDAwMDAwMDAwMDAwMDAQgJL0ARpBDw3C3vTfbrEanQsCs++AQIU+02zMV7GQD+3YzGVjXVoA8PeQ2DJkIp6G31zfjTHP+aSlmNKTJhReDfG5QULl+QE='

const EDGE_ORDER_HASH =
  '0x880b51a11a19b875681297ef4b5bc683a75f7020a5583fac223f3d2fb45c1efd'
const EDGE_ORDER_ID = `2/${EDGE_ORDER_HASH}/0`

const ZANO_BTC =
  '040a180aca4194a158c17945dd115db42086f6f074c1f77838621a4927fffa91'
const ZANO_SOL =
  '65b3bc549c8bc2c773781d5436f25f7af84644e61baaabd675d9867b007d17b4'
const NATIVE = '0x0000000000000000000000000000000000000000'

// The bridge state record for the Edge order above, from
// GET /cosmos/bridge/transactions/2/0x880b.../0
const completeRecord = {
  deposit_chain_id: '2',
  deposit_tx_hash: EDGE_ORDER_HASH,
  deposit_tx_index: '0',
  deposit_block: '3859890',
  deposit_token: ZANO_BTC,
  deposit_amount: '155357',
  depositor: '',
  receiver: 'bc1qz2w58grlr4rd4aq3vqttqts4x87lcwwkdaaaw0',
  withdrawal_chain_id: '0',
  withdrawal_tx_hash:
    '0xab8b0821761f4ae9fbc4644e9f2aab37f4ce5ef020a310a5c4052f3f7513d22c',
  withdrawal_token: NATIVE,
  signature: '',
  is_wrapped: false,
  withdrawal_amount: '154891',
  commission_amount: '466',
  tx_data: '',
  referral_id: 2,
  merkle_proof: '',
  epoch_id: 0
}

// An Edge Zano SOL -> SOL order the signers approved but nobody has claimed
const withdrawingRecord = {
  deposit_chain_id: '2',
  deposit_tx_hash:
    '0x34c6f4a219f96f11190ea7ac3cf1dea30826a0841455cd2db387bb5c98e9d288',
  deposit_tx_index: '0',
  deposit_block: '3780242',
  deposit_token: ZANO_SOL,
  deposit_amount: '257410',
  depositor: '',
  receiver: 'DyY7Fne3Zsk3fcyucZ3TRBoeonVmftZrwRoD6K7PTB4x',
  withdrawal_chain_id: '4',
  withdrawal_tx_hash: '',
  withdrawal_token: NATIVE,
  signature:
    '0x8e3061f7c3ef97f84313d08196437d3ef13b60bcf526292553b3a369c5b0350d641684a2c1217074fe1e79d1e08e4c9c509328cb2c943f5d5fb722ca436387c501',
  is_wrapped: false,
  withdrawal_amount: '256637770',
  commission_amount: '772230',
  tx_data: '',
  referral_id: 2,
  merkle_proof: '',
  epoch_id: 0
}

// A subset of GET /cosmos/bridge/tokens
const tokensResponse = {
  tokens: [
    {
      id: '8',
      metadata: { name: 'Bitcoin', symbol: 'BTC', uri: '', dex_name: '' },
      info: [
        { address: NATIVE, decimals: '8', chain_id: '0', token_id: '8' },
        { address: ZANO_BTC, decimals: '8', chain_id: '2', token_id: '8' }
      ]
    },
    {
      id: '10',
      metadata: { name: 'Solana', symbol: 'SOL', uri: '', dex_name: '' },
      info: [
        { address: NATIVE, decimals: '9', chain_id: '4', token_id: '10' },
        { address: ZANO_SOL, decimals: '6', chain_id: '2', token_id: '10' }
      ]
    }
  ],
  pagination: { next_key: null, total: '2' }
}

const tokens: BridgeTokens = new Map([
  [`0:${NATIVE}`, { currencyCode: 'BTC', decimals: 8 }],
  [`2:${ZANO_BTC}`, { currencyCode: 'BTC', decimals: 8 }],
  [`4:${NATIVE}`, { currencyCode: 'SOL', decimals: 9 }],
  [`2:${ZANO_SOL}`, { currencyCode: 'SOL', decimals: 6 }]
])

const ISO_DATE = '2026-10-14T23:39:16.123456789Z'

// The fake chain dates blocks relative to now, so the pending age limit
// does not depend on when the tests run
const DAY = 1000 * 60 * 60 * 24
const BLOCK_TIME = new Date(Date.now() - DAY).toISOString()

interface FakeChain {
  tip: number
  // Submit txs by height
  submits: { [height: number]: string[] }
  records: { [orderId: string]: object }
  // Make tx_search fail for windows wider than this many blocks
  maxSpan?: number
  // Make tx_search fail for windows starting at or after this height
  brokenFrom?: number
  // Make the token list fail
  tokensDown?: boolean
  // Runs when the token list is read, after the scan and dating
  onTokens?: () => void
}

const makeFakeFetch = (
  chain: FakeChain
): { fetchJson: FetchBridgelessJson; searches: Array<[number, number]> } => {
  const searches: Array<[number, number]> = []
  const fetchJson: FetchBridgelessJson = async url => {
    const { pathname, searchParams } = new URL(url)
    if (pathname === '/status') {
      return {
        result: { sync_info: { latest_block_height: String(chain.tip) } }
      }
    }
    if (pathname === '/tx_search') {
      const query = searchParams.get('query') ?? ''
      const from = Number(/tx.height>=(\d+)/.exec(query)?.[1])
      const to = Number(/tx.height<(\d+)/.exec(query)?.[1])
      searches.push([from, to])
      if (chain.maxSpan != null && to - from > chain.maxSpan) {
        throw new Error('504 Gateway Timeout')
      }
      if (chain.brokenFrom != null && from >= chain.brokenFrom) {
        throw new Error('502 Bad Gateway')
      }
      const txs: Array<{
        hash: string
        height: string
        tx_result: { code: number }
        tx: string
      }> = []
      for (const [height, list] of Object.entries(chain.submits)) {
        if (Number(height) < from || Number(height) >= to) continue
        for (const tx of list) {
          txs.push({ hash: 'AB', height, tx_result: { code: 0 }, tx })
        }
      }
      return { result: { txs, total_count: String(txs.length) } }
    }
    if (pathname === '/blockchain') {
      const height = searchParams.get('minHeight')
      return {
        result: { block_metas: [{ header: { height, time: BLOCK_TIME } }] }
      }
    }
    if (pathname === '/cosmos/bridge/tokens') {
      chain.onTokens?.()
      if (chain.tokensDown === true) throw new Error('Bridgeless error 503')
      return tokensResponse
    }
    const match = /^\/cosmos\/bridge\/transactions\/(.+)$/.exec(pathname)
    if (match != null) {
      const record = chain.records[match[1]]
      if (record == null) throw new Error('Bridgeless error 404')
      return { transaction: record }
    }
    throw new Error(`Unexpected url ${url}`)
  }
  return { fetchJson, searches }
}

describe('decodeSubmittedDeposits', () => {
  it('reads the deposit key and referral from a real Submit tx', () => {
    expect(decodeSubmittedDeposits(EDGE_SUBMIT_TX)).deep.equals([
      {
        chainId: '2',
        txHash: EDGE_ORDER_HASH,
        txIndex: '0',
        referralId: 2
      }
    ])
  })

  it('reads a missing referral as zero', () => {
    expect(decodeSubmittedDeposits(OTHER_SUBMIT_TX)).deep.equals([
      {
        chainId: '13441',
        txHash:
          '0x8a98d8526bae549d262bf891d9286b09f143f7a233cc1d2da0a8c411cfebbfaf',
        txIndex: '1',
        referralId: 0
      }
    ])
  })
})

describe('processBridgelessTx', () => {
  it('maps a paid-out order', () => {
    const tx = processBridgelessTx(completeRecord, ISO_DATE, tokens)
    expect(tx).to.deep.include({
      status: 'complete',
      orderId: EDGE_ORDER_ID,
      depositTxid:
        '880b51a11a19b875681297ef4b5bc683a75f7020a5583fac223f3d2fb45c1efd',
      depositCurrency: 'BTC',
      depositChainPluginId: 'zano',
      depositEvmChainId: undefined,
      depositTokenId: ZANO_BTC,
      depositAmount: 0.00155357,
      payoutTxid:
        'ab8b0821761f4ae9fbc4644e9f2aab37f4ce5ef020a310a5c4052f3f7513d22c',
      payoutAddress: 'bc1qz2w58grlr4rd4aq3vqttqts4x87lcwwkdaaaw0',
      payoutCurrency: 'BTC',
      payoutChainPluginId: 'bitcoin',
      payoutTokenId: null,
      payoutAmount: 0.00154891,
      isoDate: '2026-10-14T23:39:16.123Z',
      usdValue: -1,
      exchangeType: 'swap'
    })
  })

  it('maps a signed but unclaimed payout to withdrawing', () => {
    const tx = processBridgelessTx(withdrawingRecord, ISO_DATE, tokens)
    expect(tx.status).equals('withdrawing')
    expect(tx.payoutTxid).equals(undefined)
    expect(tx.depositAmount).equals(0.25741)
    expect(tx.payoutAmount).equals(0.25663777)
    expect(tx.payoutChainPluginId).equals('solana')
    expect(tx.payoutTokenId).equals(null)
  })

  it('maps an unsigned payout to processing', () => {
    const tx = processBridgelessTx(
      { ...withdrawingRecord, signature: '' },
      ISO_DATE,
      tokens
    )
    expect(tx.status).equals('processing')
  })

  it('throws on a token it cannot scale', () => {
    expect(() =>
      processBridgelessTx(
        { ...completeRecord, deposit_token: '0xabc' },
        ISO_DATE,
        tokens
      )
    ).to.throw('Unknown bridge token')
  })
})

describe('queryBridgeless', () => {
  it('reports an Edge order once despite one Submit per validator', async () => {
    const { fetchJson } = makeFakeFetch({
      tip: 8030000,
      submits: {
        8028531: [EDGE_SUBMIT_TX, EDGE_SUBMIT_TX, OTHER_SUBMIT_TX],
        8028532: [EDGE_SUBMIT_TX]
      },
      records: { [EDGE_ORDER_ID]: completeRecord }
    })
    const params = makeParams({ settings: { latestHeight: 8020000 } })
    const result = await queryBridgeless(params, fetchJson)
    expect(result.transactions.map(tx => tx.orderId)).deep.equals([
      EDGE_ORDER_ID
    ])
    expect(result.settings).deep.equals({
      latestHeight: 8030000,
      pendingOrders: {}
    })
    expect(params.errors).deep.equals([])
  })

  it('re-reads an unfinished order until it completes', async () => {
    const chain: FakeChain = {
      tip: 8030000,
      submits: { 8028531: [EDGE_SUBMIT_TX] },
      records: {
        [EDGE_ORDER_ID]: { ...completeRecord, withdrawal_tx_hash: '' }
      }
    }
    const { fetchJson } = makeFakeFetch(chain)
    const first = await queryBridgeless(
      makeParams({ settings: { latestHeight: 8020000 } }),
      fetchJson
    )
    expect(first.transactions[0].status).equals('processing')
    expect(first.settings.pendingOrders).deep.equals({
      [EDGE_ORDER_ID]: {
        chainId: '2',
        txHash: EDGE_ORDER_HASH,
        txIndex: '0',
        isoDate: BLOCK_TIME
      }
    })

    chain.tip = 8040000
    chain.records[EDGE_ORDER_ID] = completeRecord
    const second = await queryBridgeless(
      makeParams({ settings: first.settings }),
      fetchJson
    )
    expect(second.transactions.map(tx => tx.status)).deep.equals(['complete'])
    expect(second.settings).deep.equals({
      latestHeight: 8040000,
      pendingOrders: {}
    })
  })

  it('keeps an order it cannot read for the next run', async () => {
    const { fetchJson } = makeFakeFetch({
      tip: 8030000,
      submits: { 8028531: [EDGE_SUBMIT_TX] },
      records: {}
    })
    const params = makeParams({ settings: { latestHeight: 8020000 } })
    const result = await queryBridgeless(params, fetchJson)
    expect(result.transactions).deep.equals([])
    expect(Object.keys(result.settings.pendingOrders)).deep.equals([
      EDGE_ORDER_ID
    ])
    expect(params.errors).to.have.length(1)
  })

  it('splits windows the node cannot serve', async () => {
    const { fetchJson, searches } = makeFakeFetch({
      tip: 8030000,
      submits: { 8028531: [EDGE_SUBMIT_TX] },
      records: { [EDGE_ORDER_ID]: completeRecord },
      maxSpan: 3000
    })
    const params = makeParams({ settings: { latestHeight: 8020000 } })
    const result = await queryBridgeless(params, fetchJson)
    expect(result.settings.latestHeight).equals(8030000)
    expect(result.transactions).to.have.length(1)
    // Every height is read exactly once by a window the node served
    const served = searches.filter(([from, to]) => to - from <= 3000)
    expect(served[0][0]).equals(8020000)
    for (let i = 1; i < served.length; i++) {
      expect(served[i][0]).equals(served[i - 1][1])
    }
    expect(served[served.length - 1][1]).equals(8030000)
  })

  it('holds progress at a window that keeps failing', async () => {
    const { fetchJson } = makeFakeFetch({
      tip: 8030000,
      submits: { 8021000: [EDGE_SUBMIT_TX] },
      records: { [EDGE_ORDER_ID]: completeRecord },
      maxSpan: 1000,
      brokenFrom: 8022000
    })
    const params = makeParams({ settings: { latestHeight: 8020000 } })
    const result = await queryBridgeless(params, fetchJson)
    expect(result.settings.latestHeight).equals(8022000)
    expect(result.transactions).to.have.length(1)
    expect(params.errors[params.errors.length - 1]).contains(
      'scan stopped at height 8022000'
    )
  })

  it('stops re-reading an order with no payout after 90 days', async () => {
    const isoDate = new Date(Date.now() - 100 * DAY).toISOString()
    const { fetchJson } = makeFakeFetch({
      tip: 8030000,
      submits: {},
      records: {
        [EDGE_ORDER_ID]: { ...completeRecord, withdrawal_tx_hash: '' }
      }
    })
    const params = makeParams({
      settings: {
        latestHeight: 8030000,
        pendingOrders: {
          [EDGE_ORDER_ID]: {
            chainId: '2',
            txHash: EDGE_ORDER_HASH,
            txIndex: '0',
            isoDate
          }
        }
      }
    })
    const result = await queryBridgeless(params, fetchJson)
    expect(result.transactions.map(tx => tx.status)).deep.equals(['processing'])
    expect(result.settings.pendingOrders).deep.equals({})
    expect(params.warnings).to.have.length(1)
  })

  it('keeps orders and scan progress when the token list is down', async () => {
    const { fetchJson } = makeFakeFetch({
      tip: 8030000,
      submits: { 8028531: [EDGE_SUBMIT_TX] },
      records: { [EDGE_ORDER_ID]: completeRecord },
      tokensDown: true
    })
    const params = makeParams({ settings: { latestHeight: 8020000 } })
    const result = await queryBridgeless(params, fetchJson)
    expect(result.transactions).deep.equals([])
    expect(result.settings.latestHeight).equals(8030000)
    expect(Object.keys(result.settings.pendingOrders)).deep.equals([
      EDGE_ORDER_ID
    ])
    expect(params.errors[0]).contains('cannot read the bridge token list')
  })

  it('skips a tx it cannot decode and keeps scanning', async () => {
    // Field 1 with the unsupported group wire type
    const badTx = Buffer.from([0x0b]).toString('base64')
    const { fetchJson } = makeFakeFetch({
      tip: 8030000,
      submits: { 8028000: [badTx], 8028531: [EDGE_SUBMIT_TX] },
      records: { [EDGE_ORDER_ID]: completeRecord }
    })
    const params = makeParams({ settings: { latestHeight: 8020000 } })
    const result = await queryBridgeless(params, fetchJson)
    expect(result.settings.latestHeight).equals(8030000)
    expect(result.transactions.map(tx => tx.orderId)).deep.equals([
      EDGE_ORDER_ID
    ])
    expect(params.errors).to.have.length(1)
    expect(params.errors[0]).contains('skipping undecodable tx')
  })

  it('leaves orders for the next run once out of time', async () => {
    const realNow = Date.now
    try {
      const { fetchJson } = makeFakeFetch({
        tip: 8030000,
        submits: { 8028531: [EDGE_SUBMIT_TX] },
        records: { [EDGE_ORDER_ID]: completeRecord },
        onTokens: () => {
          Date.now = () => realNow() + 1000 * 60 * 4
        }
      })
      const params = makeParams({ settings: { latestHeight: 8020000 } })
      const result = await queryBridgeless(params, fetchJson)
      expect(result.transactions).deep.equals([])
      expect(result.settings.latestHeight).equals(8030000)
      expect(Object.keys(result.settings.pendingOrders)).deep.equals([
        EDGE_ORDER_ID
      ])
    } finally {
      Date.now = realNow
    }
  })
})
