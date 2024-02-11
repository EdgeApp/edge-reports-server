import nano from 'nano'

import { getAnalytics } from './apiAnalytics'
import { config } from './config'
import { asDbReq } from './dbutils'
import { initDbs } from './initDbs'
import { asApps } from './types'
import {
  datelog,
  getStartOfMonthsAgo,
  getStartOfMonthsFromNow,
  snooze
} from './util'

const CACHE_UPDATE_LOOKBACK_MONTHS = config.cacheLookbackMonths ?? 3

const BULK_WRITE_SIZE = 50
const UPDATE_FREQUENCY_MS = 1000 * 60 * 30
const CACHE_UPDATE_BLOCK_MONTHS = 3

const nanoDb = nano(config.couchDbFullpath)

const TIME_PERIODS = ['hour', 'day', 'month']
const birthdayStart = getStartOfMonthsAgo(
  new Date('2017-01Z').toISOString(),
  0
).toISOString()

export async function cacheEngine(): Promise<void> {
  datelog('Starting Cache Engine')
  console.time('cacheEngine')

  await initDbs()

  const reportsApps = nanoDb.use('reports_apps')
  const reportsTransactions = nanoDb.use('reports_transactions')
  const reportsHour = nanoDb.use('reports_hour')
  const reportsDay = nanoDb.use('reports_day')
  const reportsMonth = nanoDb.use('reports_month')

  while (true) {
    let start: string
    const now = new Date().toISOString()
    const end = getStartOfMonthsFromNow(now, 1).toISOString()

    try {
      await reportsMonth.get('initialized:initialized')
      start = getStartOfMonthsAgo(
        now,
        CACHE_UPDATE_LOOKBACK_MONTHS
      ).toISOString()
    } catch (e) {
      start = birthdayStart
    }

    const query = {
      selector: {
        appId: { $exists: true }
      },
      limit: 1000000
    }
    const rawApps = await reportsApps.find(query)
    const apps = asApps(rawApps.docs)
    for (const app of apps) {
      if (config.soloAppIds != null && !config.soloAppIds.includes(app.appId)) {
        continue
      }
      const partnerIds = Object.keys(app.partnerIds)

      for (const partnerId of partnerIds) {
        if (
          config.soloPartnerIds != null &&
          !config.soloPartnerIds.includes(partnerId)
        ) {
          continue
        }

        for (
          let localStart: string = start;
          localStart < end;
          localStart = getStartOfMonthsFromNow(
            localStart,
            CACHE_UPDATE_BLOCK_MONTHS
          ).toISOString()
        ) {
          const localEnd = getStartOfMonthsFromNow(
            localStart,
            CACHE_UPDATE_BLOCK_MONTHS
          ).toISOString()

          const tsStart = new Date(localStart).getTime() / 1000
          const tsEnd = new Date(localEnd).getTime() / 1000
          const query = {
            selector: {
              status: { $eq: 'complete' },
              usdValue: { $gte: 0 },
              timestamp: { $gte: tsStart, $lt: tsEnd }
            },
            fields: [
              'orderId',
              'depositCurrency',
              'payoutCurrency',
              'timestamp',
              'usdValue'
            ],
            use_index: 'timestamp-p',
            sort: ['timestamp'],
            limit: 1000000
          }
          const appAndPartnerId = `${app.appId}_${partnerId}`

          let data
          try {
            datelog('find txs', appAndPartnerId, localStart, localEnd)
            data = await reportsTransactions.partitionedFind(
              appAndPartnerId,
              query
            )
          } catch (e) {
            datelog('Error fetching transactions', e)
            console.error(e)
            break
          }

          const dbReq = asDbReq(data)
          const dbTxs = dbReq.docs

          if (dbTxs.length === 0) continue

          const analytic = getAnalytics(
            dbTxs,
            tsStart,
            tsEnd,
            app.appId,
            appAndPartnerId,
            TIME_PERIODS.join(',')
          )
          const { result } = analytic
          if (result == null) continue
          if (result.numAllTxs === 0) continue
          for (const timePeriod of TIME_PERIODS) {
            // Create cache docs
            const cacheResult = result[timePeriod].map(bucket => {
              return {
                _id: `${app.appId}_${partnerId}:${bucket.isoDate}`,
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
              if (localStart !== birthdayStart) {
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
                `Update cache db ${timePeriod} cache for ${app.appId}_${partnerId}. length = ${cacheResult.length}`
              )

              for (
                let writeStart = 0;
                writeStart < cacheResult.length;
                writeStart += BULK_WRITE_SIZE
              ) {
                const writeEnd =
                  writeStart + BULK_WRITE_SIZE > cacheResult.length
                    ? cacheResult.length
                    : writeStart + BULK_WRITE_SIZE
                // datelog(`Bulk writing docs ${start} to ${end - 1}`)
                const docs = cacheResult.slice(writeStart, writeEnd)
                datelog(
                  `Bulk writing docs ${writeStart} to ${writeEnd} of ${cacheResult.length.toString()}`
                )
                await database.bulk({ docs })
              }

              datelog(
                `Finished updating ${timePeriod} ${localStart} ${localEnd} cache for ${app.appId}_${partnerId}`
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
