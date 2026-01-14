import { createHash } from 'crypto'
import js from 'jsonfile'
import nano from 'nano'

import { DbTx } from '../types'
import { datelog } from '../util'

const config = js.readFileSync('./config.json')
const nanoDb = nano(config.couchDbFullpath)

const QUERY_LIMIT = 1000

function hashAddress(address: string | undefined | null): string | undefined {
  if (address == null || address === '') return undefined
  return createHash('sha256')
    .update(address)
    .digest('hex')
}

addAddressHashes().catch(e => {
  datelog(e)
})

async function addAddressHashes(): Promise<void> {
  const reportsTransactions = nanoDb.use('reports_transactions')

  let bookmark: string | undefined

  while (true) {
    const query = {
      selector: {
        // Find docs missing either address hash
        $or: [
          {
            payoutAddress: { $exists: true, $ne: null },
            payoutAddressHash: { $exists: false }
          },
          {
            depositAddress: { $exists: true, $ne: null },
            depositAddressHash: { $exists: false }
          }
        ]
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

    for (const d of docs) {
      const doc: DbTx = d
      // Compute hashes if addresses exist but hashes don't
      if (doc.depositAddress != null && doc.depositAddressHash == null) {
        doc.depositAddressHash = hashAddress(doc.depositAddress)
      }
      if (doc.payoutAddress != null && doc.payoutAddressHash == null) {
        doc.payoutAddressHash = hashAddress(doc.payoutAddress)
      }
    }

    if (docs.length > 0) {
      try {
        await reportsTransactions.bulk({ docs })
        datelog(`Updated ${docs.length} docs`)
      } catch (e) {
        datelog('Error doing bulk update', e)
      }
    }

    if (bookmark == null) {
      datelog('Migration complete')
      break
    }
  }
}
