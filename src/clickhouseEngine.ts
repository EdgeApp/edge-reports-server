import { createClient } from '@clickhouse/client'
import nano from 'nano'

import { clientConfig } from './bin/configure'
import { config } from './config'
import { initDbs } from './initDbs'
import { processBanxaTx } from './partners/banxa'
import { processBitaccessTx } from './partners/bitaccess'
import { processBitrefillTx } from './partners/bitrefill'
import { processBitsOfGoldTx } from './partners/bitsofgold'
import { processBityTx } from './partners/bity'
import { processChangeHeroTx } from './partners/changehero'
import { processChangellyTx } from './partners/changelly'
import { processChangeNowTx } from './partners/changenow'
import { processCoinSwitchTx } from './partners/coinswitch'
import { processExolixTx } from './partners/exolix'
import { processFaastTx } from './partners/faast'
import { processFoxExchangeTx } from './partners/foxExchange'
import { processGodexTx } from './partners/godex'
import { processIoniaGiftCardsTx } from './partners/ioniagiftcard'
import { processIoniaVisaRewardsTx } from './partners/ioniavisarewards'
import { processKadoTx } from './partners/kado'
import { processLetsExchangeTx } from './partners/letsexchange'
import { processLibertyxTx } from './partners/libertyx'
import { processLifiTx } from './partners/lifi'
import { processMoonpayTx } from './partners/moonpay'
import { processPaybisTx } from './partners/paybis'
import { processPaytrieTx } from './partners/paytrie'
import { processSafelloTx } from './partners/safello'
import { processShapeshiftTx } from './partners/shapeshift'
import { processSideshiftTx } from './partners/sideshift'
import { processSimplexTx } from './partners/simplex'
import { processSwapuzTx } from './partners/swapuz'
import { processSwitchainTx } from './partners/switchain'
import { processThorchainTx } from './partners/thorchain'
import { processTransakTx } from './partners/transak'
import { processWyreTx } from './partners/wyre'
import { processXanpoolTx } from './partners/xanpool'
import { DbTx, StandardTx, wasDbTx } from './types'
import { datelog, snooze } from './util'

// Clickhouse recommends large batch inserts. We consider the couchdb
// query size as well.
const PAGE_SIZE = 10_000

const nanoDb = nano(config.couchDbFullpath)
const clickhouseDb = createClient(config.clickhouseConnection)

const processors: {
  [partnerId: string]: undefined | ((rawTx: unknown) => StandardTx)
} = {
  banxa: processBanxaTx,
  bitaccess: processBitaccessTx,
  bitrefill: processBitrefillTx,
  bitsofgold: processBitsOfGoldTx,
  bity: processBityTx,
  changehero: processChangeHeroTx,
  changelly: processChangellyTx,
  changenow: processChangeNowTx,
  coinswitch: processCoinSwitchTx,
  exolix: processExolixTx,
  faast: processFaastTx,
  foxExchange: processFoxExchangeTx,
  gebo: undefined,
  godex: processGodexTx,
  ioniagiftcards: processIoniaGiftCardsTx,
  ioniavisarewards: processIoniaVisaRewardsTx,
  kado: processKadoTx,
  letsexchange: processLetsExchangeTx,
  libertyx: processLibertyxTx,
  lifi: processLifiTx,
  moonpay: processMoonpayTx,
  paybis: processPaybisTx,
  paytrie: processPaytrieTx,
  safello: processSafelloTx,
  shapeshift: processShapeshiftTx,
  sideshift: processSideshiftTx,
  simplex: processSimplexTx,
  swapuz: processSwapuzTx,
  switchain: processSwitchainTx,
  thorchain: processThorchainTx,
  totle: undefined,
  transak: processTransakTx,
  wyre: processWyreTx,
  xanpool: processXanpoolTx
}

export async function clickhouseEngine(): Promise<void> {
  await initDbs()
  await initClickhouseDb()

  const dbTransactions = nanoDb.db.use<StandardTx>('reports_transactions')

  let afterTime = new Date(0).toISOString()
  let i = 0

  while (true) {
    const response = await dbTransactions.find({
      selector: {
        status: { $eq: 'complete' },
        updateTime: { $gt: afterTime }
      },
      sort: [{ updateTime: 'asc' }],
      use_index: 'status-updatetime',
      limit: PAGE_SIZE,
      skip: PAGE_SIZE * i++
    })

    const startDocId = response.docs[0]?._id
    const endDocId = response.docs[response.docs.length - 1]?._id

    if (response.docs.length > 0) {
      datelog(
        `Processing ${response.docs.length} rows from ${startDocId} to ${endDocId}.`
      )
    } else {
      datelog(`Queried for new documents after ${afterTime}.`)
    }

    const newDocs: DbTx[] = []
    const newRows: any[][] = []
    let lastDocUpdateTime: string | undefined

    for (const doc of response.docs) {
      const { appId, partnerId } = getDocumentIdentifiers(doc._id)
      const processor = processors[partnerId]

      if (processor == null) {
        datelog(`Not found ${partnerId} for document ${doc._id}`)
        continue
      }

      let standardTx: StandardTx
      try {
        standardTx = processor(doc.rawTx)
      } catch (error) {
        datelog(
          `Failed processing ${doc._id} with '${partnerId}' processor`,
          String(error)
        )
        continue
      }

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

      lastDocUpdateTime = standardTx.updateTime.toISOString()
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
      i = 0
      if (lastDocUpdateTime != null) {
        afterTime = lastDocUpdateTime
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
