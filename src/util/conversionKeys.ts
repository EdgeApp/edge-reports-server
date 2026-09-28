/**
 * Maps the ids the app logs on its conversion events onto the
 * `reports_transactions` doc ids (`${appId}_${pluginId}:${orderId}`, lowercased)
 * the partner plugins store the same order under.
 */

/**
 * App provider ids that name a different reports partner.
 */
export const PLUGIN_ID_ALIASES: { [appPluginId: string]: string } = {
  mayaprotocol: 'maya'
}

/**
 * Reports partners that key orders by their own id, while the app logs the
 * request id the partner stores on `rawTx.request.id`.
 */
export const REQUEST_ID_PARTNERS = ['paybis']

/**
 * The reports partner ids an app provider id may be stored under, most likely
 * first: its alias, itself, then numbered app partner variants (`banxa3` for
 * `banxa`), which an app adds when it re-onboards a partner under new keys.
 */
export function candidatePluginIds(
  pluginId: string,
  appPartnerIds: string[]
): string[] {
  const id = pluginId.toLowerCase()
  const out = [PLUGIN_ID_ALIASES[id] ?? id, id]
  for (const partnerId of appPartnerIds) {
    const lower = partnerId.toLowerCase()
    if (lower.startsWith(id) && /^\d+$/.test(lower.slice(id.length))) {
      out.push(lower)
    }
  }
  return [...new Set(out)]
}

/**
 * The order ids a logged order id may be stored under. EVM swap providers
 * such as Thorchain and Maya report tx hashes without the `0x` prefix the app
 * logs.
 */
export function candidateOrderIds(orderId: string): string[] {
  const out = [orderId]
  if (/^0x/i.test(orderId)) out.push(orderId.slice(2))
  return out
}

/**
 * Every `reports_transactions` doc id one logged conversion may be stored
 * under, most likely first. The first entry is the literal key.
 */
export function candidateKeys(
  appId: string,
  pluginId: string,
  orderId: string,
  appPartnerIds: string[]
): string[] {
  const keys = [`${appId}_${pluginId}:${orderId}`.toLowerCase()]
  for (const candidatePluginId of candidatePluginIds(pluginId, appPartnerIds)) {
    for (const candidateOrderId of candidateOrderIds(orderId)) {
      keys.push(
        `${appId}_${candidatePluginId}:${candidateOrderId}`.toLowerCase()
      )
    }
  }
  return [...new Set(keys)]
}
