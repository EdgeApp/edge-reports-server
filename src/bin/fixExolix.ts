import js from 'jsonfile'
import nano from 'nano'

import { DbTx } from '../types'
import { datelog, smartIsoDateFromTimestamp } from '../util'

const config = js.readFileSync('./config.json')

const nanoDb = nano(config.couchDbFullpath)

// const BATCH_ADVANCE = 1000
const QUERY_LIMIT = 50

fixExolix().catch(e => {
  datelog(e)
})

async function fixExolix(): Promise<void> {
  const reportsTransactions = nanoDb.use('reports_transactions')

  let bookmark

  while (true) {
    const query = {
      selector: {
        timestamp: { $gt: 9999999999 }
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
      const { timestamp, isoDate } = smartIsoDateFromTimestamp(doc.timestamp)
      console.log(`${doc._id}: ${timestamp} ${doc.isoDate} ${isoDate}`)
      doc.timestamp = timestamp
      doc.isoDate = isoDate
    }
    try {
      await reportsTransactions.bulk({ docs })
    } catch (e) {
      datelog('Error doing bulk update', e)
    }
    if (bookmark == null) break
  }
}
