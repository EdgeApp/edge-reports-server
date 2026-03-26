import js from 'jsonfile'
import nano from 'nano'

import { DbTx } from '../types'
import { datelog } from '../util'

const config = js.readFileSync('./config.json')
const nanoDb = nano(config.couchDbFullpath)

const QUERY_LIMIT = 1000

resetUsdValues().catch(e => {
  datelog(e)
  process.exit(1)
})

async function resetUsdValues(): Promise<void> {
  const partitionName = process.argv[2]
  if (partitionName == null) {
    console.error('Usage: resetUsdValues <partitionName>')
    process.exit(1)
  }

  const reportsTransactions = nanoDb.use('reports_transactions')
  let bookmark: string | undefined
  let totalUpdated = 0

  while (true) {
    const query: any = {
      selector: {
        usdValue: { $gte: 0 }
      },
      bookmark,
      limit: QUERY_LIMIT
    }

    const result: any = await reportsTransactions.partitionedFind(
      partitionName,
      query
    )
    const { docs } = result
    if (docs.length === 0) break

    if (typeof result.bookmark === 'string' && docs.length === QUERY_LIMIT) {
      bookmark = result.bookmark
    } else {
      bookmark = undefined
    }

    for (const d of docs) {
      const doc: DbTx = d
      doc.usdValue = -1
    }

    try {
      await reportsTransactions.bulk({ docs })
      totalUpdated += docs.length
      datelog(`Updated ${docs.length} docs (${totalUpdated} total)`)
    } catch (e) {
      datelog('Error doing bulk update', e)
    }

    if (bookmark == null) break
  }

  datelog(
    `Done. Set usdValue to -1 for ${totalUpdated} docs in ${partitionName}`
  )
}
