import nano from 'nano'

import config from '../../config.json'
import { datelog } from '../util'

// Configure Nano with your CouchDB server URL

const url = config.couchDbFullpath ?? 'http://admin:admin@localhost:5984'
const couch = nano(url)

// Define the name of the database and partition to delete
const dbName = process.argv[2]
const partitionKey = process.argv[3]
const BATCH_SIZE = 500 // Number of documents to query/delete at a time

console.log(`Deleting ${dbName}/${partitionKey}`)

// Delete all documents in the partition
async function rmPartition(): Promise<void> {
  const db = couch.use(dbName)
  let startKey: string | undefined
  let totalDeleted = 0

  do {
    // Query a batch of documents in the partition using the _partitioned_docs endpoint
    const partitionDocs = await db.partitionedList(partitionKey, {
      start_key: startKey,
      limit: BATCH_SIZE,
      include_docs: false
    })

    if (partitionDocs.rows.length === 0) {
      // No more documents to delete
      break
    }

    // Build a list of document IDs and revisions to delete
    const docsToDelete = partitionDocs.rows.map(row => ({
      _id: row.id,
      _rev: row.value.rev,
      _deleted: true
    }))

    // Delete the documents in bulk using the bulkDocs endpoint
    const deleteResults = await db.bulk({ docs: docsToDelete })

    // Check the delete results for errors
    for (const result of deleteResults) {
      if (result.error != null) {
        throw new Error(
          `Failed to delete document ${result.id}: ${result.error}`
        )
      }
    }

    // Log the number of deleted documents in this batch
    const numDeleted = deleteResults.filter(result => result.error == null)
      .length
    datelog(`Deleted ${numDeleted} documents in partition ${partitionKey}.`)
    totalDeleted += numDeleted

    // Set the start key for the next batch
    startKey = partitionDocs.rows[partitionDocs.rows.length - 1].id
  } while (true)

  datelog(
    `Deleted a total of ${totalDeleted} documents in partition ${partitionKey}.`
  )
}

rmPartition().catch(error => {
  console.error('Error deleting partition:', error)
})
