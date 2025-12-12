import { asArray, asObject, asUnknown } from 'cleaners'
import nano, { MangoQuery } from 'nano'
import fetch from 'node-fetch'

import { config } from './config'
import {
  asDbCurrencyCodeMappings,
  asDbTx,
  asRatesV3Params,
  CurrencyCodeMappings,
  DbTx,
  RatesV3Params
} from './types'
import { datelog, safeParseFloat, standardizeNames } from './util'
import { isFiatCurrency } from './util/fiatCurrency'

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

async function updateTxValuesV3(transaction: DbTx): Promise<void> {
  const {
    isoDate,
    depositCurrency,
    depositChainPluginId,
    depositTokenId,
    depositAmount,
    payoutChainPluginId,
    payoutTokenId,
    payoutCurrency,
    payoutAmount
  } = transaction

  let depositIsFiat = false
  let depositIsUsd = false
  let payoutIsFiat = false
  let payoutIsUsd = false
  const ratesRequest: RatesV3Params = {
    targetFiat: 'USD',
    crypto: [],
    fiat: []
  }
  if (depositChainPluginId != null && depositTokenId !== undefined) {
    ratesRequest.crypto.push({
      isoDate: new Date(isoDate),
      asset: {
        pluginId: depositChainPluginId,
        tokenId: depositTokenId
      },
      rate: undefined
    })
  } else if (depositCurrency === 'USD') {
    depositIsUsd = true
  } else if (isFiatCurrency(depositCurrency)) {
    depositIsFiat = true
    ratesRequest.fiat.push({
      isoDate: new Date(isoDate),
      fiatCode: depositCurrency,
      rate: undefined
    })
  } else if (depositCurrency !== 'USD') {
    console.error(
      `Deposit asset is not a crypto asset or fiat currency ${depositCurrency} ${depositChainPluginId} ${depositTokenId}`
    )
    return
  }

  if (payoutChainPluginId != null && payoutTokenId !== undefined) {
    ratesRequest.crypto.push({
      isoDate: new Date(isoDate),
      asset: {
        pluginId: payoutChainPluginId,
        tokenId: payoutTokenId
      },
      rate: undefined
    })
  } else if (payoutCurrency === 'USD') {
    payoutIsUsd = true
  } else if (isFiatCurrency(payoutCurrency)) {
    payoutIsFiat = true
    ratesRequest.fiat.push({
      isoDate: new Date(isoDate),
      fiatCode: payoutCurrency,
      rate: undefined
    })
  } else if (payoutCurrency !== 'USD') {
    console.error(
      `Payout asset is not a crypto asset or fiat currency ${payoutCurrency} ${payoutChainPluginId} ${payoutTokenId}`
    )
    return
  }

  const ratesResponse = await fetch('https://rates3.edge.app/v3/rates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(ratesRequest)
  })
  if (!ratesResponse.ok) {
    const errorText = await ratesResponse.text()
    throw new Error(
      `Rates v3 error (${ratesResponse.status} ${ratesResponse.statusText}): ${errorText}`
    )
  }
  const ratesResponseJson = await ratesResponse.json()
  const rates = asRatesV3Params(ratesResponseJson)
  const depositRateObf = depositIsFiat
    ? rates.fiat.find(rate => rate.fiatCode === depositCurrency)
    : rates.crypto.find(
        rate =>
          rate.asset.pluginId === depositChainPluginId &&
          (rate.asset.tokenId ?? null) === depositTokenId
      )
  const payoutRateObf = payoutIsFiat
    ? rates.fiat.find(rate => rate.fiatCode === payoutCurrency)
    : rates.crypto.find(
        rate =>
          rate.asset.pluginId === payoutChainPluginId &&
          (rate.asset.tokenId ?? null) === payoutTokenId
      )

  // USD is the target fiat, so it has an implicit rate of 1.0
  const depositRate = depositIsUsd ? 1 : depositRateObf?.rate
  const payoutRate = payoutIsUsd ? 1 : payoutRateObf?.rate

  // Calculate and fill out payoutAmount if it is zero
  if (payoutAmount === 0) {
    if (depositRate == null) {
      console.error(
        `No rate found for deposit ${depositCurrency} ${depositChainPluginId} ${depositTokenId}`
      )
    }

    if (payoutRate == null) {
      console.error(
        `No rate found for payout ${payoutCurrency} ${payoutChainPluginId} ${payoutTokenId}`
      )
    }
    if (
      depositRate != null &&
      depositRate > 0 &&
      payoutRate != null &&
      payoutRate > 0
    ) {
      transaction.payoutAmount = (depositAmount * depositRate) / payoutRate
    }
  }

  // Calculate the usdValue first trying to use the deposit amount. If that's not available
  // then try to use the payout amount.
  const t = transaction
  if (transaction.usdValue == null || transaction.usdValue <= 0) {
    if (depositRate != null && depositRate > 0) {
      transaction.usdValue = depositAmount * depositRate
      datelog(
        `V3 SUCCESS id:${t._id} ${t.isoDate.slice(0, 10)} deposit:${
          t.depositCurrency
        }-${t.depositChainPluginId}-${
          t.depositTokenId
        } rate:${depositRate} usdValue:${t.usdValue}`
      )
    } else if (payoutRate != null && payoutRate > 0) {
      transaction.usdValue = transaction.payoutAmount * payoutRate
      datelog(
        `V3 SUCCESS id:${t._id} ${t.isoDate.slice(0, 10)} payout:${
          t.payoutCurrency
        }-${t.payoutChainPluginId}-${
          t.payoutTokenId
        } rate:${payoutRate} usdValue:${t.usdValue}`
      )
    }
  }
}

async function updateTxValues(
  transaction: DbTx,
  mappings: CurrencyCodeMappings
): Promise<void> {
  const hasDepositPluginInfo =
    transaction.depositChainPluginId != null &&
    transaction.depositTokenId !== undefined
  const hasPayoutPluginInfo =
    transaction.payoutChainPluginId != null &&
    transaction.payoutTokenId !== undefined
  let success = false
  const needsPayoutAmount = transaction.depositAmount > 0

  if (
    (hasDepositPluginInfo && hasPayoutPluginInfo) ||
    (hasDepositPluginInfo && isFiatCurrency(transaction.payoutCurrency)) ||
    (isFiatCurrency(transaction.depositCurrency) && hasPayoutPluginInfo)
  ) {
    const hadUsdValue = transaction.usdValue != null && transaction.usdValue > 0
    const hadPayoutAmount = transaction.payoutAmount !== 0 || !needsPayoutAmount

    try {
      await updateTxValuesV3(transaction)
    } catch (e) {
      datelog('updateTxValuesV3 failed', e)
    }

    const hasUsdValue = transaction.usdValue != null && transaction.usdValue > 0
    const hasPayoutAmount = transaction.payoutAmount !== 0 || !needsPayoutAmount
    const madeProgress =
      (!hadUsdValue && hasUsdValue) || (!hadPayoutAmount && hasPayoutAmount)

    success = madeProgress
  } else {
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
        transaction.payoutAmount =
          transaction.depositAmount * (1 / exchangeRate)
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
  let currencyA = standardizeNames(ca)
  let currencyB = standardizeNames(cb)

  if (currencyA === currencyB) {
    return 1
  }

  currencyA = isFiatCurrency(currencyA) ? `iso:${currencyA}` : currencyA
  currencyB = isFiatCurrency(currencyB) ? `iso:${currencyB}` : currencyB

  const url = `https://rates2.edge.app/v2/exchangeRate?currency_pair=${currencyA}_${currencyB}&date=${hourDate}`
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
