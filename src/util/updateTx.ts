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

/**
 * Carry over chain fields that a fresh read of an order leaves unknown.
 *
 * `undefined` means "this read could not tell" (a partner catalog outage, an
 * unmapped code), never "the order has no chain", so a degraded run must not
 * erase stored chain ids and move the volume to "Unknown network". A defined
 * new value, including a `null` tokenId for the chain's native asset, still
 * replaces the stored one.
 *
 * The carry-over is per leg: stored fields are kept only while the fresh read
 * names the same chain or no chain. A read that moves a leg to another chain
 * takes that leg as read, so a token contract or EVM chain id from the old
 * chain is never paired with the new one.
 */
export function keepKnownChainFields<T extends StandardTx>(
  storedTx: StandardTx,
  newTx: T
): T {
  const out: T = { ...newTx }
  for (const leg of ['deposit', 'payout'] as const) {
    const chainKey = `${leg}ChainPluginId` as const
    const freshChain = newTx[chainKey]
    if (freshChain !== undefined && freshChain !== storedTx[chainKey]) continue
    for (const key of [
      chainKey,
      `${leg}EvmChainId`,
      `${leg}TokenId`
    ] as const) {
      if (newTx[key] === undefined) {
        // The keys of one leg share a value type with the same keys of out.
        ;(out as Record<string, unknown>)[key] = storedTx[key]
      }
    }
  }
  return out
}

/**
 * Decide how a fresh read of an order updates its stored doc. Returns the
 * order to write and the tracked fields that changed; no changed fields
 * means the stored doc is left as is.
 */
export function planTxUpdate<T extends StandardTx>(
  storedTx: StandardTx,
  newTx: T
): { tx: T; changedFields: string[] } {
  const tx = keepKnownChainFields(storedTx, newTx)
  return { tx, changedFields: checkUpdateTx(storedTx, tx) }
}
