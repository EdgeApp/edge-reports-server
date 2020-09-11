import nano from 'nano'
import js from 'jsonfile'
import { asObject, asString } from 'cleaners'
import { datelog } from '../util'

const config = js.readFileSync('./config.json')
const nanoDb = nano(config.couchDbFullpath)
const reportsTransactions = nanoDb.use('reports_transactions')
const reportsCache = nanoDb.use('reports_progresscache')

interface Transactions {
  _id: string
  _rev: string
  _deleted: boolean
}

const asPartitionedDoc = asObject({
  id: asString,
  value: asObject({ rev: asString })
})

async function main(partitionName: string): Promise<void> {
  const transactions: Transactions[] = []
  try {
    await reportsTransactions.partitionedList(partitionName).then(body => {
      body.rows.forEach(doc => {
        asPartitionedDoc(doc)
        transactions.push({
          _id: doc.id,
          _rev: doc.value.rev,
          _deleted: true
        })
      })
    })
  } catch (e) {
    datelog(e)
    throw e
  }

  if (transactions.length === 0) {
    datelog(`Partition does not exist.`)
    return
  }

  try {
    await reportsTransactions.bulk({ docs: transactions })
    datelog(`Successfully Deleted: ${transactions.length} docs`)
    datelog(`Successfully Deleted: partition ${partitionName}`)

    // Delete progress Cache
    const split = partitionName.split('_')
    const name = split.join(':')
    const progress = await reportsCache.get(name)
    await reportsCache.destroy(progress._id, progress._rev)
    datelog(`Successfully Deleted: progress cache ${progress._id}`)
  } catch (e) {
    datelog(e)
  }
}

main(process.argv[2]).catch(e => datelog(e))
