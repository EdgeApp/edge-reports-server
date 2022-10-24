import { asArray, asMap, asObject, asString } from 'cleaners'
import startOfMonth from 'date-fns/startOfMonth'
import sub from 'date-fns/sub'
import nano from 'nano'

import config from '../config.json'
import { datelog, getAnalytic, snooze } from './util'

const BULK_WRITE_SIZE = 50
const UPDATE_FREQUENCY_MS = 1000 * 60 * 30
const asApp = asObject({
  _id: asString,
  appId: asString,
  pluginIds: asMap(asMap(asString))
})
const asApps = asArray(asApp)

const nanoDb = nano(config.couchDbFullpath)

const DB_NAMES = [
  {
    name: 'reports_hour',
    options: { partitioned: true },
    indexes: [
      {
        index: { fields: ['timestamp'] },
        ddoc: 'timestamp-index',
        name: 'Timestamp',
        type: 'json' as 'json',
        partitioned: true
      }
    ]
  },
  {
    name: 'reports_day',
    options: { partitioned: true },
    indexes: [
      {
        index: { fields: ['timestamp'] },
        ddoc: 'timestamp-index',
        name: 'Timestamp',
        type: 'json' as 'json',
        partitioned: true
      }
    ]
  },
  {
    name: 'reports_month',
    options: { partitioned: true },
    indexes: [
      {
        index: { fields: ['timestamp'] },
        ddoc: 'timestamp-index',
        name: 'Timestamp',
        type: 'json' as 'json',
        partitioned: true
      }
    ]
  }
]
const TIME_PERIODS = ['hour', 'day', 'month']

export async function cacheEngine(): Promise<void> {
  datelog('Starting Cache Engine')
  console.time('cacheEngine')
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

  const reportsApps = nanoDb.use('reports_apps')
  const reportsTransactions = nanoDb.use('reports_transactions')
  const reportsHour = nanoDb.use('reports_hour')
  const reportsDay = nanoDb.use('reports_day')
  const reportsMonth = nanoDb.use('reports_month')

  while (true) {
    let start
    const end = new Date(Date.now()).getTime() / 1000

    try {
      await reportsMonth.get('initialized:initialized')
      const monthStart = startOfMonth(new Date(Date.now()))
      start = sub(monthStart, { months: 1 }).getTime() / 1000
    } catch (e) {
      start = new Date(2017, 1, 20).getTime() / 1000
    }

    const query = {
      selector: {
        appId: { $exists: true }
      },
      fields: ['_id', 'appId', 'pluginIds'],
      limit: 1000000
    }
    const rawApps = await reportsApps.find(query)
    const apps = asApps(rawApps.docs)
    for (const app of apps) {
      const keys = Object.keys(app.pluginIds)
      for (const key of keys) {
        for (const timePeriod of TIME_PERIODS) {
          const data = await getAnalytic(
            start,
            end,
            app.appId,
            [key],
            timePeriod,
            reportsTransactions
          )
          // Create cache docs
          if (data.length > 0) {
            const cacheResult = data[0].result[timePeriod].map(bucket => {
              return {
                _id: `${app.appId}_${key}:${bucket.isoDate}`,
                timestamp: bucket.start,
                usdValue: bucket.usdValue,
                numTxs: bucket.numTxs,
                currencyCodes: bucket.currencyCodes,
                currencyPairs: bucket.currencyPairs
              }
            })
            try {
              let database
              if (timePeriod === 'hour') database = reportsHour
              else if (timePeriod === 'day') database = reportsDay
              else {
                database = reportsMonth
              }
              // Fetch existing _revs of cache
              if (start !== new Date(2017, 1, 20).getTime() / 1000) {
                const documentIds = cacheResult.map(cache => {
                  return cache._id
                })
                const _revs = await database.fetchRevs({ keys: documentIds })
                for (let i = 0; i < _revs.rows.length; i++) {
                  if (
                    _revs.rows[i].error == null &&
                    _revs.rows[i].value.deleted !== true
                  ) {
                    cacheResult[i]._rev = _revs.rows[i].value.rev
                  }
                }
              }

              datelog(
                `Update cache db ${timePeriod} cache for ${app.appId}_${key}. length = ${cacheResult.length}`
              )

              for (
                let start = 0;
                start < cacheResult.length;
                start += BULK_WRITE_SIZE
              ) {
                const end =
                  start + BULK_WRITE_SIZE > cacheResult.length
                    ? cacheResult.length
                    : start + BULK_WRITE_SIZE
                // datelog(`Bulk writing docs ${start} to ${end - 1}`)
                const docs = cacheResult.slice(start, end)
                datelog(
                  `Bulk writing docs ${start} to ${end} of ${cacheResult.length.toString()}`
                )
                await database.bulk({ docs })
              }

              datelog(
                `Finished updating ${timePeriod} cache for ${app.appId}_${key}`
              )
            } catch (e) {
              datelog('Error doing bulk cache update', e)
              throw e
            }
          }
        }
      }
    }
    try {
      await reportsMonth.get('initialized:initialized')
      datelog('Cache Update Complete.')
    } catch {
      try {
        await reportsMonth
          .insert({ _id: 'initialized:initialized' })
          .then(() => {
            datelog('Cache Initialized.')
          })
      } catch {
        datelog('Failed to Create Initialized Marker.')
      }
    }
    console.timeEnd('cacheEngine')
    await snooze(UPDATE_FREQUENCY_MS)
  }
}
