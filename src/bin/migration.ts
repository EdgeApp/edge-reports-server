import {
  asArray,
  asBoolean,
  asEither,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'
import js from 'jsonfile'
import nano from 'nano'

import config from '../../config.json'
import { StandardTx } from '../types'
import { datelog } from '../util'

const banxaJSON = js.readFileSync('./cache/banRaw.json')
const bitrefillJSON = js.readFileSync('./cache/brRaw.json')
const bitsofgoldJSON = js.readFileSync('./cache/bogRaw.json')
const bityJSON = js.readFileSync('./cache/bityRaw.json')
const changellyJSON = js.readFileSync('./cache/chRaw.json')
const changenowJSON = js.readFileSync('./cache/cnRaw.json')
const coinswitchJSON = js.readFileSync('./cache/csRaw.json')
const faastJSON = js.readFileSync('./cache/faastRaw.json')
const foxJSON = js.readFileSync('./cache/foxRaw.json')
const godexJSON = js.readFileSync('./cache/gxRaw.json')
const libertyxJSON = js.readFileSync('./cache/libertyxRaw.json')
const moonpayJSON = js.readFileSync('./cache/mnpRaw.json')
const safelloJSON = js.readFileSync('./cache/safRaw.json')
const shapeshiftJSON = js.readFileSync('./cache/ssRaw.json')
const simplexJSON = js.readFileSync('./cache/simRaw.json')
const switchainJSON = js.readFileSync('./cache/switchainRaw.json')
const totleJSON = js.readFileSync('./cache/tlRaw.json')
const transakJSON = js.readFileSync('./cache/tnkRaw.json')
const wyreJSON = js.readFileSync('./cache/wyrRaw.json')

const asTimestamps = asObject({
  timestamp: asNumber
})

const asTimestampResult = asObject({
  docs: asArray(asTimestamps)
})

const asPartner = asObject({
  name: asString,
  txs: asArray(asUnknown)
})

const asRawTx = asObject({
  status: asString,
  inputTXID: asEither(asString, asNull),
  timestamp: asEither(asString, asNumber)
})

const asOldTx = asObject({
  status: asString,
  inputTXID: asString,
  inputAddress: asEither(asString, asBoolean),
  inputCurrency: asString,
  inputAmount: asEither(asString, asNumber),
  outputAddress: asString,
  outputCurrency: asString,
  outputAmount: asEither(asString, asNumber),
  timestamp: asEither(asString, asNumber)
})

const asShapeshiftTx = asObject({
  orderId: asString,
  inputTXID: asString,
  inputAddress: asString,
  inputCurrency: asString,
  inputAmount: asNumber,
  outputTXID: asString,
  outputAddress: asOptional(asString),
  outputCurrency: asString,
  outputAmount: asString,
  timestamp: asNumber
})

const CURRENCY_CONVERSION = {
  USDT20: 'USDT',
  USDTERC20: 'USDT',
  BCHABC: 'BCH',
  BCHSV: 'BSV'
}

const oldTransactions = [
  banxaJSON,
  bityJSON,
  bitsofgoldJSON,
  bitrefillJSON,
  changellyJSON,
  changenowJSON,
  coinswitchJSON,
  faastJSON,
  foxJSON,
  godexJSON,
  libertyxJSON,
  moonpayJSON,
  safelloJSON,
  shapeshiftJSON,
  simplexJSON,
  switchainJSON,
  totleJSON,
  transakJSON,
  wyreJSON
]

const nanoDb = nano(config.couchDbFullpath)

migration().catch(e => {
  datelog(e)
})

async function migration(): Promise<void> {
  const reportsTransactions = nanoDb.use('reports_transactions')
  for (const partnerJSON of oldTransactions) {
    const partner = asPartner(partnerJSON)
    const appAndPluginId = `edge_${partner.name}`
    const query = {
      selector: {
        timestamp: { $gte: 0 }
      },
      fields: ['timestamp'],
      limit: 100000000
    }
    const transactionTimestamps = asTimestampResult(
      await reportsTransactions.partitionedFind(appAndPluginId, query)
    )

    let earliestTimestamp = transactionTimestamps.docs[0].timestamp
    for (let i = 1; i < transactionTimestamps.docs.length; i++) {
      earliestTimestamp =
        earliestTimestamp < transactionTimestamps.docs[i].timestamp
          ? earliestTimestamp
          : transactionTimestamps.docs[i].timestamp
    }
    const earliestDate = new Date(earliestTimestamp * 1000).toISOString()
    const filteredTransactions = partner.txs.filter(obj => {
      const checkObj = asRawTx(obj)
      if (
        checkObj.timestamp < earliestTimestamp &&
        checkObj.inputTXID != null &&
        checkObj.status === 'complete'
      ) {
        return obj
      }
    })
    const reformattedTxs = filteredTransactions.map(tx => {
      if (appAndPluginId === `edge_shapeshift`) {
        const cleanedShapeshiftTx = asShapeshiftTx(tx)
        return {
          status: 'complete',
          orderId: cleanedShapeshiftTx.orderId,
          depositTxid: cleanedShapeshiftTx.inputTXID,
          depositAddress: cleanedShapeshiftTx.inputAddress,
          depositCurrency: cleanedShapeshiftTx.inputCurrency,
          depositAmount: cleanedShapeshiftTx.inputAmount,
          payoutTxid: cleanedShapeshiftTx.outputTXID,
          payoutAddress: cleanedShapeshiftTx.outputAddress,
          payoutCurrency: cleanedShapeshiftTx.outputCurrency,
          payoutAmount: parseFloat(cleanedShapeshiftTx.outputAmount),
          timestamp: cleanedShapeshiftTx.timestamp,
          isoDate: new Date(cleanedShapeshiftTx.timestamp * 1000).toISOString(),
          usdValue: undefined,
          rawTx: tx
        }
      }
      const cleanedOldTx = asOldTx(tx)
      const timestamp =
        typeof cleanedOldTx.timestamp === 'number'
          ? cleanedOldTx.timestamp
          : parseInt(cleanedOldTx.timestamp)
      const isoDate = new Date(timestamp * 1000).toISOString()
      const depositAddress =
        typeof cleanedOldTx.inputAddress === 'string' &&
        cleanedOldTx.inputAddress.length > 0
          ? cleanedOldTx.inputAddress
          : undefined
      const payoutAddress =
        cleanedOldTx.outputAddress.length > 0
          ? cleanedOldTx.outputAddress
          : undefined
      const depositAmount =
        typeof cleanedOldTx.inputAmount === 'number'
          ? cleanedOldTx.inputAmount
          : parseFloat(cleanedOldTx.inputAmount)
      const payoutAmount =
        typeof cleanedOldTx.outputAmount === 'number'
          ? cleanedOldTx.outputAmount
          : parseFloat(cleanedOldTx.outputAmount)
      return {
        orderId: cleanedOldTx.inputTXID,
        depositTxid: undefined,
        depositAddress,
        depositCurrency: cleanedOldTx.inputCurrency,
        depositAmount,
        payoutTxid: undefined,
        payoutAddress,
        payoutCurrency: cleanedOldTx.outputCurrency,
        payoutAmount,
        status: 'complete',
        isoDate,
        timestamp,
        usdValue: undefined,
        rawTx: undefined
      }
    })
    datelog(
      `Importing ${filteredTransactions.length} transactions for ${partner.name} before date ${earliestDate}.`
    )
    const transactionsArray: StandardTx[] = []
    for (const transaction of reformattedTxs) {
      transaction.orderId = transaction.orderId.toLowerCase()
      const key = `${appAndPluginId}:${transaction.orderId}`.toLowerCase()
      const result = await reportsTransactions.get(key).catch(e => {
        if (e != null && e.error === 'not_found') {
          return {}
        } else {
          throw e
        }
      })
      // no duplicate transactions
      if (Object.keys(result).length > 0) {
        continue
      }
      const newObj = { _rev: undefined, ...result, ...transaction, _id: key }

      // replace all fields with non-standard names
      newObj.depositCurrency = standardizeNames(newObj.depositCurrency)
      newObj.payoutCurrency = standardizeNames(newObj.payoutCurrency)

      datelog(`id: ${newObj._id}. revision: ${newObj._rev}`)
      transactionsArray.push(newObj)
    }
    try {
      const docs = await reportsTransactions.bulk({ docs: transactionsArray })
      let numErrors = 0
      for (const doc of docs) {
        if (doc.error != null) {
          datelog(
            `There was an error in the batch ${doc.error}.  id: ${doc.id}. revision: ${doc.rev}`
          )
          numErrors++
        }
      }
      datelog(`total errors: ${numErrors}`)
    } catch (e) {
      datelog('Error doing bulk transaction insert', e)
      throw e
    }
  }
}

const standardizeNames = (field: string): string => {
  if (CURRENCY_CONVERSION[field] !== undefined) {
    return CURRENCY_CONVERSION[field]
  }
  return field
}
