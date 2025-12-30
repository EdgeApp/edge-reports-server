import nano, { MangoSelector } from 'nano'

import { config } from '../../config'
import { DbTx } from '../../types'

const QUERY_LIMIT = 10000

interface QueryCouchParams {
  partition?: string
  selector: MangoSelector
}

/**
 * Query CouchDB reports_transactions using a selector parameter
 * Yields batches of DbTx documents, paginating via bookmarks
 */
export async function* queryCouch(
  params: QueryCouchParams
): AsyncGenerator<DbTx[], void, unknown> {
  const { partition, selector } = params

  const nanoDb = nano(config.couchDbFullpath)
  const db: nano.DocumentScope<DbTx> = nanoDb.db.use('reports_transactions')

  let bookmark: string | undefined

  while (true) {
    const query: nano.MangoQuery = {
      selector,
      limit: QUERY_LIMIT,
      bookmark
    }

    let result: nano.MangoResponse<DbTx>

    if (partition != null) {
      result = await db.partitionedFind(partition, query)
    } else {
      result = await db.find(query)
    }

    if (result.docs.length > 0) {
      yield result.docs
    }

    // Check if there are more results
    if (result.bookmark == null || result.docs.length < QUERY_LIMIT) {
      break
    }

    bookmark = result.bookmark
  }
}
