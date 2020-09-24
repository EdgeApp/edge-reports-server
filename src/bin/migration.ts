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
import fs from 'fs'
import js from 'jsonfile'
import nano from 'nano'

import { DbTx, StandardTx } from '../types'
import { datelog } from '../util'

const config = js.readFileSync('./config.json')

const asPartitionTimestamp = asObject({
  doc: asObject({
    timestamp: asNumber
  })
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

const BATCH_ADVANCE = 1000

const nanoDb = nano(config.couchDbFullpath)

migration().catch(e => {
  datelog(e)
})

async function migration(): Promise<void> {
  const reportsTransactions = nanoDb.use('reports_transactions')
  const partnerJSONNames: string[] = []
  fs.readdirSync('./cache').forEach(file => {
    partnerJSONNames.push(file)
  })
  for (const partnerJSONName of partnerJSONNames) {
    const partnerJSON = js.readFileSync(`./cache/${partnerJSONName}`)
    const partner = asPartner(partnerJSON)
    const appAndPluginId = `edge_${partner.name}`
    let earliestTimestamp

    try {
      await reportsTransactions
        // @ts-ignore
        .partitionedList(appAndPluginId, { include_docs: true })
        .then(body => {
          body.rows.forEach(doc => {
            const timestamp = asPartitionTimestamp(doc).doc.timestamp
            if (
              earliestTimestamp === undefined ||
              timestamp < earliestTimestamp
            ) {
              earliestTimestamp = timestamp
            }
          })
        })
    } catch (e) {
      datelog(e)
      throw e
    }

    if (earliestTimestamp === undefined) {
      datelog(`Partition ${appAndPluginId} does not exist.`)
      earliestTimestamp = 9999999999
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
    const reformattedTxs: DbTx[] = []
    let offset = 0
    while (offset < filteredTransactions.length) {
      reformattedTxs.push(
        ...(await Promise.all(
          filteredTransactions
            .slice(offset, offset + BATCH_ADVANCE)
            .map(async tx => {
              if (appAndPluginId === `edge_shapeshift`) {
                const cleanedShapeshiftTx = asShapeshiftTx(tx)
                const newTx = {
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
                  isoDate: new Date(
                    cleanedShapeshiftTx.timestamp * 1000
                  ).toISOString(),
                  usdValue: undefined,
                  rawTx: tx
                }
                return standardTxReformat(
                  newTx,
                  appAndPluginId,
                  reportsTransactions
                )
              }
              const cleanedOldTx = asOldTx(tx)
              const timestamp =
                typeof cleanedOldTx.timestamp === 'number'
                  ? cleanedOldTx.timestamp
                  : parseFloat(cleanedOldTx.timestamp)
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
              const newTx = {
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
              return standardTxReformat(
                newTx,
                appAndPluginId,
                reportsTransactions
              )
            })
        ))
      )
      offset += BATCH_ADVANCE
      datelog(
        `Reformatted ${reformattedTxs.length} ${appAndPluginId} transactions.`
      )
    }
    datelog(
      `Importing ${filteredTransactions.length} transactions for ${partner.name} before date ${earliestDate}.`
    )
    try {
      let numErrors = 0
      for (
        let offset = 0;
        offset < reformattedTxs.length;
        offset += BATCH_ADVANCE
      ) {
        let advance = BATCH_ADVANCE
        if (offset + BATCH_ADVANCE > reformattedTxs.length) {
          advance = reformattedTxs.length - offset
        }
        const docs = await reportsTransactions.bulk({
          docs: reformattedTxs.slice(offset, offset + advance)
        })
        datelog(`Inserted ${offset + advance} transactions.`)
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

async function standardTxReformat(
  transaction: StandardTx,
  appAndPluginId: string,
  reportsTransactions: nano.DocumentScope<unknown>
): Promise<DbTx> {
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
    throw new Error('duplicate transaction imported')
  }
  const newObj = { _rev: undefined, ...result, ...transaction, _id: key }

  // replace all fields with non-standard names
  newObj.depositCurrency = standardizeNames(newObj.depositCurrency)
  newObj.payoutCurrency = standardizeNames(newObj.payoutCurrency)

  return newObj
}
