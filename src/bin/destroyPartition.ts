import nano from 'nano'
import config from '../../config.json'
import { asArray, asObject, asString } from 'cleaners'
import { datelog } from '../util'

const nanoDb = nano(config.couchDbFullpath)
const reportsTransactions = nanoDb.use('reports_transactions')
const reportsCache = nanoDb.use('reports_progresscache')

const asDbReq = asObject({
  docs: asArray(
    asObject({
      _id: asString,
      _rev: asString
    })
  )
})

async function main(partitionName: string): Promise<void> {
  const query = {
    selector: {
      _id: { $exists: true }
    },
    fields: ['_id', '_rev'],
    limit: 10000000
  }
  let result
  try {
    const r = await reportsTransactions.partitionedFind(partitionName, query)
    result = asDbReq(r)
  } catch (e) {
    datelog(e)
    throw e
  }

  if (result.docs.length === 0) {
    datelog(`Partition does not exist.`)
    return
  }

  const promiseArray: Array<Promise<void>> = []
  try {
    for (const tx of result.docs) {
      promiseArray.push(
        reportsTransactions
          .destroy(tx._id, tx._rev)
          .then(() =>
            datelog(`Successfully Deleted: id:${tx._id}, rev: ${tx._rev}`)
          )
      )
    }
    await Promise.all(promiseArray)
    datelog(`Successfully Deleted: ${result.docs.length} docs`)
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
