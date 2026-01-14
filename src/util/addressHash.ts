import { createHash } from 'crypto'

/** SHA256 produces 64 hex characters */
const HASH_LENGTH = 64

/**
 * Computes the SHA256 hash of an address and returns it as a hex string.
 * Returns undefined if the address is null/undefined/empty.
 */
export function hashAddress(
  address: string | undefined | null
): string | undefined {
  if (address == null || address === '') return undefined
  return createHash('sha256')
    .update(address)
    .digest('hex')
}

/**
 * Converts a hash prefix to the exact range boundaries for database queries.
 * Pads the prefix with '0's for the start and 'f's for the end to get
 * the minimum and maximum possible hashes that match the prefix.
 */
export function prefixToRange(
  prefix: string
): { startHash: string; endHash: string } {
  const paddingLength = HASH_LENGTH - prefix.length
  return {
    startHash: prefix + '0'.repeat(paddingLength),
    endHash: prefix + 'f'.repeat(paddingLength)
  }
}
