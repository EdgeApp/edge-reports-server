import {
  asDate,
  asJSON,
  asObject,
  asOptional,
  asString,
  uncleaner
} from 'cleaners'
import fs from 'fs'
import nano from 'nano'
import path from 'path'

import { config } from '../config'
import { processBanxaTx } from '../partners/banxa'
import { processBitaccessTx } from '../partners/bitaccess'
import { processBitrefillTx } from '../partners/bitrefill'
import { processBitsOfGoldTx } from '../partners/bitsofgold'
import { processBityTx } from '../partners/bity'
import { processChangeHeroTx } from '../partners/changehero'
import { processChangellyTx } from '../partners/changelly'
import { processChangeNowTx } from '../partners/changenow'
import { processCoinSwitchTx } from '../partners/coinswitch'
import { processExolixTx } from '../partners/exolix'
import { processFaastTx } from '../partners/faast'
import { processFoxExchangeTx } from '../partners/foxExchange'
import { processGodexTx } from '../partners/godex'
import { processIoniaGiftCardsTx } from '../partners/ioniagiftcard'
import { processIoniaVisaRewardsTx } from '../partners/ioniavisarewards'
import { processKadoTx } from '../partners/kado'
import { processLetsExchangeTx } from '../partners/letsexchange'
import { processLibertyxTx } from '../partners/libertyx'
import { processLifiTx } from '../partners/lifi'
import { processMoonpayTx } from '../partners/moonpay'
import { processPaybisTx } from '../partners/paybis'
import { processPaytrieTx } from '../partners/paytrie'
import { processSafelloTx } from '../partners/safello'
import { processShapeshiftTx } from '../partners/shapeshift'
import { processSideshiftTx } from '../partners/sideshift'
import { processSimplexTx } from '../partners/simplex'
import { processSwapuzTx } from '../partners/swapuz'
import { processSwitchainTx } from '../partners/switchain'
import { processTransakTx } from '../partners/transak'
import { processWyreTx } from '../partners/wyre'
import { processXanpoolTx } from '../partners/xanpool'
import { DbTx, StandardTx, wasDbTx } from '../types'
import { datelog } from '../util'

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
  // thorchain: processThorchainTx,
  totle: undefined,
  transak: processTransakTx,
  wyre: processWyreTx,
  xanpool: processXanpoolTx
}

type MigrationState = ReturnType<typeof asMigrationState>
const asMigrationState = asJSON(
  asObject({
    bookmark: asOptional(asString)
  })
)
const wasMigrationState = uncleaner(asMigrationState)

const MIGRATION_STATE_FILE = './cache/migrationState.json'
const PAGE_SIZE = 1000

const nanoDb = nano(config.couchDbFullpath)

// Ensure migration state file directory exists.
fs.mkdirSync(path.dirname(MIGRATION_STATE_FILE), { recursive: true })

migration().catch(e => {
  datelog(e)
})

async function migration(): Promise<void> {
  // Args:
  const shouldInitialize = process.argv.includes('--init')
  const shouldStartOver = process.argv.includes('--start-over')

  const reportsTransactions = nanoDb.use<StandardTx>('reports_transactions')

  // Initialize migration state file:
  if (!fs.existsSync(MIGRATION_STATE_FILE)) {
    saveMigrationState({
      bookmark: undefined
    })
  }
  const migrationState = readMigrationState()

  if (shouldStartOver) {
    migrationState.bookmark = undefined
    saveMigrationState(migrationState)
  }

  // Migrate all transactions that do not have a createTime field.
  if (shouldInitialize) {
    console.log('Initializing documents...')
    while (true) {
      const response = await reportsTransactions.find({
        selector: {
          status: { $eq: 'complete' },
          createTime: { $exists: false }
        },
        use_index: 'status-createtime',
        limit: PAGE_SIZE
      })
      if (response.docs.length === 0) {
        break
      }
      const newDocs = await initializeDocument(response.docs)
      console.log(
        `Initialized ${newDocs.length} documents after ${response.docs[0]._id}`
      )
      await reportsTransactions.bulk({ docs: newDocs })
    }
    console.log('Initial migration complete.')
  }

  while (true) {
    const response = await reportsTransactions.find({
      selector: {
        status: { $eq: 'complete' }
      },
      sort: [{ status: 'asc' }, { createTime: 'asc' }],
      use_index: 'status-createtime',
      limit: PAGE_SIZE,
      bookmark: migrationState.bookmark
    })
    if (response.docs.length === 0) {
      break
    }
    const newDocs = await updateDocument(response.docs)
    console.log(
      `Updated ${newDocs.length} documents after ${response.docs[0]._id}`
    )
    await reportsTransactions.bulk({ docs: newDocs })
    // Update migration state:
    migrationState.bookmark = response.bookmark
    saveMigrationState(migrationState)
  }
  console.log('Migration complete.')

  migrationState.bookmark = undefined
  saveMigrationState(migrationState)
}

function readMigrationState(): MigrationState {
  const migrationStateFileContent = fs.readFileSync(MIGRATION_STATE_FILE, {
    encoding: 'utf8'
  })
  return asMigrationState(migrationStateFileContent)
}

function saveMigrationState(migrationState: MigrationState): void {
  fs.writeFileSync(MIGRATION_STATE_FILE, wasMigrationState(migrationState), {
    encoding: 'utf8'
  })
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

/**
 * Adds the createTime field to documents that are missing it.
 * This is a required field for migration processing.
 */
async function initializeDocument(
  docs: Array<StandardTx & nano.Document>
): Promise<DbTx[]> {
  const newDocs: DbTx[] = []
  for (const doc of docs) {
    const { partnerId } = getDocumentIdentifiers(doc._id)
    const processor = processors[partnerId]

    if (processor == null) {
      // Add createTime to document for minimal requirement for
      // migration/processing.
      newDocs.push({ ...doc, createTime: new Date() })
      datelog(`Not found ${partnerId} for document ${doc._id}`)
      continue
    }

    if (doc.rawTx == null) {
      // Add createTime to document for minimal requirement for
      // migration/processing.
      newDocs.push({ ...doc, createTime: new Date() })
      datelog(`Missing rawTx for document ${doc._id}`)
      continue
    }

    let standardTx
    try {
      standardTx = processor(doc.rawTx)
    } catch (error) {
      // Add createTime to document for minimal requirement for
      // migration/processing.
      newDocs.push({ ...doc, createTime: new Date() })
      datelog(`Error processing ${doc._id}`, error)
      continue
    }

    newDocs.push(
      wasDbTx({
        _id: doc._id,
        _rev: doc._rev,
        ...standardTx
      })
    )
  }

  return newDocs
}

/**
 * Updates the documents with any new fields using its processor function.
 */
async function updateDocument(
  docs: Array<StandardTx & nano.Document>
): Promise<DbTx[]> {
  const newDocs: DbTx[] = []
  for (const doc of docs) {
    const { partnerId } = getDocumentIdentifiers(doc._id)
    const processor = processors[partnerId]

    if (processor == null) {
      datelog(`Not found ${partnerId} for document ${doc._id}`)
      continue
    }

    if (doc.rawTx == null) {
      datelog(`Missing rawTx for document ${doc._id}`)
      continue
    }

    let standardTx
    try {
      standardTx = processor(doc.rawTx)
    } catch (error) {
      datelog(`Error processing ${doc._id}`, error)
      continue
    }

    newDocs.push(
      wasDbTx({
        _id: doc._id,
        _rev: doc._rev,
        createTime: asDate(doc.createTime),
        ...standardTx
      })
    )
  }

  return newDocs
}
