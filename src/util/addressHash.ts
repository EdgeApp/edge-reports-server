import { createHash } from 'crypto'

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
