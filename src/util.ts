import add from 'date-fns/add'
import eachQuarterOfInterval from 'date-fns/eachQuarterOfInterval'
import startOfDay from 'date-fns/startOfDay'
import startOfHour from 'date-fns/startOfHour'
import startOfMonth from 'date-fns/startOfMonth'
import sub from 'date-fns/sub'

import { AnalyticsResult, Bucket } from './demo/components/Graphs'

const BATCH_ADVANCE = 1000

export const datelog = function(...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}

export const snoozeReject = async (ms: number): Promise<void> =>
  new Promise((resolve: Function, reject: Function) => setTimeout(reject, ms))

export const snooze = async (ms: number): Promise<void> =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))

export const pagination = async (
  txArray: any[],
  partition: any
): Promise<void> => {
  let numErrors = 0
  for (let offset = 0; offset < txArray.length; offset += BATCH_ADVANCE) {
    let advance = BATCH_ADVANCE
    if (offset + BATCH_ADVANCE > txArray.length) {
      advance = txArray.length - offset
    }
    const docs = await partition.bulk({
      docs: txArray.slice(offset, offset + advance)
    })
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
  const TRUE_DAY_RANGE_END = sub(DAY_RANGE_END, {
    minutes: DAY_RANGE_END.getTimezoneOffset()
  })
  const MONTH_RANGE_END = add(startOfMonth(DATE), { months: 1 })
  const HOUR_RANGE_START = sub(HOUR_RANGE_END, { hours: 36 })
  const DAY_RANGE_START = sub(DAY_RANGE_END, { days: 75 })
  const TRUE_DAY_RANGE_START = sub(DAY_RANGE_START, {
    minutes: DAY_RANGE_START.getTimezoneOffset()
  })
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
        TRUE_DAY_RANGE_START.toISOString(),
        new Date(TRUE_DAY_RANGE_END.getTime() - 1).toISOString()
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
  const query = { start, end, appId, pluginIds, timePeriod }
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
  const timezoneOffsetStart =
    new Date(analytics.start).getTimezoneOffset() * 60 * 1000
  const timezoneOffsetEnd =
    new Date(analytics.end).getTimezoneOffset() * 60 * 1000

  const quarterIntervals = eachQuarterOfInterval({
    start: new Date(analytics.start * 1000 + timezoneOffsetStart),
    end: new Date(analytics.end * 1000 + timezoneOffsetEnd)
  })
  const buckets = quarterIntervals.map(date => {
    const timezoneOffset = date.getTimezoneOffset() * 60 * 1000
    const realTimestamp = date.getTime() - timezoneOffset
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
      continue
    }
    buckets[i].usdValue += usdValue
    buckets[i].numTxs += numTxs
    addObject(currencyPairs, buckets[i].currencyPairs)
    addObject(currencyCodes, buckets[i].currencyCodes)
  }
  return buckets
}
