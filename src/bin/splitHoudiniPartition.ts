import { asBoolean, asMaybe, asNumber, asObject, asString } from 'cleaners'
import nano from 'nano'

import { config } from '../config'
import {
  defaultFetchHoudiniModes,
  getHoudiniMode,
  HOUDINI_MODE_PARTNERS,
  isHoudiniModeSettled
} from '../partners/houdini'
import { datelog } from '../util'

/**
 * Files the orders stored under the single `houdini` partner into the mode
 * partners, using the same rule the Houdini plugin applies to new orders.
 *
 * Usage:
 *   node -r sucrase/register src/bin/splitHoudiniPartition.ts <appId> [--apply]
 *
 * Without --apply it only prints what it would move. Stop reportsQuery first.
 *
 * Houdini's API serves only the last 48 hours, so its orders cannot be
 * re-queried once deleted. This moves each stored order instead: the doc is
 * copied to its mode partner's partition under the same order id, then the
 * original is deleted. An order the mode partners already filed keeps that
 * copy. Orders whose mode is Swap stay where they are.
 *
 * An order too young for a settled mode is deleted instead: it is still
 * inside the API's 48-hour window, so the mode partners file it once it
 * settles. Start reportsQuery again well within those 48 hours.
 */

const asStoredOrder = asObject({
  _id: asString,
  _rev: asString,
  orderId: asString,
  timestamp: asNumber,
  rawTx: asMaybe(asObject({ anonymous: asMaybe(asBoolean) }))
})

const asRevValue = asObject({ deleted: asMaybe(asBoolean, false) })

const BATCH_SIZE = 500

const nanoDb = nano(config.couchDbFullpath)
const dbTransactions = nanoDb.use<Record<string, unknown>>(
  'reports_transactions'
)

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const [appId] = process.argv.slice(2).filter(arg => arg !== '--apply')
  if (appId == null) {
    throw new Error('Usage: splitHoudiniPartition.ts <appId> [--apply]')
  }
  const source = `${appId}_${HOUDINI_MODE_PARTNERS.swap}`

  // Read the whole partition first, so the event lookup knows its range
  const docs: Array<Record<string, unknown>> = []
  let startKey: string | undefined
  while (true) {
    const page = await dbTransactions.partitionedList(source, {
      include_docs: true,
      limit: BATCH_SIZE + 1,
      start_key: startKey
    })
    const rows = page.rows.filter(row => !row.id.startsWith('_design/'))
    for (const row of rows.slice(0, BATCH_SIZE)) {
      if (row.doc != null) docs.push(row.doc)
    }
    if (page.rows.length <= BATCH_SIZE) break
    startKey = page.rows[BATCH_SIZE].id
  }
  datelog(`${source}: ${docs.length} stored orders`)
  if (docs.length === 0) return

  const orders = docs.map(doc => ({ doc, order: asStoredOrder(doc) }))
  const events = await defaultFetchHoudiniModes(
    Math.min(...orders.map(({ order }) => order.timestamp * 1000)),
    Date.now(),
    orders.map(({ order }) => order.orderId)
  )
  if (events == null) {
    datelog('No posthog config: filing by the private-route flag alone')
  }

  const nowMs = Date.now()
  const moves = new Map<string, Array<Record<string, unknown>>>()
  const unsettled: Array<Record<string, unknown>> = []
  for (const { doc, order } of orders) {
    const createdMs = order.timestamp * 1000
    if (!isHoudiniModeSettled(createdMs, nowMs)) {
      unsettled.push(doc)
      continue
    }
    const mode = getHoudiniMode(
      order.rawTx?.anonymous ?? undefined,
      createdMs,
      events?.get(order.orderId.toLowerCase())
    )
    const partner = HOUDINI_MODE_PARTNERS[mode]
    if (partner === HOUDINI_MODE_PARTNERS.swap) continue
    const list = moves.get(partner) ?? []
    list.push(doc)
    moves.set(partner, list)
  }

  for (const [partner, list] of moves) {
    datelog(`${source} -> ${appId}_${partner}: ${list.length} orders`)
  }
  datelog(`${source}: ${unsettled.length} unsettled orders to re-read`)
  if (!apply) {
    datelog('Dry run; pass --apply to move them')
    return
  }

  for (const [partner, list] of moves) {
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      await moveBatch(appId, partner, list.slice(i, i + BATCH_SIZE))
    }
  }
  if (unsettled.length > 0) {
    const results = await dbTransactions.bulk({
      docs: unsettled.map(doc => {
        const { _id, _rev } = asStoredOrder(doc)
        return { _id, _rev, _deleted: true }
      })
    })
    const failed = results.filter(result => result.error != null)
    for (const result of failed) {
      datelog(`Delete failed for ${result.id}: ${result.error}`)
    }
    datelog(`${source}: deleted ${unsettled.length - failed.length} unsettled`)
  }
  datelog('Done')
}

/**
 * Copies each doc to the partner's partition, then deletes the original. A
 * doc is deleted only once its copy is known to exist.
 */
async function moveBatch(
  appId: string,
  partner: string,
  docs: Array<Record<string, unknown>>
): Promise<void> {
  const targets = docs.map(doc => {
    const { orderId } = asStoredOrder(doc)
    return `${appId}_${partner}:${orderId}`
  })
  const existing = await dbTransactions.fetchRevs({ keys: targets })

  // Targets already filed by a mode partner keep their copy:
  const present = new Set<string>()
  const copies: Array<Record<string, unknown>> = []
  for (let i = 0; i < docs.length; i++) {
    const row = existing.rows[i]
    // A deleted doc still answers with its tombstone's rev:
    const live = !('error' in row) && !asRevValue(row.value).deleted
    if (live) {
      present.add(targets[i])
    } else {
      const { _rev, ...rest } = docs[i]
      copies.push({ ...rest, _id: targets[i] })
    }
  }

  if (copies.length > 0) {
    const results = await dbTransactions.bulk({ docs: copies })
    for (const result of results) {
      if (result.error != null) {
        datelog(`Copy failed for ${result.id}: ${result.error}`)
      } else if (result.id != null) {
        present.add(result.id)
      }
    }
  }

  const deletions = docs
    .filter((_, i) => present.has(targets[i]))
    .map(doc => {
      const { _id, _rev } = asStoredOrder(doc)
      return { _id, _rev, _deleted: true }
    })
  const results = await dbTransactions.bulk({ docs: deletions })
  const failed = results.filter(result => result.error != null)
  for (const result of failed) {
    datelog(`Delete failed for ${result.id}: ${result.error}`)
  }
  datelog(
    `${appId}_${partner}: moved ${deletions.length - failed.length} of ${
      docs.length
    }`
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
