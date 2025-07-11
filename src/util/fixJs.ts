/**
 * Hacks code to work in the outdated CouchDB JavaScript environment.
 */
export function fixJs(code: string): string {
  return code.replace(/\blet\b|\bconst\b/g, 'var')
}
