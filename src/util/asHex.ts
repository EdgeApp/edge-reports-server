import { asString } from 'cleaners'

/**
 * Cleaner that validates a string is valid hexadecimal (0-9, a-f, A-F).
 */
export const asHex = (raw: any): string => {
  const str = asString(raw)
  if (!/^[0-9a-f]+$/i.test(str)) {
    throw new TypeError('Expected hexadecimal')
  }
  return str
}
