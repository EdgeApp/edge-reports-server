import { getTimezoneOffset } from 'date-fns-tz'
import add from 'date-fns/add'
import eachQuarterOfInterval from 'date-fns/eachQuarterOfInterval'
import startOfDay from 'date-fns/startOfDay'
import startOfHour from 'date-fns/startOfHour'
import startOfMonth from 'date-fns/startOfMonth'
import sub from 'date-fns/sub'
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch'

import config from '../config.json'
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
  USDTPOLYGON: 'USDT',
  USDCPOLYGON: 'USDC',
  ZADDR: 'ZEC',
  BCHABC: 'BCH',
  BCHSV: 'BSV',
  FTMMAINNET: 'FTM',
  BNBMAINNET: 'BNB',
  AVAXC: 'AVAX',
  POLYGON: 'MATIC'
}

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
  const timeoutMins = config.timeoutOverrideMins ?? 5
  return new Promise((resolve, reject) => {
    datelog('STARTING', msg)
    setTimeout(() => reject(new Error(`Timeout: ${msg}`)), 60000 * timeoutMins)
    p.then(v => resolve(v)).catch(e => reject(e))
  })
}

export const smartIsoDateFromTimestamp = (
  timestamp: number | string
): { timestamp: number; isoDate } => {
  if (typeof timestamp === 'string') {
    timestamp = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z'
    const date = new Date(timestamp)
    return {
      timestamp: date.getTime() / 1000,
      isoDate: date.toISOString()
    }
  } else {
    if (timestamp > 9999999999) {
      timestamp = timestamp / 1000
    }
    return {
      timestamp,
      isoDate: new Date(timestamp * 1000).toISOString()
    }
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

export const retryFetch = async (
  request: RequestInfo,
  init?: RequestInit,
  maxRetries: number = 5
): Promise<Response> => {
  let retries = 0
  let err: any

  while (retries++ < maxRetries) {
    try {
      const response = await fetch(request, init)
      return response
    } catch (e) {
      err = e
      if (err.code.includes('ETIMEDOUT') === false) {
        throw err
      }
      await snooze(5000 * retries)
    }
  }
  throw err
}
