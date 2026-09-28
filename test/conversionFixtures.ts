import { asDbTx, DbTx } from '../src/types'
import { TxStore } from '../src/util/resolveConversions'

export const makeTx = (
  _id: string,
  opts: { status?: string; usdValue?: number; requestId?: string } = {}
): DbTx =>
  asDbTx({
    _id,
    orderId: _id.slice(_id.indexOf(':') + 1),
    countryCode: null,
    depositCurrency: 'USD',
    depositAmount: 100,
    payoutCurrency: 'BTC',
    payoutAmount: 0.001,
    paymentType: null,
    status: opts.status ?? 'complete',
    isoDate: '2026-09-20T12:00:00.000Z',
    timestamp: 1789900000,
    usdValue: opts.usdValue ?? 100,
    rawTx: { request: { id: opts.requestId } }
  })

export const makeStore = (txs: DbTx[]): TxStore & { finds: string[] } => {
  const finds: string[] = []
  return {
    finds,
    async fetchByKeys(keys) {
      return txs
        .filter(tx => tx._id != null && keys.includes(tx._id))
        .map(doc => ({ key: doc._id ?? '', doc }))
    },
    async findByRequestId(partition, requestId) {
      finds.push(`${partition} ${requestId}`)
      const doc = txs.find(
        tx =>
          tx._id?.startsWith(`${partition}:`) === true &&
          (tx.rawTx as { request: { id?: string } }).request.id === requestId
      )
      return doc == null ? undefined : { key: doc._id ?? '', doc }
    }
  }
}
