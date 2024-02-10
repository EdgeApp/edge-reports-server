import { asArray, asNumber, asObject, asString } from 'cleaners'
import nano from 'nano'

import { getAnalytics } from './apiAnalytics'
import { config } from './config'
import { AnalyticsResult, asCacheQuery } from './types'
import { datelog, promiseTimeout } from './util'

const BATCH_ADVANCE = 100
const SIX_DAYS_IN_SECONDS = 6 * 24 * 60 * 60

export const asDbReq = asObject({
  docs: asArray(
    asObject({
      orderId: asString,
      depositCurrency: asString,
      payoutCurrency: asString,
      timestamp: asNumber,
      usdValue: asNumber
    })
  )
})

export type DbReq = ReturnType<typeof asDbReq>

export const pagination = async <T>(
  txArray: any[],
  partition: nano.DocumentScope<T>
): Promise<void> => {
  let numErrors = 0
  for (let offset = 0; offset < txArray.length; offset += BATCH_ADVANCE) {
    let advance = BATCH_ADVANCE
    if (offset + BATCH_ADVANCE > txArray.length) {
      advance = txArray.length - offset
    }
    const docs = await promiseTimeout(
      'partition.bulk',
      partition.bulk({
        docs: txArray.slice(offset, offset + advance)
      })
    )
    datelog(`Processed ${offset + advance} txArray.`)
    for (const doc of docs) {
      if (doc.error != null) {
        datelog(
          `There was an error in the batch ${doc.error}.  id: ${doc.id}. revision: ${doc.rev}`
        )
        numErrors++
      }
    }
  }
  datelog(`total errors: ${numErrors}`)
}

export const cacheAnalytic = async (
  start: number,
  end: number,
  appId: string,
  partnerIds: string[],
  timePeriod: string
): Promise<any> => {
  const nanoDb = nano(config.couchDbFullpath)
  const reportsHour = nanoDb.use('reports_hour')
  const reportsDay = nanoDb.use('reports_day')
  const reportsMonth = nanoDb.use('reports_month')
  const timePeriods: string[] = []
  if (timePeriod.includes('hour')) timePeriods.push('hour')
  if (timePeriod.includes('day')) timePeriods.push('day')
  if (timePeriod.includes('month')) timePeriods.push('month')
  const analyticResultArray: AnalyticsResult[] = []
  for (const partnerId of partnerIds) {
    const analyticResult: AnalyticsResult = {
      start,
      end,
      app: appId,
      partnerId,
      result: { hour: [], day: [], month: [], numAllTxs: 0 }
    }
    let startForDayTimePeriod
    for (timePeriod of timePeriods) {
      let database
      if (timePeriod === 'hour') database = reportsHour
      else if (timePeriod === 'day') {
        database = reportsDay
        startForDayTimePeriod = start - SIX_DAYS_IN_SECONDS
      } else {
        database = reportsMonth
      }
      const query = {
        selector: {
          usdValue: { $gte: 0 },
          timestamp: { $gte: startForDayTimePeriod ?? start, $lt: end }
        },
        use_index: 'timestamp-index',
        sort: ['timestamp'],
        limit: 1000000
      }
      try {
        const appAndPluginId = `${appId}_${partnerId}`
        const result = await database.partitionedFind(appAndPluginId, query)
        const cacheResults = asCacheQuery(result)
        analyticResult.result[timePeriod] = cacheResults.docs.map(cacheObj => {
          analyticResult.result.numAllTxs += cacheObj.numTxs
          return {
            start: cacheObj.timestamp,
            usdValue: cacheObj.usdValue,
            numTxs: cacheObj.numTxs,
            isoDate: new Date(cacheObj.timestamp).toISOString(),
            currencyCodes: cacheObj.currencyCodes,
            currencyPairs: cacheObj.currencyPairs
          }
        })
        console.time(`${partnerId} ${timePeriod} cache fetched`)
        console.timeEnd(`${partnerId} ${timePeriod} cache fetched`)
      } catch (e) {
        console.log(e)
        return `Internal server error.`
      }
    }
    analyticResult.result.numAllTxs /= timePeriods.length
    analyticResultArray.push(analyticResult)
  }
  return analyticResultArray
}
