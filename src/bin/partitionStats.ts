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
  const partitionNames: string[] = []
  if (partitionName === 'all') {
    partitionNames.push(
      'edge_banxa',
      'edge_bitaccess',
      'edge_bitrefill',
      'edge_bitsofgold',
      'edge_bity',
      'edge_changelly',
      'edge_changenow',
      'edge_coinswitch',
      'edge_faast',
      'edge_fox',
      'edge_godex',
      'edge_libertyx',
      'edge_moonpay',
      'edge_safello',
      'edge_shapeshift',
      'edge_sideshift',
      'edge_simplex',
      'edge_switchain',
      'edge_totle',
      'edge_transak',
      'edge_wyre'
    )
  } else {
    partitionNames.push(partitionName)
  }
  try {
    for (const partner of partitionNames) {
      const query = {
        selector: {
          _id: { $exists: true }
        },
        fields: ['timestamp', 'usdValue', 'rawTx'],
        use_index: 'timestamp-index',
        sort: ['timestamp'],
        limit: 10000000000
      }
      const result = await reportsTransactions.partitionedFind(partner, query)
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
      let usdAmount = 0
      let importedTxs = 0
      for (let i = 0; i < txs.length; i++) {
        const usdValue = txs[i].usdValue
        if (typeof usdValue !== 'undefined') {
          usdTxs++
          usdAmount += usdValue
        }
        if (typeof txs[i].rawTx === 'undefined') {
          importedTxs++
        }
      }
      console.log(`${partner}:`)
      console.log(`Total Number of Transactions: ${txs.length}`)
      console.log(`Total Number of Transactions with usdValues: ${usdTxs}`)
      console.log(`Total USD Value: ${usdAmount}`)
      console.log(
        `Total Number of Transactions that were imported: ${importedTxs}`
      )
      console.log(`Newest Transaction: ${newestTx}`)
      console.log(`Oldest Transaction: ${oldestTx}`)
    }
  } catch (e) {
    datelog(e)
    throw e
  }
}

main(process.argv[2]).catch(e => datelog(e))
