import {
  DatabaseSetup,
  JsDesignDocument,
  makeJsDesign,
  makeMangoIndex,
  MangoDesignDocument,
  setupDatabase
} from 'edge-server-tools'

import { config } from './config'
import { fixJs } from './util/fixJs'

interface DesignDocumentMap {
  [designDocName: string]: MangoDesignDocument | JsDesignDocument
}

function fieldsToDesignDocs(
  fields: string[],
  opts?: {
    noPartitionVariant?: boolean
  }
): DesignDocumentMap {
  const { noPartitionVariant = false } = opts ?? {}
  const indexLower = fields.map(i => i.toLowerCase())
  const name = indexLower.join('-')
  const out: DesignDocumentMap = {}
  out[`_design/${name}`] = makeMangoIndex(name, fields, {
    partitioned: false
  })
  if (!noPartitionVariant) {
    out[`_design/${name}-p`] = makeMangoIndex(`${name}-p`, fields, {
      partitioned: true
    })
  }
  return out
}

const transactionIndexes: DesignDocumentMap = {
  ...fieldsToDesignDocs(['isoDate']),
  ...fieldsToDesignDocs(['status']),
  ...fieldsToDesignDocs(['status', 'depositCurrency', 'isoDate']),
  ...fieldsToDesignDocs([
    'status',
    'depositCurrency',
    'payoutCurrency',
    'isoDate'
  ]),
  ...fieldsToDesignDocs(['status', 'isoDate']),
  ...fieldsToDesignDocs(['status', 'payoutAmount', 'depositAmount']),
  ...fieldsToDesignDocs(['status', 'payoutCurrency', 'isoDate']),
  ...fieldsToDesignDocs(['status', 'usdValue']),
  ...fieldsToDesignDocs(['status', 'usdValue', 'timestamp']),
  ...fieldsToDesignDocs(['usdValue']),
  ...fieldsToDesignDocs(['timestamp']),
  ...fieldsToDesignDocs(['depositAddress'], { noPartitionVariant: true }),
  ...fieldsToDesignDocs(['payoutAddress'], { noPartitionVariant: true }),
  ...fieldsToDesignDocs(['payoutAddress', 'isoDate'], {
    noPartitionVariant: true
  })
}

const cacheIndexes: DesignDocumentMap = {
  '_design/timestamp-p': makeMangoIndex('timestamp-p', ['timestamp'], {
    partitioned: true
  })
}

const appsDatabaseSetup: DatabaseSetup = {
  name: 'reports_apps'
}
const settingsDatabaseSetup: DatabaseSetup = {
  name: 'reports_settings'
}
const transactionsDatabaseSetup: DatabaseSetup = {
  name: 'reports_transactions',
  options: { partitioned: true },
  documents: {
    ...transactionIndexes,
    '_design/getTxInfo': makeJsDesign(
      'payoutHashfixByDate',
      ({ emit }) => ({
        map: function(doc) {
          const space = 1099511627776 // 5 bytes of space; 2^40
          const prime = 769 // large prime number
          let hashfix = 0 // the final hashfix
          for (let i = 0; i < doc.payoutAddress.length; i++) {
            const byte = doc.payoutAddress.charCodeAt(i)
            hashfix = (hashfix * prime + byte) % space
          }
          emit([hashfix, doc.isoDate], doc._id)
        }
      }),
      {
        fixJs,
        partitioned: false
      }
    )
  }
}
const progressCacheDatabaseSetup: DatabaseSetup = {
  name: 'reports_progresscache',
  options: { partitioned: true }
}
const hourDatabaseSetup: DatabaseSetup = {
  name: 'reports_hour',
  options: { partitioned: true },
  documents: cacheIndexes
}
const dayDatabaseSetup: DatabaseSetup = {
  name: 'reports_day',
  options: { partitioned: true },
  documents: cacheIndexes
}
const monthDatabaseSetup: DatabaseSetup = {
  name: 'reports_month',
  options: { partitioned: true },
  documents: cacheIndexes
}

const databases = [
  appsDatabaseSetup,
  settingsDatabaseSetup,
  transactionsDatabaseSetup,
  progressCacheDatabaseSetup,
  hourDatabaseSetup,
  dayDatabaseSetup,
  monthDatabaseSetup
]

export async function initDbs(): Promise<void> {
  await Promise.all(
    databases.map(
      async setup => await setupDatabase(config.couchDbFullpath, setup)
    )
  )
}
