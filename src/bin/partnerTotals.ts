import { asArray, asObject, asUnknown } from 'cleaners'
import { stringify } from 'csv-stringify/sync'
import fs from 'fs'
import nano from 'nano'
import fetch from 'node-fetch'

// import fetch from 'node-fetch'
import config from '../../config.json'
import { asDbTx, DbTx } from '../types'
import { datelog, standardizeNames } from '../util'

const nanoDb = nano(config.couchDbFullpath)
const QUERY_LIMIT = 100
// const snooze: Function = async (ms: number) =>
//   new Promise((resolve: Function) => setTimeout(resolve, ms))

const START_DATE = '2022-08-03T00:00:00.000Z'
const END_DATE = '2022-09-20T00:00:00.000Z'

const asDbQueryResult = asObject({ docs: asArray(asUnknown) })

interface Totals {
  sourceAsset: { [ccode: string]: number }
  destAsset: { [ccode: string]: number }
}

interface CsvJson {
  isoDate: string
  orderId: string
  depositCurrency: string
  depositAmount?: number
  payoutCurrency: string
  payoutAmount?: number
}
const csvJson: CsvJson[] = []
const ccodes: { [ccode: string]: boolean } = {}

export async function partnerTotals(): Promise<void> {
  datelog('Starting partnerTotals query')
  const dbTransactions: nano.DocumentScope<DbTx> = nanoDb.db.use(
    'reports_transactions'
  )
  let bookmark
  const totals: Totals = { sourceAsset: {}, destAsset: {} }
  const { sourceAsset, destAsset } = totals

  while (true) {
    datelog('Querying partner transactions')

    const query = {
      selector: {
        $and: [
          {
            isoDate: {
              $gt: START_DATE
            }
          },
          {
            isoDate: {
              $lt: END_DATE
            }
          }
        ]
      },
      bookmark,
      limit: QUERY_LIMIT
    }
    const result = await dbTransactions.partitionedFind('edge_changenow', query)
    if (
      typeof result.bookmark === 'string' &&
      result.docs.length === QUERY_LIMIT
    ) {
      bookmark = result.bookmark
    } else {
      bookmark = undefined
    }
    try {
      asDbQueryResult(result)
    } catch (e) {
      datelog('Invalid Rates Query Result: ', e)
      continue
    }

    datelog(`${result.docs.length} docs found`)

    // Create sum of transactions in input and output currencies
    for (const doc of result.docs) {
      let tx: DbTx
      try {
        tx = asDbTx(doc)
      } catch {
        datelog('Bad Transaction', doc)
        continue
      }
      const {
        orderId,
        isoDate,
        depositCurrency,
        payoutCurrency,
        depositAmount,
        payoutAmount
      } = tx
      if (sourceAsset[depositCurrency] == null) {
        sourceAsset[depositCurrency] = 0
      }
      if (destAsset[payoutCurrency] == null) {
        destAsset[payoutCurrency] = 0
      }
      sourceAsset[depositCurrency] += depositAmount
      destAsset[payoutCurrency] += payoutAmount

      csvJson.push({
        isoDate,
        orderId,
        depositCurrency,
        depositAmount,
        payoutCurrency,
        payoutAmount,
        [payoutCurrency]: payoutAmount
      })
      ccodes[payoutCurrency] = true

      datelog(
        `src: ${depositCurrency} ${sourceAsset[depositCurrency]}, dst: ${payoutCurrency} ${destAsset[payoutCurrency]}`
      )
    }
    if (result.docs.length < QUERY_LIMIT) break
  }

  // Put blank line to separate totals
  csvJson.push({
    isoDate: '',
    orderId: '',
    depositCurrency: '',
    payoutCurrency: ''
  })

  console.log(JSON.stringify(totals, null, 2))
  console.log('*********************************')

  // Make sure all rows have all the currency code columns
  for (const row of csvJson) {
    Object.keys(ccodes).forEach(cc => {
      row[cc] = row[cc] ?? ''
    })
  }

  // Add totals at the bottom
  const ttlRow = {
    isoDate: '',
    orderId: '',
    depositCurrency: '',
    payoutCurrency: ''
  }
  Object.keys(ccodes).forEach(cc => {
    ttlRow[cc] = destAsset[cc]
  })
  csvJson.push(ttlRow)

  // Add row of totals in BTC denom
  const ttlRowBtc = {
    isoDate: '',
    orderId: '',
    depositCurrency: '',
    payoutCurrency: ''
  }
  for (const cc of Object.keys(ccodes)) {
    const btcRate = await getExchangeRate(cc, 'BTC', END_DATE)
    ttlRowBtc[cc] = destAsset[cc] * btcRate
  }
  csvJson.push(ttlRowBtc)

  const csv = stringify(csvJson, {
    header: true,
    quoted_string: true,
    record_delimiter: '\n'
  })
  fs.writeFileSync('./partnerTotals.csv', csv, { encoding: 'utf8' })
}

const dateRoundDownHour = (dateString: string): string => {
  const date = new Date(dateString)
  date.setMinutes(0)
  date.setSeconds(0)
  date.setMilliseconds(0)
  return new Date(date).toISOString()
}

async function getExchangeRate(
  ca: string,
  cb: string,
  date: string
): Promise<number> {
  const hourDate = dateRoundDownHour(date)
  const currencyA = standardizeNames(ca)
  const currencyB = standardizeNames(cb)
  const url = `https://rates2.edge.app/v1/exchangeRate?currency_pair=${currencyA}_${currencyB}&date=${hourDate}`
  try {
    const result = await fetch(url, { method: 'GET' })
    const jsonObj = await result.json()
    datelog(
      `Rate for ${currencyA} -> ${currencyB} ${date}: ${jsonObj.exchangeRate}`
    )
    return parseFloat(jsonObj.exchangeRate)
  } catch (e) {
    datelog(
      `Could not not get exchange rate for ${currencyA} and ${currencyB} at ${date}.`,
      e
    )
    return 0
  }
}

partnerTotals().catch(e => console.error(e.message))
