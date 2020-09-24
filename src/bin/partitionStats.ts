import { asArray, asNumber, asObject, asOptional } from 'cleaners'
import js from 'jsonfile'
import nano from 'nano'

import { datelog } from '../util'

const asPartitionData = asObject({
  timestamp: asNumber,
  usdValue: asOptional(asNumber),
  rawTx: asOptional(asObject)
})
const asPartitionResult = asObject({
  docs: asArray(asPartitionData)
})

const config = js.readFileSync('./config.json')
const nanoDb = nano(config.couchDbFullpath)
const reportsTransactions = nanoDb.use('reports_transactions')

async function main(partitionName: string): Promise<void> {
  try {
    const query = {
      selector: {
        _id: { $exists: true }
      },
      fields: ['timestamp', 'usdValue', 'rawTx'],
      use_index: 'timestamp-index',
      sort: ['timestamp'],
      limit: 10000000000
    }
    const result = await reportsTransactions.partitionedFind(
      partitionName,
      query
    )
    const txs = asPartitionResult(result).docs
    if (result.docs.length === 0) {
      datelog(`Partition does not exist.`)
      return
    }

    const newestTx = new Date(
      txs[txs.length - 1].timestamp * 1000
    ).toISOString()
    const oldestTx = new Date(txs[0].timestamp * 1000).toISOString()
    let usdTxs = 0
    let importedTxs = 0
    for (let i = 0; i < txs.length; i++) {
      if (typeof txs[i].usdValue !== 'undefined') {
        usdTxs++
      }
      if (typeof txs[i].rawTx === 'undefined') {
        importedTxs++
      }
    }
    datelog(`${partitionName}:`)
    datelog(`Total Number of Transactions: ${txs.length}`)
    datelog(`Total Number of Transactions with usdValues: ${usdTxs}`)
    datelog(`Total Number of Transactions that were imported: ${importedTxs}`)
    datelog(`Newest Transaction: ${newestTx}`)
    datelog(`Oldest Transaction: ${oldestTx}`)
  } catch (e) {
    datelog(e)
    throw e
  }
}

main(process.argv[2]).catch(e => datelog(e))
