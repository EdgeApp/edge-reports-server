import {
  DatabaseSetup,
  JsDesignDocument,
  makeMangoIndex,
  MangoDesignDocument,
  setupDatabase
} from 'edge-server-tools'

import { config } from './config'

interface DesignDocumentMap {
  [designDocName: string]: MangoDesignDocument | JsDesignDocument
}

function fieldsToDesign(
  fields: string[],
  withPartitionVariant: boolean = true
): DesignDocumentMap {
  const indexLower = fields.map(i => i.toLowerCase())
  const name = indexLower.join('-')
  const out: DesignDocumentMap = {}
  out[`_design/${name}`] = makeMangoIndex(name, fields, {
    partitioned: false
  })
  if (withPartitionVariant) {
    out[`_design/${name}-p`] = makeMangoIndex(`${name}-p`, fields, {
      partitioned: true
    })
  }
  return out
}

const transactionIndexes: DesignDocumentMap = {
  ...fieldsToDesign(['isoDate']),
  ...fieldsToDesign(['status']),
  ...fieldsToDesign(['status', 'depositCurrency', 'isoDate']),
  ...fieldsToDesign(['status', 'depositCurrency', 'payoutCurrency', 'isoDate']),
  ...fieldsToDesign(['status', 'isoDate']),
  ...fieldsToDesign(['status', 'payoutAmount', 'depositAmount']),
  ...fieldsToDesign(['status', 'payoutCurrency', 'isoDate']),
  ...fieldsToDesign(['status', 'createTime']),
  ...fieldsToDesign(['status', 'usdValue']),
  ...fieldsToDesign(['status', 'usdValue', 'timestamp']),
  ...fieldsToDesign(['usdValue']),
  ...fieldsToDesign(['timestamp']),
  ...fieldsToDesign(['depositAddress'], false),
  ...fieldsToDesign(['payoutAddress'], false)
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
    ...transactionIndexes
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
