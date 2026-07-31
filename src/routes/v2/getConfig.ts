import { asMap, asMaybe, asNumber, asObject, asOptional } from 'cleaners'
import Router from 'express-promise-router'

import { reportsApps } from '../../indexApi'

/**
 * Rev-share rates live on the app doc in `reports_apps`, as an optional
 * `revShareRate` beside each partner's `apiKeys`. The rate is a property of the
 * app-partner deal, so it is per app AND per partner, and it sits with the
 * credentials that define the relationship: onboarding a partner is one doc
 * edit, with no separate rates map to forget. The rates are commercial terms
 * and this repo is public, so they are never committed or placed in
 * config.json. A partner without one contributes 0 estimated revenue.
 *
 * Tolerant cleaner: only the fields this route consumes, and a malformed
 * partner entry degrades to no rate rather than failing the whole request.
 */
const asAppRevShareRates = asObject({
  partnerIds: asMap(asMaybe(asObject({ revShareRate: asOptional(asNumber) })))
})

const getRevShareRates = async (
  apiKey: string
): Promise<{ [partnerId: string]: number }> => {
  // The app doc's _id IS the apiKey (same lookup validateApiKey uses), so a
  // missing doc doubles as auth failure and is thrown to the caller.
  const doc = await reportsApps.get(apiKey)
  const { partnerIds } = asAppRevShareRates(doc)
  const rates: { [partnerId: string]: number } = {}
  for (const partnerId of Object.keys(partnerIds)) {
    const rate = partnerIds[partnerId]?.revShareRate
    if (rate != null) rates[partnerId] = rate
  }
  return rates
}

/**
 * Static fiat/swap classification per pluginId, duplicated into v2 so the
 * dashboard can offer its fiat-buy/sell vs swap filter. The reporting API does
 * not expose exchange type. Derived from src/partners/* `exchangeType`, plus the
 * newer ramp/swap plugins not yet in that registry. Unknown pluginIds default to
 * 'swap' on the client.
 */
const providerTypes: { [pluginId: string]: 'fiat' | 'swap' } = {
  // fiat (on/off ramp)
  banxa: 'fiat',
  bitaccess: 'fiat',
  bitrefill: 'fiat',
  bitsofgold: 'fiat',
  bity: 'fiat',
  ioniagiftcard: 'fiat',
  ioniavisarewards: 'fiat',
  kado: 'fiat',
  libertyx: 'fiat',
  moonpay: 'fiat',
  paybis: 'fiat',
  paytrie: 'fiat',
  revolut: 'fiat',
  safello: 'fiat',
  simplex: 'fiat',
  transak: 'fiat',
  wyre: 'fiat',
  xanpool: 'fiat',
  // swap
  bridgeless: 'swap',
  changehero: 'swap',
  changelly: 'swap',
  changenow: 'swap',
  coinswitch: 'swap',
  exolix: 'swap',
  faast: 'swap',
  foxexchange: 'swap',
  godex: 'swap',
  letsexchange: 'swap',
  lifi: 'swap',
  maya: 'swap',
  nym: 'swap',
  rango: 'swap',
  shapeshift: 'swap',
  sideshift: 'swap',
  swapter: 'swap',
  swapuz: 'swap',
  switchain: 'swap',
  thorchain: 'swap',
  totle: 'swap'
}

export const getConfigRouter = Router()

getConfigRouter.get('/', async function(req, res) {
  const apiKey = req.query.apiKey
  if (typeof apiKey !== 'string' || apiKey === '') {
    res.status(400).send(`Missing Request fields.`)
    return
  }

  // Same auth as v1: the app doc keyed by apiKey. An unrecognized key 401s so
  // the v2 client redirects to its key-entry screen instead of hanging.
  let revShareRates: { [partnerId: string]: number }
  try {
    revShareRates = await getRevShareRates(apiKey)
  } catch {
    res.status(401).send(`Invalid API Key`)
    return
  }

  res.json({
    revShareRates,
    providerTypes
  })
})
