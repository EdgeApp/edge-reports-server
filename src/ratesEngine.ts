import { asArray, asObject, asUnknown } from 'cleaners'
import nano, { MangoQuery } from 'nano'
import fetch from 'node-fetch'

import { config } from './config'
import {
  asDbCurrencyCodeMappings,
  asDbTx,
  CurrencyCodeMappings,
  DbTx
} from './types'
import { datelog, safeParseFloat, standardizeNames } from './util'

const nanoDb = nano(config.couchDbFullpath)
const QUERY_FREQ_MS = 3000
const QUERY_LIMIT = 10
const snooze: Function = async (ms: number) =>
  await new Promise((resolve: Function) => setTimeout(resolve, ms))

const asDbQueryResult = asObject({ docs: asArray(asUnknown) })

export async function ratesEngine(): Promise<void> {
  datelog('Starting ratesEngine query')
  const dbTransactions: nano.DocumentScope<DbTx> = nanoDb.db.use(
    'reports_transactions'
  )
  const dbSettings: nano.DocumentScope<unknown> = nanoDb.db.use(
    'reports_settings'
  )
  const queries: MangoQuery[] = [
    {
      selector: {
        $and: [{ status: { $eq: 'complete' } }, { usdValue: { $lt: 0 } }]
      },
      limit: QUERY_LIMIT
    },
    {
      selector: {
        $and: [
          { status: { $eq: 'complete' } },
          { payoutAmount: { $eq: 0 } },
          { depositAmount: { $gt: 0 } }
        ]
      },
      limit: QUERY_LIMIT
    }
  ]
  let bookmark
  let count = 1
  while (true) {
    count++
    datelog('Querying missing rates')
    const result2 = await dbSettings.get('currencyCodeMappings')
    const { mappings } = asDbCurrencyCodeMappings(result2)

    const query = queries[count % 2]
    query.bookmark = bookmark

    const result = await dbTransactions.find(query)
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
    datelog(
      'Finished query for empty usdValue fields, adding usdValues to each field'
    )
    datelog(`${result.docs.length} docs to update`)
    const promiseArray: Array<Promise<void>> = []
    for (const doc of result.docs) {
      try {
        asDbTx(doc)
      } catch {
        datelog('Bad Transaction', doc)
        continue
      }
      const p = updateTxValues(doc, mappings).catch(e => {
        datelog('updateTx failed', e)
      })
      promiseArray.push(p)
    }
    await Promise.all(promiseArray)
    datelog(
      'Finished updating all usdValues, bulk writing back to the database'
    )
    const successfulDocs = result.docs.filter(doc => doc._id !== undefined)
    try {
      await dbTransactions.bulk({ docs: successfulDocs })
    } catch (e) {
      datelog('Error doing bulk usdValue insert', e)
    }
    if (bookmark == null) {
      datelog(`Snoozing for ${QUERY_FREQ_MS} milliseconds`)
      await snooze(QUERY_FREQ_MS)
    } else {
      datelog(`Fetching bookmark ${bookmark}`)
    }
  }
}

export async function updateTxValues(
  transaction: DbTx,
  mappings: CurrencyCodeMappings
): Promise<void> {
  let success = false
  const date: string = transaction.isoDate
  if (mappings[transaction.depositCurrency] != null) {
    transaction.depositCurrency = mappings[transaction.depositCurrency]
  }
  if (mappings[transaction.payoutCurrency] != null) {
    transaction.payoutCurrency = mappings[transaction.payoutCurrency]
  }

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
  if (transaction.usdValue == null || transaction.usdValue <= 0) {
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
    datelog(
      `FAIL    id:${transaction._id} not updated ${transaction.isoDate} ${transaction.depositCurrency} ${transaction.payoutCurrency}`
    )
    transaction._id = undefined
  }
}

const dateRoundDownHour = (dateString: string): string => {
  const date = new Date(dateString)
  date.setMinutes(0)
  date.setSeconds(0)
  date.setMilliseconds(0)
  return new Date(date).toISOString()
}

const RETRY_DELAY = 1500
const MAX_RETRIES = 5

async function getExchangeRate(
  ca: string,
  cb: string,
  date: string,
  retry: number = 0
): Promise<number> {
  const hourDate = dateRoundDownHour(date)
  const currencyA = standardizeNames(ca)
  const currencyB = standardizeNames(cb)
  const url = `https://rates2.edge.app/v1/exchangeRate?currency_pair=${currencyA}_${currencyB}&date=${hourDate}`
  try {
    const result = await fetch(url, { method: 'GET' })
    if (!result.ok) {
      if (result.status === 429) {
        datelog(`Rate limit hit`)
      }
      const text = await result.text()
      throw new Error(`Rates error: ${text}`)
    }
    const jsonObj = await result.json()
    datelog(
      `Rate for ${currencyA} -> ${currencyB} ${date}: ${jsonObj.exchangeRate}`
    )
    return safeParseFloat(jsonObj.exchangeRate)
  } catch (e) {
    if (retry < MAX_RETRIES) {
      const snoozeTime = Math.pow(2, retry) * RETRY_DELAY

      datelog(`snoozing for ${snoozeTime}ms`)
      await snooze(snoozeTime)
      return await getExchangeRate(ca, cb, date, retry + 1)
    }
    datelog(
      `Could not not get exchange rate for ${currencyA} and ${currencyB} at ${date}.`,
      e
    )
    return 0
  }
}
