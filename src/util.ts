import add from 'date-fns/add'
import startOfDay from 'date-fns/startOfDay'
import startOfHour from 'date-fns/startOfHour'
import startOfMonth from 'date-fns/startOfMonth'
import sub from 'date-fns/sub'

const BATCH_ADVANCE = 1000

const datelog = function(...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}

const snoozeReject = async (ms: number): Promise<void> =>
  new Promise((resolve: Function, reject: Function) => setTimeout(reject, ms))

const snooze = async (ms: number): Promise<void> =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))

const pagination = async (txArray: any[], partition: any): Promise<void> => {
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

const getPresetDates = function(): any {
  const DATE = new Date(Date.now())
  const HOUR_RANGE_END = startOfHour(DATE)
  const DAY_RANGE_END = startOfDay(DATE)
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

const getCustomData = async (
  appId: string,
  pluginIds: string[],
  start: string,
  end: string
): Promise<any> => {
  const urls: string[] = []
  for (const pluginId of pluginIds) {
    const url = `/v1/analytics/?start=${start}&end=${end}&appId=${appId}&pluginId=${pluginId}&timePeriod=monthdayhour`
    urls.push(url)
  }
  const promises = urls.map(async url => fetch(url).then(async y => y.json()))
  const newData = await Promise.all(promises)
  // discard all entries with 0 usdValue on every bucket
  const trimmedData = newData.filter(data => {
    if (data.result.numAllTxs > 0) {
      return data
    }
  })
  const timeRange = new Date(end).getTime() - new Date(start).getTime()
  let timePeriod
  if (timeRange < 1000 * 60 * 60 * 24 * 3) {
    timePeriod = 'hour'
  } else if (timeRange < 1000 * 60 * 60 * 24 * 75) {
    timePeriod = 'day'
  } else {
    timePeriod = 'month'
  }
  return { data: trimmedData, timePeriod }
}

export {
  datelog,
  snooze,
  snoozeReject,
  pagination,
  getPresetDates,
  getCustomData
}
