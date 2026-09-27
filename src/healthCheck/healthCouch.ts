import { asArray, asMaybe, asNumber, asObject, asUnknown } from 'cleaners'
import nano from 'nano'

import { asApps, asDisablePartnerQuery } from '../types'
import {
  asHealthTx,
  asStatusDoc,
  HealthDump,
  HealthTx
} from './healthCheckTypes'
import { HEALTH_WINDOWS, partnerSkipReason } from './healthMetrics'

export interface LoadHealthDumpOptions {
  couchDbFullpath: string
  now: Date
  baselineWeeks: number
  soloAppIds: string[] | null
  soloPartnerIds: string[] | null
  /** Receives progress and soft-failure lines */
  log: (message: string) => void
}

const asCouchStatusError = asObject({ statusCode: asNumber })
const asFindResponse = asObject({ docs: asArray(asUnknown) })

const PAGE_SIZE = 10000
const DAY_MS = 24 * 60 * 60 * 1000

const TX_FIELDS = [
  'isoDate',
  'status',
  'usdValue',
  'depositChainPluginId',
  'payoutChainPluginId'
]

/**
 * Reads everything the health check needs from CouchDB: apps without API
 * keys, disablePartnerQuery, completed transactions for the longest window
 * plus its baseline for every partner the query engine runs, and status
 * history.
 */
export async function loadHealthDump(
  options: LoadHealthDumpOptions
): Promise<HealthDump> {
  const { couchDbFullpath, now, baselineWeeks, log } = options
  const nanoDb = nano(couchDbFullpath)
  const dbApps = nanoDb.db.use('reports_apps')
  const dbSettings = nanoDb.db.use('reports_settings')
  const dbTransactions = nanoDb.db.use('reports_transactions')
  const dbStatus = nanoDb.db.use('reports_status')

  const rawApps = await dbApps.find({
    selector: { appId: { $exists: true } },
    limit: 1000000
  })
  const apps = asApps(rawApps.docs).map(app => {
    const partnerIds: HealthDump['apps'][number]['partnerIds'] = {}
    for (const partnerId of Object.keys(app.partnerIds)) {
      partnerIds[partnerId] = { pluginId: app.partnerIds[partnerId].pluginId }
    }
    return { appId: app.appId, partnerIds }
  })

  const disablePartnerQuery = await dbSettings
    .get('disablePartnerQuery')
    .then(doc => asDisablePartnerQuery(doc))
    .catch((error: unknown) => {
      log(`disablePartnerQuery unreadable, using none: ${String(error)}`)
      return asDisablePartnerQuery(undefined)
    })

  const dump: HealthDump = {
    nowIsoDate: now.toISOString(),
    apps,
    disablePartnerQuery,
    soloAppIds: options.soloAppIds,
    soloPartnerIds: options.soloPartnerIds,
    transactions: {},
    statusHistory: {}
  }

  const longestWindowMs = Math.max(...HEALTH_WINDOWS.map(window => window.ms))
  const startIsoDate = new Date(
    now.getTime() - longestWindowMs - baselineWeeks * 7 * DAY_MS
  ).toISOString()
  for (const app of apps) {
    for (const partnerId of Object.keys(app.partnerIds)) {
      const pluginId = app.partnerIds[partnerId].pluginId ?? partnerId
      if (partnerSkipReason(dump, app.appId, partnerId, pluginId) != null) {
        continue
      }
      const appPartnerId = `${app.appId}_${partnerId}`
      const txs: HealthTx[] = []
      let bookmark: string | undefined
      while (true) {
        const response = await dbTransactions.partitionedFind(appPartnerId, {
          selector: { isoDate: { $gte: startIsoDate }, status: 'complete' },
          fields: TX_FIELDS,
          limit: PAGE_SIZE,
          bookmark
        })
        for (const doc of asFindResponse(response).docs) {
          const tx = asMaybe(asHealthTx)(doc)
          if (tx != null) txs.push(tx)
        }
        if (response.docs.length < PAGE_SIZE) break
        bookmark = response.bookmark
      }
      dump.transactions[appPartnerId] = txs
      log(`Loaded ${txs.length} transactions for ${appPartnerId}`)
    }
  }

  try {
    const statusList = await dbStatus.list({ include_docs: true })
    for (const row of statusList.rows) {
      const doc = asMaybe(asStatusDoc)(row.doc)
      if (doc == null) continue
      dump.statusHistory[doc._id] = doc.cycles
    }
  } catch (error) {
    const missing = asMaybe(asCouchStatusError)(error)?.statusCode === 404
    log(
      missing
        ? 'reports_status does not exist yet; no status history'
        : `reports_status unreadable, no status history: ${String(error)}`
    )
  }

  return dump
}
