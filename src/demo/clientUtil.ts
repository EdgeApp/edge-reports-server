import { asArray, asString } from 'cleaners'
import add from 'date-fns/add'
import eachQuarterOfInterval from 'date-fns/eachQuarterOfInterval'
import startOfDay from 'date-fns/startOfDay'
import startOfHour from 'date-fns/startOfHour'
import startOfMonth from 'date-fns/startOfMonth'
import sub from 'date-fns/sub'
import { getTimezoneOffset } from 'date-fns-tz'
import fetch from 'node-fetch'

import { AnalyticsResult, asAnalyticsResult, Bucket } from '../types'
import { clientConfig } from './clientConfig'
import { Data, DataPlusSevenDayAve } from './components/Graphs'
import Partners from './partners'

export const SIX_DAYS = 6

export const apiHost = clientConfig.apiHost ?? ''

const asGetPartnerIds = asArray(asString)

export const addObject = (origin: any, destination: any): void => {
  Object.keys(origin).forEach(originKey => {
    if (destination[originKey] == null) {
      destination[originKey] = origin[originKey]
    } else destination[originKey] += origin[originKey]
  })
}

export type SetDataKeys = 'setData1' | 'setData2' | 'setData3'

export type PresetDates = Record<SetDataKeys, string[][]>

export const getPresetDates = function(): PresetDates {
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
): Promise<AnalyticsResult[]> => {
  const endPoint = `${apiHost}/v1/analytics/`
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
  const json = await response.json()
  const out = asArray(asAnalyticsResult)(json)
  return out
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

interface PartnerIdsResponse {
  partnerIds: string[]
}

export const getAppId = async (apiKey: string): Promise<AppIdResponse> => {
  const url = `${apiHost}/v1/getAppId?apiKey=${apiKey}`
  const response = await fetch(url)
  const appId = await response.json()
  let redirect = false
  if (appId == null || appId === '') {
    redirect = true
  }
  return { appId, redirect }
}

export const getPartnerIds = async (
  appId: string
): Promise<PartnerIdsResponse> => {
  const partners = Object.keys(Partners)
  const url = `${apiHost}/v1/getPluginIds?appId=${appId}`
  const response = await fetch(url)
  const json = await response.json()
  const ids = asGetPartnerIds(json)
  const partnerIds = ids.filter(pluginId => partners.includes(pluginId))
  return { partnerIds }
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
