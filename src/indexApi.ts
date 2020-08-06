import bodyParser from 'body-parser'
import { asArray, asNumber, asObject, asString } from 'cleaners'
import cors from 'cors'
import express from 'express'
import nano from 'nano'

import config from '../config.json'
import { asDbTx } from './types'

const asCheckTxReq = asObject({
  pluginId: asString,
  orderId: asString
})

const asDbReq = asObject({
  docs: asArray(
    asObject({
      inputTXID: asString,
      inputCurrency: asString,
      outputCurrency: asString,
      timestamp: asNumber,
      usdValue: asNumber
    })
  )
})

const asBucket = asArray(
  asObject({
    start: asNumber,
    isoDate: asString,
    usdValue: asNumber
  })
)

const nanoDb = nano(config.couchDbFullpath)

async function main(): Promise<void> {
  // start express and couch db server
  const app = express()
  const dbTransactions = nanoDb.use('db_transactions')

  app.use(bodyParser.json({ limit: '1mb' }))
  app.use(cors())

  app.get(`/v1/analytics/`, async function(req, res) {
    const query = {
      selector: {
        $and: [
          { usdValue: { $gte: 0 } },
          { timestamp: { $gte: parseInt(req.query.start) } },
          { timestamp: { $lte: parseInt(req.query.end) } },
          { _id: { $regex: req.query.pluginId } }
        ]
      },
      fields: [
        'inputTXID',
        'inputCurrency',
        'outputCurrency',
        'timestamp',
        'usdValue'
      ],
      limit: 1000000
    }
    const result = asDbReq(await dbTransactions.find(query))
    const sortedTxs = result.docs.sort(function(a, b) {
      return a.timestamp - b.timestamp
    })
    // the creation of buckets
    const monthBucket = req.query.timePeriod.includes('month')
    const dayBucket = req.query.timePeriod.includes('day')
    const hourBucket = req.query.timePeriod.includes('hour')
    const beginningDate = new Date(req.query.start * 1000)
    const monthArray: ReturnType<typeof asBucket> = []
    const dayArray: ReturnType<typeof asBucket> = []
    const hourArray: ReturnType<typeof asBucket> = []
    let y
    let m
    let d
    // monthly bucket creation
    if (monthBucket === true) {
      y = beginningDate.getFullYear()
      m = beginningDate.getMonth()
      let monthDone = false
      let monthStart
      while (!monthDone) {
        monthStart = new Date(y, m, 1)
        monthArray.push({
          start: monthStart.getTime() / 1000,
          isoDate: monthStart,
          usdValue: 0
        })
        m++
        if (monthStart.getTime() > req.query.end * 1000) {
          monthDone = true
        }
      }
    }
    // daily bucket Creation
    if (dayBucket === true) {
      y = beginningDate.getFullYear()
      m = beginningDate.getMonth()
      d = beginningDate.getDay()
      let dayStart = new Date(y, m, d)
      dayArray.push({
        start: dayStart.getTime() / 1000,
        isoDate: dayStart.toISOString(),
        usdValue: 0
      })
      let dayDone = false
      while (!dayDone) {
        const dayTimestamp = dayStart.getTime() + 1000 * 60 * 60 * 24
        dayStart = new Date(dayTimestamp)
        if (dayTimestamp > req.query.end * 1000) {
          dayDone = true
        }
        dayArray.push({
          start: dayTimestamp / 1000,
          isoDate: dayStart.toISOString(),
          usdValue: 0
        })
      }
    }
    // hourly bucket creation
    if (hourBucket === true) {
      y = beginningDate.getFullYear()
      m = beginningDate.getMonth()
      d = beginningDate.getDay()
      const h = beginningDate.getHours()
      let hourStart = new Date(y, m, d, h)
      hourArray.push({
        start: hourStart.getTime() / 1000,
        isoDate: hourStart.toISOString(),
        usdValue: 0
      })
      let hourDone = false
      while (!hourDone) {
        const hourTimestamp = hourStart.getTime() + 1000 * 60 * 60
        hourStart = new Date(hourTimestamp)
        if (hourTimestamp > req.query.end * 1000) {
          hourDone = true
        }
        hourArray.push({
          start: hourTimestamp / 1000,
          isoDate: hourStart.toISOString(),
          usdValue: 0
        })
      }
    }

    // put transactions into buckets
    let monthPointer = 0
    let dayPointer = 0
    let hourPointer = 0
    let txsPointer = 0
    while (txsPointer < sortedTxs.length) {
      // month
      if (monthBucket === true) {
        if (monthPointer + 1 !== monthArray.length) {
          while (
            sortedTxs[txsPointer].timestamp > monthArray[monthPointer + 1].start
          ) {
            monthPointer++
            if (monthPointer + 1 === monthArray.length) {
              break
            }
          }
        }
        monthArray[monthPointer].usdValue += sortedTxs[txsPointer].usdValue
      }
      // day
      if (dayBucket === true) {
        if (dayPointer + 1 !== dayArray.length) {
          while (
            sortedTxs[txsPointer].timestamp > dayArray[dayPointer + 1].start
          ) {
            dayPointer++
            if (dayPointer + 1 === dayArray.length) {
              break
            }
          }
        }
        dayArray[dayPointer].usdValue += sortedTxs[txsPointer].usdValue
      }
      // hour
      if (hourBucket === true) {
        if (hourPointer + 1 !== hourArray.length) {
          while (
            sortedTxs[txsPointer].timestamp > hourArray[hourPointer + 1].start
          ) {
            hourPointer++
            if (hourPointer + 1 === hourArray.length) {
              break
            }
          }
        }
        hourArray[hourPointer].usdValue += sortedTxs[txsPointer].usdValue
      }
      txsPointer++
    }

    const analyticsResult = {
      result: {
        month: monthArray,
        day: dayArray,
        hour: hourArray
      },
      pluginId: req.query.pluginId,
      start: req.query.start,
      end: req.query.end
    }
    res.json(analyticsResult)
  })

  app.get('/v1/checkTx/', async function(req, res) {
    console.log('req.query', req.query)
    let queryResult
    try {
      queryResult = asCheckTxReq(req.query)
    } catch (e) {
      res.status(400).send(`Missing Request fields.`)
      return
    }
    let result
    try {
      const query = `${queryResult.pluginId}:${queryResult.orderId}`
      const dbResult = await dbTransactions.get(query.toLowerCase())
      result = asDbTx(dbResult)
    } catch (e) {
      console.log(e)
    }
    const out = {
      pluginId: queryResult.pluginId,
      orderId: queryResult.orderId,
      usdValue: undefined
    }
    if (result != null && result.usdValue != null) {
      out.usdValue = result.usdValue
    }
    res.json(out)
  })

  const result = await dbTransactions.get('bitsofgold:02de0a67ed')
  console.log('result', result)

  app.listen(3000, function() {
    console.log('Server started on Port 3000')
  })
}
main().catch(e => console.log(e))
