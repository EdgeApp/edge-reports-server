import nano from 'nano'

import { config } from './config'
import { datelog } from './util'

const nanoDb = nano(config.couchDbFullpath)

const INDEXES: string[][] = [
  ['isoDate'],
  ['status'],
  ['status', 'depositCurrency', 'isoDate'],
  ['status', 'depositCurrency', 'payoutCurrency', 'isoDate'],
  ['status', 'isoDate'],
  ['status', 'payoutAmount', 'depositAmount'],
  ['status', 'payoutCurrency', 'isoDate'],
  ['status', 'usdValue'],
  ['status', 'usdvalue', 'timestamp'],
  ['usdValue']
]

interface Index {
  index: { fields: string[] }
  ddoc: string
  name: string
  type: 'json'
  partitioned: boolean
}

const indexes: Index[] = []

INDEXES.forEach(index => {
  const indexLower = index.map(i => i.toLowerCase())
  const out = {
    index: { fields: index },
    ddoc: indexLower.join('-'),
    name: indexLower.join('-'),
    type: 'json' as 'json',
    partitioned: false
  }
  indexes.push(out)
  out.ddoc += '-p'
  out.name += '-p'
  out.partitioned = true
  indexes.push(out)
})

const cacheIndexes = [
  {
    index: { fields: ['timestamp'] },
    ddoc: 'timestamp-p',
    name: 'timestamp-p',
    type: 'json' as 'json',
    partitioned: true
  }
]

const options = { partitioned: true }

const DB_NAMES = [
  { name: 'reports_apps' },
  { name: 'reports_settings' },
  {
    name: 'reports_transactions',
    options,
    indexes
  },
  { name: 'reports_progresscache', options },
  {
    name: 'reports_hour',
    options,
    indexes: cacheIndexes
  },
  {
    name: 'reports_day',
    options,
    indexes: cacheIndexes
  },
  {
    name: 'reports_month',
    options,
    indexes: cacheIndexes
  }
]

export async function initDbs(): Promise<void> {
  // get a list of all databases within couchdb
  const result = await nanoDb.db.list()
  datelog(result)
  // if database does not exist, create it
  for (const dbName of DB_NAMES) {
    if (result.includes(dbName.name) === false) {
      await nanoDb.db.create(dbName.name, dbName.options)
    }
    if (dbName.indexes !== undefined) {
      const currentDb = nanoDb.db.use(dbName.name)
      for (const dbIndex of dbName.indexes) {
        try {
          await currentDb.get(`_design/${dbIndex.ddoc}`)
          datelog(`${dbName.name} already has '${dbIndex.name}' index.`)
        } catch {
          await currentDb.createIndex(dbIndex)
          datelog(`Created '${dbIndex.name}' index for ${dbName.name}.`)
        }
      }
    }
  }
}
