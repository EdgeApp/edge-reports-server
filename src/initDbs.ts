import nano from 'nano'

import { config } from './config'
import { datelog } from './util'

const nanoDb = nano(config.couchDbFullpath)

const transactionIndexFields: string[][] = [
  ['isoDate'],
  ['status'],
  ['status', 'depositCurrency', 'isoDate'],
  ['status', 'depositCurrency', 'payoutCurrency', 'isoDate'],
  ['status', 'isoDate'],
  ['status', 'payoutAmount', 'depositAmount'],
  ['status', 'payoutCurrency', 'isoDate'],
  ['status', 'usdValue'],
  ['status', 'usdvalue', 'timestamp'],
  ['usdValue'],
  ['timestamp']
]

const transactionIndexFieldsNoPartition: string[][] = [
  ['depositAddress'],
  ['payoutAddress']
]

interface Index {
  index: { fields: string[] }
  ddoc: string
  name: string
  type: 'json'
  partitioned: boolean
}

const transactionIndexes: Index[] = []

transactionIndexFields.forEach(index => {
  const indexLower = index.map(i => i.toLowerCase())
  const out: Index = {
    index: { fields: index },
    ddoc: indexLower.join('-'),
    name: indexLower.join('-'),
    type: 'json',
    partitioned: false
  }
  transactionIndexes.push(out)
  const out2 = { ...out }
  out2.ddoc += '-p'
  out2.name += '-p'
  out2.partitioned = true
  transactionIndexes.push(out2)
})

transactionIndexFieldsNoPartition.forEach(index => {
  const indexLower = index.map(i => i.toLowerCase())
  const out: Index = {
    index: { fields: index },
    ddoc: indexLower.join('-'),
    name: indexLower.join('-'),
    type: 'json',
    partitioned: false
  }
  transactionIndexes.push(out)
})

const cacheIndexes: Index[] = [
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
    indexes: transactionIndexes
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
    if (!result.includes(dbName.name)) {
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
