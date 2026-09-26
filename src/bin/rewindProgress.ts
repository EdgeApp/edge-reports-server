import { asNumber, asOptional, asString } from 'cleaners'
import nano from 'nano'

import config from '../../config.json'
import { asProgressSettings } from '../types'
import { datelog } from '../util'

/**
 * Rewind partner query cursors so reportsQuery re-reads orders from a date.
 *
 * Usage:
 *   node -r sucrase/register src/bin/rewindProgress.ts <isoDate> <partnerId...> [--apply]
 *
 * Without --apply it only prints what it would change. Stop reportsQuery
 * first: a running plugin writes its own cursor back when it finishes and
 * would overwrite the rewind.
 *
 * The rewind is a backfill because insertTransactions rewrites an existing
 * order doc when a re-read changes its status, txids, chain pluginIds, EVM
 * chain ids or tokenIds (checkUpdateTx), and inserts orders that were skipped
 * before. Each plugin also re-reads its own lookback window before the cursor.
 */

const nanoDb = nano(config.couchDbFullpath)

const asIsoCursor = asOptional(asString)
const asTimestampCursor = asOptional(asNumber)

interface Rewind {
  before: string
  after: string
  progressCache: Record<string, unknown>
}

/**
 * Most plugins keep `latestIsoDate`. Changelly walks newest-first by offset
 * and stops at `latestTimeStamp` (seconds), so it takes a timestamp and a
 * reset walk instead.
 */
function rewindCursor(
  partnerId: string,
  progressCache: Record<string, unknown>,
  target: Date
): Rewind | undefined {
  if (partnerId === 'changelly') {
    const current = asTimestampCursor(progressCache.latestTimeStamp)
    const targetSeconds = Math.floor(target.getTime() / 1000)
    if (current == null || current <= targetSeconds) return
    return {
      before: `latestTimeStamp=${current}`,
      after: `latestTimeStamp=${targetSeconds}`,
      progressCache: {
        ...progressCache,
        latestTimeStamp: targetSeconds,
        firstAttempt: false,
        offset: 0
      }
    }
  }

  const current = asIsoCursor(progressCache.latestIsoDate)
  const targetIso = target.toISOString()
  if (current == null || current <= targetIso) return
  return {
    before: `latestIsoDate=${current}`,
    after: `latestIsoDate=${targetIso}`,
    progressCache: { ...progressCache, latestIsoDate: targetIso }
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const [isoDate, ...partnerIds] = process.argv
    .slice(2)
    .filter(arg => arg !== '--apply')
  const target = new Date(isoDate ?? '')
  if (Number.isNaN(target.getTime()) || partnerIds.length === 0) {
    throw new Error(
      'Usage: rewindProgress.ts <isoDate> <partnerId...> [--apply]'
    )
  }
  if (!apply)
    datelog('DRY RUN, nothing will be written. Pass --apply to write.')

  const dbProgress = nanoDb.db.use<{ progressCache: Record<string, unknown> }>(
    'reports_progresscache'
  )
  const { rows } = await dbProgress.list({ include_docs: true })

  for (const partnerId of partnerIds) {
    // Doc ids are `${appId}:${partnerId}`, one per app reporting the partner.
    const partnerRows = rows.filter(row => row.id.endsWith(`:${partnerId}`))
    if (partnerRows.length === 0) {
      datelog(`${partnerId}: no progress doc found`)
      continue
    }
    for (const row of partnerRows) {
      const doc = asProgressSettings(row.doc)
      const rewind = rewindCursor(partnerId, doc.progressCache, target)
      if (rewind == null) {
        datelog(`${row.id}: already at or before ${isoDate}, left as is`)
        continue
      }
      datelog(`${row.id}: ${rewind.before} -> ${rewind.after}`)
      if (apply) {
        await dbProgress.insert({
          ...doc,
          progressCache: rewind.progressCache
        })
        datelog(`${row.id}: written`)
      }
    }
  }
}

main().catch(e => {
  datelog(String(e))
  process.exit(1)
})
