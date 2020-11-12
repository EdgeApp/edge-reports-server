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
  const MONTH_RANGE_END = add(startOfMonth(DATE), { months: 1 })
  const HOUR_RANGE_START = sub(HOUR_RANGE_END, { hours: 36 })
  const DAY_RANGE_START = sub(DAY_RANGE_END, { days: 75 })
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
    setData3: MONTH_RANGE_ARRAY.map(array => [
      array[0].toISOString(),
      new Date(array[1].getTime() - 1).toISOString()
    ])
  }
}

export { datelog, snooze, snoozeReject, pagination, getPresetDates }
