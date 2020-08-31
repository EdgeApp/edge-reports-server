import { asArray, asObject } from 'cleaners'
import nano from 'nano'
import fetch from 'node-fetch'

import config from '../config.json'
import { asDbTx, DbTx } from './types'
const datelog = function (...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}
const nanoDb = nano(config.couchDbFullpath)
const QUERY_FREQ_MS = 1000
const QUERY_LIMIT = 50
const snooze: Function = async (ms: number) =>
  new Promise((resolve: Function) => setTimeout(resolve, ms))

const asDbQueryResult = asObject({ docs: asArray(asDbTx) })

export async function ratesEngine(): Promise<void> {
  datelog('Starting ratesEngine query')
  const dbTransactions: nano.DocumentScope<DbTx> = nanoDb.db.use(
    'reports_transactions'
  )
  let bookmark
  while (true) {
    const query = {
      selector: {
        $or: [
          { usdValue: { $exists: false } },
          { usdValue: { $eq: null } },
          { payoutAmount: { $eq: 0 } }
        ]
      },
      bookmark,
      limit: QUERY_LIMIT
    }
    const result = await dbTransactions.find(query)
    if (typeof result.bookmark === 'string' && result.docs.length > 10) {
      bookmark = result.bookmark
    } else {
      bookmark = undefined
    }
    try {
      asDbQueryResult(result)
    } catch {
      continue
    }
    datelog(
      'Finished query for empty usdValue fields, adding usdValues to each field'
    )
    datelog(`${result.docs.length} docs to update`)
    const promiseArray: Array<Promise<void>> = []
    for (const doc of result.docs) {
      const p = updateTxValues(doc).catch(e => {
        datelog('updateTx failed', e)
      })
      promiseArray.push(p)
    }
    await Promise.all(promiseArray)
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

export async function updateTxValues(transaction: DbTx): Promise<void> {
  let success = false
  const date: string = transaction.isoDate
  if (transaction.payoutAmount === 0) {
    const exchangeRate = await getExchangeRate(
      transaction.depositCurrency,
      transaction.payoutCurrency,
      date
    )
    if (exchangeRate > 0) {
      transaction.payoutAmount = transaction.depositAmount * exchangeRate
      success = true
    }
  }
  if (transaction.payoutAmount === 0) {
    const exchangeRate = await getExchangeRate(
      transaction.payoutCurrency,
      transaction.depositCurrency,
      date
    )
    if (exchangeRate > 0) {
      transaction.payoutAmount = transaction.depositAmount * (1 / exchangeRate)
      success = true
    }
  }
  if (
    transaction.payoutAmount === 0 &&
    transaction.usdValue !== undefined &&
    transaction.usdValue > 0
  ) {
    const exchangeRate = await getExchangeRate(
      'USD',
      transaction.payoutCurrency,
      date
    )
    if (exchangeRate > 0) {
      transaction.payoutAmount = transaction.usdValue * exchangeRate
      success = true
    }
    if (transaction.payoutAmount === 0) {
      const exchangeRate = await getExchangeRate(
        transaction.payoutCurrency,
        'USD',
        date
      )
      if (exchangeRate > 0) {
        transaction.payoutAmount = transaction.usdValue * (1 / exchangeRate)
        success = true
      }
    }
  }
  if (transaction.usdValue == null || transaction.usdValue === 0) {
    const exchangeRate = await getExchangeRate(
      transaction.depositCurrency,
      'USD',
      date
    )
    if (exchangeRate > 0) {
      transaction.usdValue = transaction.depositAmount * exchangeRate
      success = true
    } else if (transaction.payoutAmount !== 0) {
      const exchangeRate = await getExchangeRate(
        transaction.payoutCurrency,
        'USD',
        date
      )
      if (exchangeRate > 0) {
        transaction.usdValue = transaction.payoutAmount * exchangeRate
        success = true
      }
    }
  }
  if (success) {
    datelog(`SUCCESS id:${transaction._id} updated`)
  } else {
    datelog(`FAIL    id:${transaction._id} not updated`)
  }
}

async function getExchangeRate(
  currencyA: string,
  currencyB: string,
  date: string
): Promise<number> {
  const url = `https://rates1.edge.app/v1/exchangeRate?currency_pair=${currencyA}_${currencyB}&date=${date}`
  try {
    const result = await fetch(url, { method: 'GET' })
    const jsonObj = await result.json()
    return parseFloat(jsonObj.exchangeRate)
  } catch (e) {
    datelog(
      `Could not not get exchange rate for ${currencyA} and ${currencyB} at ${date}.`,
      e
    )
    return 0
  }
}
