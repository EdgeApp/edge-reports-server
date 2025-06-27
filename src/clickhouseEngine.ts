import { createClient } from '@clickhouse/client'
import { asDate, asObject, asOptional, asString, uncleaner } from 'cleaners'
import nano from 'nano'

import { config } from './config'
import { initDbs } from './initDbs'
import { asStandardTx, DbTx, StandardTx, wasDbTx } from './types'
import { datelog, snooze } from './util'

// Clickhouse recommends large batch inserts. We consider the couchdb
// query size as well.
const PAGE_SIZE = 10_000

const nanoDb = nano(config.couchDbFullpath)
const clickhouseDb = createClient(config.clickhouseConnection)

const progressDocName = 'clickhouse:clickhouseEngine'
const asClickhouseProgress = asObject({
  _id: asOptional(asString, progressDocName),
  _rev: asOptional(asString),
  afterTime: asOptional(asDate, new Date(0))
})
const wasClickhouseProgress = uncleaner(asClickhouseProgress)

export async function clickhouseEngine(): Promise<void> {
  await initDbs()
  await initClickhouseDb()

  const dbTransactions = nanoDb.db.use<StandardTx>('reports_transactions')

  const dbProgress = nanoDb.db.use('reports_progresscache')
  const out = await dbProgress.get(progressDocName).catch(error => {
    if (error.error != null && error.error === 'not_found') {
      datelog(`Previous Progress Record Not Found ${progressDocName}`)
      return {}
    }
    throw error
  })
  const progressDoc = asClickhouseProgress(out)

  let bookmark: string | undefined

  while (true) {
    const response = await dbTransactions.find({
      selector: {
        status: { $eq: 'complete' },
        updateTime: { $gt: progressDoc.afterTime.toISOString() }
      },
      sort: [{ updateTime: 'asc' }],
      use_index: 'status-updatetime',
      limit: PAGE_SIZE,
      bookmark
    })

    bookmark = response.bookmark

    const startDocId = response.docs[0]?._id
    const endDocId = response.docs[response.docs.length - 1]?._id

    if (response.docs.length > 0) {
      datelog(
        `Processing ${response.docs.length} rows from ${startDocId} to ${endDocId}.`
      )
    } else {
      datelog(
        `Queried for new documents after ${progressDoc.afterTime.toISOString()}.`
      )
    }

    const newDocs: DbTx[] = []
    const newRows: any[][] = []
    let lastDocUpdateTime: string | undefined

    for (const doc of response.docs) {
      const { appId, partnerId } = getDocumentIdentifiers(doc._id)

      const standardTx = asStandardTx(doc)

      newRows.push([
        appId,
        partnerId,
        standardTx.orderId,
        standardTx.countryCode,
        standardTx.depositTxid,
        standardTx.depositAddress,
        standardTx.depositCurrency,
        standardTx.depositAmount,
        standardTx.direction,
        standardTx.exchangeType,
        standardTx.paymentType,
        standardTx.payoutTxid,
        standardTx.payoutAddress,
        standardTx.payoutCurrency,
        standardTx.payoutAmount,
        standardTx.status,
        Math.round(standardTx.timestamp),
        standardTx.usdValue,
        config.clickhouseIndexVersion
      ])

      newDocs.push(
        wasDbTx({
          _id: doc._id,
          _rev: doc._rev,
          ...standardTx
        })
      )

      const txUpdateTime = standardTx.updateTime.toISOString()
      if (lastDocUpdateTime == null || lastDocUpdateTime < txUpdateTime) {
        lastDocUpdateTime = txUpdateTime
      }
    }

    // Add the standardTx to the clickhouse database
    await clickhouseDb.insert({
      table: 'reports_transactions',
      columns: [
        'appId',
        'partnerId',
        'orderId',
        'countryCode',
        'depositTxid',
        'depositAddress',
        'depositCurrency',
        'depositAmount',
        'direction',
        'exchangeType',
        'paymentType',
        'payoutTxid',
        'payoutAddress',
        'payoutCurrency',
        'payoutAmount',
        'status',
        'timestamp',
        'usdValue',
        'indexVersion'
      ],
      values: newRows
    })
    // Update all documents processed
    await dbTransactions.bulk({ docs: newDocs })

    // We've reached the end of the view index, so we'll continue but with a
    // delay so as not to thrash the couchdb unnecessarily.
    if (response.docs.length !== PAGE_SIZE) {
      bookmark = undefined
      if (lastDocUpdateTime != null) {
        progressDoc.afterTime = new Date(lastDocUpdateTime)
        await dbProgress.insert(wasClickhouseProgress(progressDoc))
      }
      await snooze(5000)
    }
  }
}

function getDocumentIdentifiers(
  documentId: string
): { appId: string; partnerId: string } {
  const parts = documentId.split(':')[0].split('_')
  if (parts.length === 0) {
    throw new Error(`Invalid documentId ${documentId}`)
  }
  const partnerId = parts.pop() as string
  const appId = parts.join('_')
  return { appId, partnerId }
}

const REPORTS_TRANSACTIONS_SCHEMA = `\
CREATE TABLE default.reports_transactions
(
    \`partnerId\` String,
    \`appId\` String,
    \`orderId\` String,
    \`countryCode\` String,
    \`depositTxid\` String,
    \`depositAddress\` String,
    \`depositCurrency\` String,
    \`depositAmount\` Float64,
    \`direction\` String,
    \`exchangeType\` String,
    \`paymentType\` String,
    \`payoutTxid\` String,
    \`payoutAddress\` String,
    \`payoutCurrency\` String,
    \`payoutAmount\` Float64,
    \`status\` String,
    \`timestamp\` DateTime DEFAULT now(),
    \`usdValue\` Float64,
    \`indexVersion\` UInt16
)
ENGINE = ReplacingMergeTree
PRIMARY KEY (appId, partnerId, orderId)
ORDER BY (appId, partnerId, orderId, timestamp)
SETTINGS index_granularity = 8192`

async function initClickhouseDb(): Promise<void> {
  // Check if the table exists
  const tableExists = await clickhouseDb.query({
    query: `
      SELECT 1
      FROM system.tables
      WHERE database = 'default' AND name = 'reports_transactions'
      LIMIT 1;
    `,
    format: 'JSONEachRow'
  })

  const result = await tableExists.json()
  if (result.length > 0) {
    const response = await clickhouseDb.query({
      query: 'SHOW CREATE reports_transactions'
    })
    const result = await response.json()
    const tableSchema = (result.data[0] as any).statement

    if (tableSchema !== REPORTS_TRANSACTIONS_SCHEMA) {
      console.log(tableSchema)
      throw new Error('Table "reports_transactions" schema does not match.')
    }

    datelog('Table "reports_transactions" exists.')
    return
  }

  // Create the table
  await clickhouseDb.command({
    query: REPORTS_TRANSACTIONS_SCHEMA
  })
  datelog('Table "reports_transactions" has been created.')
}
