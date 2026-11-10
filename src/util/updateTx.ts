import { StandardTx } from '../types'

/**
 * List the tracked fields that differ between a stored order and a fresh
 * read of it. An empty list means the stored doc is left as is.
 */
export const checkUpdateTx = (
  oldTx: StandardTx,
  newTx: StandardTx
): string[] => {
  const fields = [
    'status',
    'depositTxid',
    'depositChainPluginId',
    'depositEvmChainId',
    'depositTokenId',
    'payoutTxid',
    'payoutChainPluginId',
    'payoutEvmChainId',
    'payoutTokenId',
    // Partner-reported revenue arrives late: a partner can settle the fee after
    // the order row already exists. Without these the engine sees no tracked
    // change, skips the write, and the revenue never reaches Couch or the
    // analytics cache.
    'revenueUsd',
    'revenueSource'
  ] as const
  const changedFields: string[] = []
  for (const field of fields) {
    if (oldTx[field] !== newTx[field]) changedFields.push(field)
  }
  return changedFields
}
