import { asString, Cleaner } from 'cleaners'

export const asNumberString: Cleaner<number> = (v: unknown): number => {
  const str = asString(v)
  const n = Number(str)
  if (n.toString() !== str) {
    throw new TypeError('Expected number string')
  }
  return n
}
