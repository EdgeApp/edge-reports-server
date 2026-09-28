import { asArray, asMaybe, asObject, asString, asValue } from 'cleaners'
import { DocumentScope, MangoQuery } from 'nano'

import { asDbTx, DbTx } from '../types'
import {
  candidateKeys,
  candidatePluginIds,
  REQUEST_ID_PARTNERS
} from './conversionKeys'

export interface ConversionLookup {
  pluginId: string
  orderId: string
}

/** A partner transaction and the doc id it is stored under. */
export interface ResolvedTx {
  key: string
  doc: DbTx
}

/**
 * The two reads the resolver needs, so tests can stand in a fake store.
 */
export interface TxStore {
  /** Loads docs by id. Missing, deleted and malformed docs are left out. */
  fetchByKeys: (keys: string[]) => Promise<ResolvedTx[]>
  /** Finds a doc in one partition by the partner's `rawTx.request.id`. */
  findByRequestId: (
    partition: string,
    requestId: string
  ) => Promise<ResolvedTx | undefined>
}

const FETCH_BATCH_SIZE = 1000
const REQUEST_ID_INDEX = 'rawtx-request-id-p'
const FIND_CONCURRENCY = 8

const asFetchRows = asArray(
  asObject({
    key: asString,
    doc: asMaybe(asDbTx)
  })
)

const asInvalidIndexError = asObject({
  statusCode: asValue(400),
  error: asValue('invalid_index')
})

export function makeTxStore(db: DocumentScope<unknown>): TxStore {
  return {
    async fetchByKeys(keys) {
      const result = await db.fetch({ keys })
      const out: ResolvedTx[] = []
      for (const { key, doc } of asMaybe(asFetchRows, [])(result.rows)) {
        if (doc != null) out.push({ key, doc })
      }
      return out
    },
    async findByRequestId(partition, requestId) {
      // Without the index this find would scan the whole partition, which
      // takes most of a minute for Paybis, so a missing index is a miss:
      const query: MangoQuery & { allow_fallback: boolean } = {
        selector: { 'rawTx.request.id': requestId },
        use_index: REQUEST_ID_INDEX,
        allow_fallback: false,
        limit: 1
      }
      let docs: unknown[]
      try {
        docs = (await db.partitionedFind(partition, query)).docs
      } catch (error) {
        if (asMaybe(asInvalidIndexError)(error) == null) throw error
        console.warn(`${REQUEST_ID_INDEX} is missing; run initDbs`)
        return
      }
      const doc = asMaybe(asDbTx)(docs[0])
      if (doc == null) return
      return {
        key: doc._id ?? `${partition}:${doc.orderId}`.toLowerCase(),
        doc
      }
    }
  }
}

/**
 * Finds the partner transaction behind each logged conversion, trying every
 * id form the order may be stored under. Returns one entry per lookup, in
 * order, undefined where nothing matched.
 */
export async function resolveTxs(
  store: TxStore,
  appId: string,
  appPartnerIds: string[],
  lookups: ConversionLookup[]
): Promise<Array<ResolvedTx | undefined>> {
  const keysPerLookup = lookups.map(({ pluginId, orderId }) =>
    candidateKeys(appId, pluginId, orderId, appPartnerIds)
  )

  // A loop rather than a spread, which overflows on a long range's lookups:
  const keySet = new Set<string>()
  for (const keys of keysPerLookup) for (const key of keys) keySet.add(key)
  const allKeys = [...keySet]
  const found = new Map<string, ResolvedTx>()
  for (let i = 0; i < allKeys.length; i += FETCH_BATCH_SIZE) {
    const batch = allKeys.slice(i, i + FETCH_BATCH_SIZE)
    for (const tx of await store.fetchByKeys(batch)) found.set(tx.key, tx)
  }

  const out = keysPerLookup.map(keys => {
    const key = keys.find(key => found.has(key))
    return key == null ? undefined : found.get(key)
  })

  // Partners keyed by their own order id need a find per unmatched order:
  const finds: Array<() => Promise<void>> = []
  lookups.forEach(({ pluginId, orderId }, index) => {
    if (out[index] != null) return
    const partners = candidatePluginIds(pluginId, appPartnerIds).filter(id =>
      REQUEST_ID_PARTNERS.includes(id)
    )
    for (const partnerId of partners) {
      finds.push(async () => {
        if (out[index] != null) return
        out[index] = await store.findByRequestId(
          `${appId}_${partnerId}`,
          orderId
        )
      })
    }
  })
  await runLimited(finds, FIND_CONCURRENCY)

  return out
}

async function runLimited(
  tasks: Array<() => Promise<void>>,
  limit: number
): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < tasks.length) await tasks[next++]()
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  )
}
