import { asArray, asObject } from 'cleaners'
import nano from 'nano'
import fetch from 'node-fetch'

import config from '../config.json'
import { asDbTx, DbTx } from './types'
const datelog = function(...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}
const nanoDb = nano(config.couchDbFullpath)
const QUERY_FREQ_MS = 31 * 60 * 1000
const QUERY_LIMIT = 5000
const snooze: Function = async (ms: number) =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))

const asDbQueryResult = asObject({ docs: asArray(asDbTx) })

export async function ratesEngine(): Promise<void> {
  datelog('Starting ratesEngine query')
  const dbTransactions: nano.DocumentScope<DbTx> = nanoDb.db.use(
    'db_transactions'
  )
  while (true) {
    const query = {
      selector: {
        usdValue: {
          $exists: false
        }
      },
      fields: [
        '_id',
        '_rev',
        'inputTXID',
        'inputAddress',
        'inputAmount',
        'inputCurrency',
        'outputAddress',
        'outputAmount',
        'outputCurrency',
        'status',
        'timestamp',
        'isoDate',
        'usdValue'
      ],
      limit: QUERY_LIMIT
    }
    const result = await dbTransactions.find(query)
    asDbQueryResult(result)
    datelog(
      'Finished query for empty usdValue fields, adding usdValues to each field'
    )
    for (const doc of result.docs) {
      await updateTxUsdValue(doc).catch(e => {
        datelog('updateTx failed', e)
      })
    }
    datelog(
      'Finished updating all usdValues, bulk writing back to the database'
    )
    try {
      await dbTransactions.bulk({ docs: result.docs })
    } catch (e) {
      datelog('Error doing bulk usdValue insert', e)
      throw e
    }
    datelog(`Snoozing for ${QUERY_FREQ_MS} milliseconds`)
    await snooze(QUERY_FREQ_MS)
  }
}

export async function updateTxUsdValue(transaction: DbTx): Promise<void> {
  const date: string = transaction.isoDate
  let url = ''
  let jsonObj: { exchangeRate: string } = { exchangeRate: '' }
  try {
    try {
      url =
        'https://info1.edgesecure.co:8444/v1/exchangeRate?currency_pair=' +
        transaction.inputCurrency +
        '_USD&date=' +
        date
      const result = await fetch(url, { method: 'GET' })
      jsonObj = await result.json()
    } catch {
      url =
        'https://info1.edgesecure.co:8444/v1/exchangeRate?currency_pair=' +
        transaction.outputCurrency +
        '_USD&date=' +
        date
      const result = await fetch(url, { method: 'GET' })
      jsonObj = await result.json()
    }
    const exchangeRate = parseFloat(jsonObj.exchangeRate)
    transaction.usdValue = transaction.inputAmount * exchangeRate
  } catch (e) {
    datelog('Could not not get exchange rate', e)
    transaction.usdValue = undefined
  }
}
