const fiatCurrencyCodes = [
  'USD',
  'EUR',
  'JPY',
  'GBP',
  'AUD',
  'CAD',
  'CHF',
  'CNY',
  'SEK',
  'NZD',
  'KRW',
  'SGD',
  'NOK'
]

export function isFiatCurrency(currencyCode: string): boolean {
  return fiatCurrencyCodes.includes(currencyCode)
}
