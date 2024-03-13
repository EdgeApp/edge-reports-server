import { AnalyticsResult } from './types'

interface UtcValues {
  y: number
  m: number
  d: number
  h: number
}

interface DbTx {
  orderId: string
  depositCurrency: string
  payoutCurrency: string
  timestamp: number
  usdValue: number
}

interface Bucket {
  start: number
  usdValue: number
  numTxs: number
  isoDate: string
  currencyCodes: { [currencyCode: string]: number }
  currencyPairs: { [currencyPair: string]: number }
}

export const getAnalytics = (
  txs: DbTx[],
  start: number,
  end: number,
  appId: string,
  partnerId: string,
  timePeriod: string
): AnalyticsResult => {
  // the creation of buckets
  const hasMonthBucket = timePeriod.includes('month')
  const hasDayBucket = timePeriod.includes('day')
  const hasHourBucket = timePeriod.includes('hour')
  const monthArray: Bucket[] = []
  const dayArray: Bucket[] = []
  const hourArray: Bucket[] = []
  // monthly buckets creation
  if (hasMonthBucket) {
    let { y, m } = utcVariables(start)
    let monthStart = new Date(Date.UTC(y, m, 1, 0))
    do {
      monthArray.push({
        start: monthStart.getTime() / 1000,
        isoDate: monthStart.toISOString(),
        usdValue: 0,
        numTxs: 0,
        currencyCodes: {},
        currencyPairs: {}
      })
      m++
      monthStart = new Date(Date.UTC(y, m, 1, 0))
    } while (monthStart.getTime() <= end * 1000)
  }
  // daily buckets Creation
  if (hasDayBucket) {
    let { y, m, d } = utcVariables(start)
    let dayStart = new Date(Date.UTC(y, m, d, 0))
    do {
      dayArray.push({
        start: dayStart.getTime() / 1000,
        isoDate: dayStart.toISOString(),
        usdValue: 0,
        numTxs: 0,
        currencyCodes: {},
        currencyPairs: {}
      })
      d++
      dayStart = new Date(Date.UTC(y, m, d, 0))
    } while (dayStart.getTime() <= end * 1000)
  }
  // hourly buckets creation
  if (hasHourBucket) {
    let { y, m, d, h } = utcVariables(start)
    let hourStart = new Date(Date.UTC(y, m, d, h))
    do {
      hourArray.push({
        start: hourStart.getTime() / 1000,
        isoDate: hourStart.toISOString(),
        usdValue: 0,
        numTxs: 0,
        currencyCodes: {},
        currencyPairs: {}
      })
      h++
      hourStart = new Date(Date.UTC(y, m, d, h))
    } while (hourStart.getTime() <= end * 1000)
  }

  // put transactions into buckets
  let monthPointer = 0
  let dayPointer = 0
  let hourPointer = 0
  for (const tx of txs) {
    // month
    if (hasMonthBucket) {
      // advances pointer to bucket that matches current txs timestamp
      monthPointer = bucketScroller(monthArray, monthPointer, tx.timestamp)
      // adds usdvalue, currencycode, and currencypair to that bucket
      bucketAdder(monthArray[monthPointer], tx)
    }
    // day
    if (hasDayBucket) {
      dayPointer = bucketScroller(dayArray, dayPointer, tx.timestamp)
      bucketAdder(dayArray[dayPointer], tx)
    }
    // hour
    if (hasHourBucket) {
      hourPointer = bucketScroller(hourArray, hourPointer, tx.timestamp)
      bucketAdder(hourArray[hourPointer], tx)
    }
  }

  const analyticsResult: AnalyticsResult = {
    result: {
      month: monthArray,
      day: dayArray,
      hour: hourArray,
      numAllTxs: txs.length
    },
    app: appId,
    partnerId,
    start: start,
    end: end
  }
  return analyticsResult
}

const utcVariables = (unixTimestamp: number): UtcValues => {
  const beginningDate = new Date(unixTimestamp * 1000)
  const y = beginningDate.getUTCFullYear()
  const m = beginningDate.getUTCMonth()
  const d = beginningDate.getUTCDate()
  const h = beginningDate.getUTCHours()
  return { y, m, d, h }
}

const bucketScroller = (
  bucketArray: Bucket[],
  bucketPointer: number,
  txTimestamp: number
): number => {
  if (bucketPointer + 1 !== bucketArray.length) {
    while (txTimestamp >= bucketArray[bucketPointer + 1].start) {
      bucketPointer++
      if (bucketPointer + 1 === bucketArray.length) {
        break
      }
    }
  }
  return bucketPointer
}

const bucketAdder = (bucket: Bucket, tx: DbTx): void => {
  // numTxs
  bucket.numTxs++
  // usdValue
  bucket.usdValue += tx.usdValue != null ? tx.usdValue : 0
  // currencyCode
  if (bucket.currencyCodes[tx.depositCurrency] == null) {
    bucket.currencyCodes[tx.depositCurrency] = 0
  }
  bucket.currencyCodes[tx.depositCurrency] +=
    tx.usdValue != null ? tx.usdValue / 2 : 0
  if (bucket.currencyCodes[tx.payoutCurrency] == null) {
    bucket.currencyCodes[tx.payoutCurrency] = 0
  }
  bucket.currencyCodes[tx.payoutCurrency] +=
    tx.usdValue != null ? tx.usdValue / 2 : 0
  // currencyPair
  const currencyPair = `${tx.depositCurrency}-${tx.payoutCurrency}`
  if (bucket.currencyPairs[currencyPair] == null) {
    bucket.currencyPairs[currencyPair] = 0
  }
  bucket.currencyPairs[currencyPair] += tx.usdValue != null ? tx.usdValue : 0
}
