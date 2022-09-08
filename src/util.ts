import { asArray, asNumber, asObject, asString } from 'cleaners'
import { getTimezoneOffset } from 'date-fns-tz'
import add from 'date-fns/add'
import eachQuarterOfInterval from 'date-fns/eachQuarterOfInterval'
import startOfDay from 'date-fns/startOfDay'
import startOfHour from 'date-fns/startOfHour'
import startOfMonth from 'date-fns/startOfMonth'
import sub from 'date-fns/sub'
import nano from 'nano'

import config from '../config.json'
import { getAnalytics } from './apiAnalytics'
import {
  AnalyticsResult,
  Bucket,
  Data,
  DataPlusSevenDayAve
} from './demo/components/Graphs'
import Partners from './demo/partners'

export const SIX_DAYS = 6

const CURRENCY_CONVERSION = {
  USDT20: 'USDT',
  USDTERC20: 'USDT',
  BCHABC: 'BCH',
  BCHSV: 'BSV',
  FTMMAINNET: 'FTM',
  BNBMAINNET: 'BNB',
  AVAXC: 'AVAX',
  POLYGON: 'MATIC'
}

const asDbReq = asObject({
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

const BATCH_ADVANCE = 100

const SIX_DAYS_IN_SECONDS = 6 * 24 * 60 * 60

export const standardizeNames = (field: string): string => {
  if (CURRENCY_CONVERSION[field] !== undefined) {
    return CURRENCY_CONVERSION[field]
  }
  return field
}

export const promiseTimeout = async <T>(
  msg: string,
  p: Promise<T>
): Promise<T> => {
  return new Promise((resolve, reject) => {
    datelog('STARTING', msg)
    setTimeout(() => reject(new Error(msg)), 60000 * 5)
    p.then(v => resolve(v)).catch(e => reject(e))
  })
}

export const smartIsoDateFromTimestamp = (
  timestamp: number
): { timestamp: number; isoDate } => {
  if (timestamp > 9999999999) {
    timestamp = timestamp / 1000
  }
  return {
    timestamp,
    isoDate: new Date(timestamp * 1000).toISOString()
  }
}

export const datelog = function(...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}

export const snoozeReject = async (ms: number): Promise<void> =>
  new Promise((resolve: Function, reject: Function) => setTimeout(reject, ms))

export const snooze = async (ms: number): Promise<void> =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))

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

export const addObject = (origin: any, destination: any): void => {
  Object.keys(origin).forEach(originKey => {
    if (destination[originKey] == null) {
      destination[originKey] = origin[originKey]
    } else destination[originKey] += origin[originKey]
  })
}

export const getPresetDates = function(): any {
  const DATE = new Date(Date.now())
  const HOUR_RANGE_END = add(startOfHour(DATE), { hours: 1 })
  const DAY_RANGE_END = add(startOfDay(DATE), { days: 1 })
  // const TRUE_DAY_RANGE_END = sub(DAY_RANGE_END, {
  //   minutes: DAY_RANGE_END.getTimezoneOffset()
  // })
  const MONTH_RANGE_END = add(startOfMonth(DATE), { months: 1 })
  const HOUR_RANGE_START = sub(HOUR_RANGE_END, { hours: 36 })
  const DAY_RANGE_START = sub(DAY_RANGE_END, { days: 75 })
  // const TRUE_DAY_RANGE_START = sub(DAY_RANGE_START, {
  //   minutes: DAY_RANGE_START.getTimezoneOffset()
  // })
  const MONTH_RANGE_START = sub(MONTH_RANGE_END, { months: 4 })
  const MONTH_RANGE_ARRAY = [[MONTH_RANGE_START, MONTH_RANGE_END]]
  for (let i = 0; i < 7; i++) {
    const currentEnd = new Date(MONTH_RANGE_ARRAY[0][0])
    const currentStart = sub(currentEnd, { months: 3 })
    MONTH_RANGE_ARRAY.unshift([currentStart, currentEnd])
  }
  return {
    setData1: [
      [
        HOUR_RANGE_START.toISOString(),
        new Date(HOUR_RANGE_END.getTime() - 1).toISOString()
      ]
    ],
    setData2: [
      [
        DAY_RANGE_START.toISOString(),
        new Date(DAY_RANGE_END.getTime() - 1).toISOString()
      ]
    ],
    setData3: MONTH_RANGE_ARRAY.map(array => {
      const start = sub(array[0], {
        minutes: array[0].getTimezoneOffset()
      }).toISOString()
      const end = sub(array[1], {
        minutes: array[1].getTimezoneOffset(),
        seconds: 1
      }).toISOString()

      return [start, end]
    })
  }
}

export const getCustomData = async (
  appId: string,
  pluginIds: string[],
  start: string,
  end: string,
  timePeriod: string = 'hourdaymonth'
): Promise<any> => {
  const endPoint = '/v1/analytics/'
  let trueTimePeriod = timePeriod
  if (
    new Date(end).getTime() - new Date(start).getTime() >
      1000 * 60 * 60 * 24 * 7 &&
    timePeriod === 'hourdaymonth'
  ) {
    trueTimePeriod = 'daymonth'
  }
  const query = { start, end, appId, pluginIds, timePeriod: trueTimePeriod }
  const response = await fetch(endPoint, {
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST',
    body: JSON.stringify(query)
  })
  return response.json()
}

export const getTimeRange = (start: string, end: string): string => {
  const timeRange = new Date(end).getTime() - new Date(start).getTime()
  if (timeRange < 1000 * 60 * 60 * 24 * 3) {
    return 'hour'
  } else if (timeRange < 1000 * 60 * 60 * 24 * 75) {
    return 'day'
  } else {
    return 'month'
  }
}

export const createQuarterBuckets = (analytics: AnalyticsResult): Bucket[] => {
  const localTimezoneDbName = Intl.DateTimeFormat().resolvedOptions().timeZone // Use 'Intl' object to get local timezone name
  // The 'getTimezoneOffset' helper requires two parameters to account for DST, and it returns offset in milliseconds
  const timezoneOffsetStart = getTimezoneOffset(
    localTimezoneDbName,
    new Date(analytics.start * 1000)
  )
  const timezoneOffsetEnd = getTimezoneOffset(
    localTimezoneDbName,
    new Date(analytics.end * 1000)
  )

  const quarterIntervals = eachQuarterOfInterval({
    start: new Date(analytics.start * 1000 - timezoneOffsetStart),
    end: new Date(analytics.end * 1000 - timezoneOffsetEnd)
  })
  const buckets = quarterIntervals.map(date => {
    const timezoneOffset = getTimezoneOffset(localTimezoneDbName, date)
    const realTimestamp = date.getTime() + timezoneOffset
    return {
      start: realTimestamp / 1000,
      usdValue: 0,
      numTxs: 0,
      isoDate: new Date(realTimestamp).toISOString(),
      currencyCodes: {},
      currencyPairs: {}
    }
  })
  let i = 0
  for (const month of analytics.result.month) {
    const { usdValue, numTxs, currencyPairs, currencyCodes } = month
    if (i + 1 < buckets.length && month.start >= buckets[i + 1].start) {
      i++
    }
    buckets[i].usdValue += usdValue
    buckets[i].numTxs += numTxs
    addObject(currencyPairs, buckets[i].currencyPairs)
    addObject(currencyCodes, buckets[i].currencyCodes)
  }
  return buckets
}

export const getAnalytic = async (
  start: number,
  end: number,
  appId: string,
  pluginIds: string[],
  timePeriod: string,
  transactionDatabase: any
): Promise<any> => {
  const query = {
    selector: {
      usdValue: { $gte: 0 },
      status: { $eq: 'complete' },
      timestamp: { $gte: start, $lt: end }
    },
    fields: [
      'orderId',
      'depositCurrency',
      'payoutCurrency',
      'timestamp',
      'usdValue'
    ],
    use_index: 'timestamp-index',
    sort: ['timestamp'],
    limit: 1000000
  }
  const results: any[] = []
  const promises: Array<Promise<any>> = []
  try {
    for (const pluginId of pluginIds) {
      const appAndPluginId = `${appId}_${pluginId}`
      const result = transactionDatabase
        .partitionedFind(appAndPluginId, query)
        .then(data => {
          const analytic = getAnalytics(
            asDbReq(data).docs,
            start,
            end,
            appId,
            pluginId,
            timePeriod
          )
          if (analytic.result.numAllTxs > 0) results.push(analytic)
        })
      promises.push(result)
    }
    console.time(`${appId} promiseAll`)
    await Promise.all(promises)
    console.timeEnd(`${appId} promiseAll`)
    return results.sort((a, b) => {
      if (a.pluginId < b.pluginId) {
        return -1
      }
      if (a.pluginId > b.pluginId) {
        return 1
      }
      return 0
    })
  } catch (e) {
    console.log(e)
    return `Internal server error.`
  }
}

export const cacheAnalytic = async (
  start: number,
  end: number,
  appId: string,
  pluginIds: string[],
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
  for (const pluginId of pluginIds) {
    const analyticResult: AnalyticsResult = {
      start,
      end,
      app: appId,
      pluginId,
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
        const appAndPluginId = `${appId}_${pluginId}`
        const result = await database.partitionedFind(appAndPluginId, query)
        analyticResult.result[timePeriod] = result.docs.map(cacheObj => {
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
        console.time(`${pluginId} ${timePeriod} cache fetched`)
        console.timeEnd(`${pluginId} ${timePeriod} cache fetched`)
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

interface AppIdResponse {
  appId: string
  redirect: boolean
}

interface PluginIdsResponse {
  pluginIds: string[]
}

export const getAppId = async (apiKey: string): Promise<AppIdResponse> => {
  const url = `/v1/getAppId?apiKey=${apiKey}`
  const response = await fetch(url)
  const appId = await response.json()
  let redirect = false
  if (appId == null || appId === '') {
    redirect = true
  }
  return { appId, redirect }
}

export const getPluginIds = async (
  appId: string
): Promise<PluginIdsResponse> => {
  const partners = Object.keys(Partners)
  const url = `/v1/getPluginIds?appId=${appId}`
  const response = await fetch(url)
  const json = await response.json()
  const existingPartners = json.filter(pluginId => partners.includes(pluginId))
  return { pluginIds: existingPartners }
}
interface GraphTotals {
  totalTxs: number
  totalUsd: number
  partnerId?: string
}

export const calculateGraphTotals = (
  analyticsResult: AnalyticsResult
): GraphTotals => {
  if (analyticsResult.result.month.length > 0) {
    return addGraphTotals(analyticsResult, 'month')
  }
  if (analyticsResult.result.day.length > 0) {
    return addGraphTotals(analyticsResult, 'day')
  }
  if (analyticsResult.result.hour.length > 0) {
    return addGraphTotals(analyticsResult, 'hour')
  }
  return { totalTxs: 0, totalUsd: 0 }
}

const addGraphTotals = (
  analyticsResult: AnalyticsResult,
  timePeriod: string
): GraphTotals => {
  const totalTxs = analyticsResult.result[timePeriod].reduce(
    (a: number, b: Bucket) => a + b.numTxs,
    0
  )
  const totalUsd = analyticsResult.result[timePeriod].reduce(
    (a: number, b: Bucket) => a + b.usdValue,
    0
  )
  return { totalTxs, totalUsd }
}

export const movingAveDataSort = (
  data: Data[]
): Array<{ date: string; allUsd: number }> => {
  const aveArray: Array<{ date: string; allUsd: number }> = []
  if (!Array.isArray(data)) return aveArray
  for (let i = 0; i < data.length; i++) {
    let sevenDaySum: number = 0
    for (let j = i; j >= i - SIX_DAYS; j--) {
      if (j < 0) {
        continue
      }
      const currentData: Data = data[j]
      sevenDaySum += currentData.allUsd
    }
    if (typeof sevenDaySum !== 'number' || isNaN(sevenDaySum)) return []
    const sevenDayAve: number = Math.round(sevenDaySum / 7)
    aveArray.push({ date: data[i].date, allUsd: sevenDayAve })
  }
  return aveArray
}

export const sevenDayDataMerge = (data: Data[]): DataPlusSevenDayAve[] => {
  const sevenDayDataArr: DataPlusSevenDayAve[] = []
  const sevenDayData = movingAveDataSort(data)
  if (!Array.isArray(data) || sevenDayData.length === 0) {
    return sevenDayDataArr
  }
  data.forEach(object => {
    const sevenDayIndex = sevenDayData.findIndex(
      obj => obj.date === object.date
    )
    const sevenDayAve = sevenDayData[sevenDayIndex].allUsd
    sevenDayDataArr.push({
      ...object,
      sevenDayAve: sevenDayAve
    })
  })
  return sevenDayDataArr.slice(SIX_DAYS)
}
