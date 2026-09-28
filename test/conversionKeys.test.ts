import { expect } from 'chai'
import { describe, it } from 'mocha'
import { DocumentScope } from 'nano'

import { candidateKeys, candidatePluginIds } from '../src/util/conversionKeys'
import { makeTxStore, resolveTxs } from '../src/util/resolveConversions'
import { makeStore, makeTx } from './conversionFixtures'

describe('conversion keys', function() {
  it('aliases app provider ids to their reports partner', function() {
    expect(candidatePluginIds('mayaprotocol', [])).deep.equals([
      'maya',
      'mayaprotocol'
    ])
  })

  it('adds numbered app partner variants', function() {
    expect(
      candidatePluginIds('banxa', ['banxa', 'banxa3', 'banxaother', 'moonpay'])
    ).deep.equals(['banxa', 'banxa3'])
  })

  it('tries the order id without its 0x prefix', function() {
    expect(candidateKeys('edge', 'thorchain', '0xABC', [])).deep.equals([
      'edge_thorchain:0xabc',
      'edge_thorchain:abc'
    ])
  })
})

describe('resolveTxs', function() {
  it('finds each order under its first matching key', async function() {
    const store = makeStore([
      makeTx('edge_moonpay:m1'),
      makeTx('edge_banxa3:b1'),
      makeTx('edge_maya:abc')
    ])
    const txs = await resolveTxs(
      store,
      'edge',
      ['banxa', 'banxa3'],
      [
        { pluginId: 'moonpay', orderId: 'M1' },
        { pluginId: 'banxa', orderId: 'b1' },
        { pluginId: 'mayaprotocol', orderId: '0xabc' },
        { pluginId: 'moonpay', orderId: 'missing' }
      ]
    )
    expect(txs.map(tx => tx?.key)).deep.equals([
      'edge_moonpay:m1',
      'edge_banxa3:b1',
      'edge_maya:abc',
      undefined
    ])
    expect(store.finds).deep.equals([])
  })

  it('finds request-id partners by rawTx.request.id', async function() {
    const store = makeStore([
      makeTx('edge_paybis:pb1tx1', { requestId: 'req-1' })
    ])
    const txs = await resolveTxs(
      store,
      'edge',
      [],
      [
        { pluginId: 'paybis', orderId: 'req-1' },
        { pluginId: 'paybis', orderId: 'req-2' }
      ]
    )
    expect(txs.map(tx => tx?.key)).deep.equals([
      'edge_paybis:pb1tx1',
      undefined
    ])
    expect(store.finds).deep.equals(['edge_paybis req-1', 'edge_paybis req-2'])
  })

  it('treats a missing request-id index as a miss, not a scan', async function() {
    const queries: unknown[] = []
    const db = {
      async partitionedFind(partition: string, query: unknown) {
        queries.push(query)
        throw Object.assign(new Error('no index'), {
          statusCode: 400,
          error: 'invalid_index'
        })
      }
    }
    const store = makeTxStore((db as unknown) as DocumentScope<unknown>)
    expect(await store.findByRequestId('edge_paybis', 'req-1')).equals(
      undefined
    )
    expect(queries).deep.equals([
      {
        selector: { 'rawTx.request.id': 'req-1' },
        use_index: 'rawtx-request-id-p',
        allow_fallback: false,
        limit: 1
      }
    ])
  })
})
