import { asMap, asMaybe, asNumber, asObject, asOptional } from 'cleaners'
import Router from 'express-promise-router'

import partners from '../../demo/partners'
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
 * Fiat/swap classification per pluginId, so the dashboard can offer its
 * fiat-buy/sell vs swap filter.
 *
 * This cannot be derived from the data. `StandardTx.exchangeType` exists but is
 * optional and was added long after most history was ingested, so it is absent
 * from nearly every stored transaction, and `PartnerPlugin` carries no type at
 * all. A static table is the only option.
 *
 * It is projected from the v1 registry rather than retyped, because the retyped
 * copy drifted: it keyed Ionia gift cards, Fox Exchange and NYM by filename or
 * lowercase instead of by their real pluginIds, and omitted banxa2, banxa3 and
 * gebo entirely. Unknown pluginIds default to 'swap' on the client, so all four
 * fiat providers among those rendered as swaps.
 *
 * Unknown pluginIds still default to 'swap' on the client.
 */
const extraProviderTypes: { [pluginId: string]: 'fiat' | 'swap' } = {
  // Registered in edge-exchange-plugins but absent from the v1 registry, having
  // never reported a transaction here.
  bridgeless: 'swap'
}

const providerTypes: { [pluginId: string]: 'fiat' | 'swap' } = {
  ...extraProviderTypes
}
for (const pluginId of Object.keys(partners)) {
  providerTypes[pluginId] = partners[pluginId].type
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
