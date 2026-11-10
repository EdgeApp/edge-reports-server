/**
 * Fill missing chain ids on stored Simplex, LibertyX and Changelly orders by
 * reprocessing each doc's rawTx with the current partner processor.
 *
 *   npm run backfillChainIds -- [<appId>_<partnerId>] [--apply]
 *
 * Dry run by default: prints, per `<appId>_<partnerId>` partition, how many
 * docs would change and the USD volume that moves out of "Unknown network".
 * `--apply` writes the changed docs. Only fields a doc is missing are filled
 * (see missingChainFields), and docs with nothing to fill are never written.
 * Changelly reprocessing loads the live currency catalog once per partition,
 * using that partition's API keys.
 *
 * Dashboard v2 reads the reports_hour/day/month cache, so after `--apply` the
 * cache engine has to recompute the affected months; the script prints how.
 */
import Changelly from 'api-changelly/lib.js'
import nano from 'nano'

import { config } from '../config'
import {
  ChangellyCurrencyMap,
  loadChangellyCurrencyMap,
  processChangellyTx
} from '../partners/changelly'
import { processLibertyxTx } from '../partners/libertyx'
import { processSimplexTx } from '../partners/simplex'
import { asApps, DbTx, ScopedLog, StandardTx } from '../types'
import { createScopedLog, datelog } from '../util'
import { missingChainFields } from '../util/updateTx'

const QUERY_LIMIT = 500
const APPLY = process.argv.includes('--apply')
const ONLY_PARTITION = process.argv.slice(2).find(arg => !arg.startsWith('--'))

type Reprocess = (rawTx: unknown) => StandardTx

interface PartitionStats {
  scanned: number
  changed: number
  /** USD of changed docs the dashboard counts (complete and priced). */
  changedUsd: number
  /** Docs still missing a payout chain after reprocessing, by currency. */
  unmapped: Record<string, number>
  errors: number
  oldestChangedIsoDate: string | undefined
}

// Per-doc processor warnings would flood the output; the summary groups the
// docs that stay unmapped by currency instead.
const quietLog: ScopedLog = Object.assign(() => undefined, {
  warn: () => undefined,
  error: () => undefined
})

const nanoDb = nano(config.couchDbFullpath)

// The Changelly client keeps a socket.io connection open with unlimited
// reconnects, which holds the event loop, so exit explicitly once stdout has
// flushed (pipes write asynchronously on macOS).
main().then(
  () => process.stdout.write('', () => process.exit(0)),
  (error: unknown) => {
    datelog(error)
    process.exit(1)
  }
)

async function main(): Promise<void> {
  datelog(
    APPLY
      ? 'APPLY: changed docs will be written'
      : 'DRY RUN: nothing is written'
  )
  const reportsApps = nanoDb.use('reports_apps')
  const reportsTransactions = nanoDb.use('reports_transactions')

  const rawApps = await reportsApps.find({
    selector: { appId: { $exists: true } },
    limit: 1000000
  })
  const apps = asApps(rawApps.docs)

  const results: Array<[string, PartitionStats]> = []
  for (const app of apps) {
    for (const partnerId of Object.keys(app.partnerIds)) {
      const partition = `${app.appId}_${partnerId}`
      if (ONLY_PARTITION != null && partition !== ONLY_PARTITION) continue
      const { pluginId = partnerId, apiKeys } = app.partnerIds[partnerId]
      const log = createScopedLog(app.appId, partnerId)

      const reprocess = await makeReprocess(pluginId, apiKeys, log)
      if (reprocess == null) continue

      const stats = await backfillPartition(
        reportsTransactions,
        partition,
        reprocess,
        log
      )
      results.push([partition, stats])
    }
  }

  printSummary(results)
}

/** Pick the processor for a partner, or undefined to skip the partition. */
async function makeReprocess(
  pluginId: string,
  apiKeys: Record<string, string>,
  log: ScopedLog
): Promise<Reprocess | undefined> {
  switch (pluginId) {
    case 'simplex':
      return rawTx => processSimplexTx(rawTx)
    case 'libertyx':
      return rawTx => processLibertyxTx(rawTx)
    case 'changelly': {
      const { changellyApiKey, changellyApiSecret } = apiKeys
      if (changellyApiKey == null || changellyApiSecret == null) {
        log.warn('No Changelly API keys, skipping partition')
        return undefined
      }
      const currencyMap: ChangellyCurrencyMap = await loadChangellyCurrencyMap(
        new Changelly(changellyApiKey, changellyApiSecret),
        log
      )
      // Without the catalog no Changelly order can gain a chain.
      if (currencyMap.size === 0) {
        log.warn('No Changelly currency catalog, skipping partition')
        return undefined
      }
      return rawTx => processChangellyTx(rawTx, currencyMap, quietLog)
    }
    default:
      return undefined
  }
}

async function backfillPartition(
  reportsTransactions: nano.DocumentScope<unknown>,
  partition: string,
  reprocess: Reprocess,
  log: ScopedLog
): Promise<PartitionStats> {
  const stats: PartitionStats = {
    scanned: 0,
    changed: 0,
    changedUsd: 0,
    unmapped: {},
    errors: 0,
    oldestChangedIsoDate: undefined
  }

  let bookmark: string | undefined
  while (true) {
    const query: nano.MangoQuery = {
      selector: {
        $or: [
          { depositChainPluginId: { $exists: false } },
          { payoutChainPluginId: { $exists: false } }
        ]
      },
      bookmark,
      limit: QUERY_LIMIT
    }

    let result: nano.MangoResponse<unknown>
    try {
      result = await reportsTransactions.partitionedFind(partition, query)
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) {
        log('Partition not found, skipping')
        break
      }
      throw e
    }
    const docs = result.docs as DbTx[]
    if (docs.length === 0) break
    stats.scanned += docs.length

    const docsToWrite: DbTx[] = []
    for (const doc of docs) {
      let fresh: StandardTx
      try {
        fresh = reprocess(doc.rawTx)
      } catch (e) {
        log.error(`Cannot reprocess ${String(doc._id)}: ${String(e)}`)
        stats.errors++
        continue
      }

      if (fresh.payoutChainPluginId === undefined) {
        const code = fresh.payoutCurrency
        stats.unmapped[code] = (stats.unmapped[code] ?? 0) + 1
      }

      const fill = missingChainFields(doc, fresh)
      if (Object.keys(fill).length === 0) continue

      docsToWrite.push({ ...doc, ...fill })
      stats.changed++
      if (doc.status === 'complete' && doc.usdValue >= 0) {
        stats.changedUsd += doc.usdValue
      }
      if (
        stats.oldestChangedIsoDate == null ||
        doc.isoDate < stats.oldestChangedIsoDate
      ) {
        stats.oldestChangedIsoDate = doc.isoDate
      }
    }

    if (APPLY && docsToWrite.length > 0) {
      const response = await reportsTransactions.bulk({ docs: docsToWrite })
      const failed = response.filter(row => row.error != null)
      stats.errors += failed.length
      for (const row of failed) {
        log.error(`Write failed for ${String(row.id)}: ${String(row.error)}`)
      }
    }

    if (typeof result.bookmark !== 'string' || docs.length < QUERY_LIMIT) break
    bookmark = result.bookmark
  }
  return stats
}

function printSummary(results: Array<[string, PartitionStats]>): void {
  const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`
  datelog('=== Summary ===')
  let oldest: string | undefined
  for (const [partition, stats] of results) {
    datelog(
      `${partition}: scanned ${stats.scanned}, ${
        APPLY ? 'changed' : 'would change'
      } ${stats.changed} (${usd(stats.changedUsd)}), errors ${stats.errors}`
    )
    const unmapped = Object.entries(stats.unmapped)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => `${code} ${count}`)
    if (unmapped.length > 0) {
      datelog(`  still without a payout chain: ${unmapped.join(', ')}`)
    }
    const date = stats.oldestChangedIsoDate
    if (date != null && (oldest == null || date < oldest)) oldest = date
  }

  if (oldest == null) {
    datelog('No docs to change, so the cache needs no rebuild.')
    return
  }
  // Each cache pass starts at the first of the month `cacheLookbackMonths`
  // before the current one (getStartOfMonthsAgo), so that many months back
  // covers the oldest changed doc.
  const now = new Date()
  const from = new Date(oldest)
  const months =
    (now.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    from.getUTCMonth()
  const lookback = config.cacheLookbackMonths
  datelog(
    `Oldest ${
      APPLY ? 'changed' : 'affected'
    } doc: ${oldest}, ${months} months back.`
  )
  if (months <= lookback) {
    datelog(
      `  The cache engine recomputes the last ${lookback} months (cacheLookbackMonths) on every pass, so its next pass picks these up.`
    )
    return
  }
  datelog(
    `  The cache engine recomputes only the last ${lookback} months (cacheLookbackMonths). To rebuild back to this doc, either:`
  )
  datelog(
    `  - set "cacheLookbackMonths": ${months} in config.json, let start.cache finish one pass, then restore it, or`
  )
  datelog(
    '  - delete the <partition>:00000000_initialized doc from reports_month for each changed partition; the next pass recomputes it from the start.'
  )
}
