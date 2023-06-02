import js from 'jsonfile'
import nano from 'nano'

import { DbTx } from '../types'
import { datelog } from '../util'

const config = js.readFileSync('./config.json')

const nanoDb = nano(config.couchDbFullpath)

// const BATCH_ADVANCE = 1000
const QUERY_LIMIT = 1000

fixUsdValues().catch(e => {
  datelog(e)
})

async function fixUsdValues(): Promise<void> {
  const reportsTransactions = nanoDb.use('reports_transactions')

  let bookmark

  while (true) {
    const query = {
      selector: {
        $or: [{ usdValue: { $exists: false } }, { usdValue: { $eq: null } }]
      },
      bookmark,
      limit: QUERY_LIMIT
    }
    const result: any = await reportsTransactions.find(query)
    const { docs } = result
    if (typeof result.bookmark === 'string' && docs.length === QUERY_LIMIT) {
      bookmark = result.bookmark
    } else {
      bookmark = undefined
    }
    datelog(`${docs.length} docs to update`)
    // const promiseArray: Array<Promise<void>> = []

    for (const d of docs) {
      const doc: DbTx = d
      if (doc.usdValue != null) {
        throw new Error('has usdvalue')
      }
      doc.usdValue = -1
    }
    try {
      await reportsTransactions.bulk({ docs })
    } catch (e) {
      datelog('Error doing bulk update', e)
    }
    if (bookmark == null) {
      break
    }
  }
}
