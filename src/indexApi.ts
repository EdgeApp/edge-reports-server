import bodyParser from 'body-parser'
import { asArray, asNumber, asObject, asString } from 'cleaners'
import cors from 'cors'
import express from 'express'
import nano from 'nano'

import config from '../config.json'
import { getAnalytics } from './apiAnalytics'
import { asDbTx } from './types'

const asAnalyticsReq = asObject({
  start: asString,
  end: asString,
  appId: asString,
  pluginId: asString,
  timePeriod: asString
})

const asCheckTxReq = asObject({
  apiKey: asString,
  pluginId: asString,
  orderId: asString
})

const asDbReq = asObject({
  docs: asArray(
    asObject({
      orderId: asString,
      depositCurrency: asString,
      payoutCurrency: asString,
      timestamp: asNumber,
      usdValue: asNumber
    })
  )
})

const asApiKeySearch = asObject({
  docs: asArray(
    asObject({
      appId: asString
    })
  )
})

const nanoDb = nano(config.couchDbFullpath)

function main(): void {
  // start express and couch db server
  const app = express()
  const reportsTransactions = nanoDb.use('reports_transactions')
  const reportsApps = nanoDb.use('reports_apps')

  app.use(bodyParser.json({ limit: '1mb' }))
  app.use(cors())

  app.get(`/v1/analytics/`, async function(req, res) {
    let analyticsQuery: ReturnType<typeof asAnalyticsReq>
    try {
      analyticsQuery = asAnalyticsReq(req.query)
    } catch {
      res.status(400).send(`Missing Request Fields`)
      return
    }
    let { start, end, appId, pluginId, timePeriod } = analyticsQuery
    timePeriod = timePeriod.toLowerCase()
    const queryStart = parseInt(start)
    const queryEnd = parseInt(end)
    if (
      !(queryStart > 0) ||
      !(queryEnd > 0) ||
      (!timePeriod.includes('month') &&
        !timePeriod.includes('day') &&
        !timePeriod.includes('hour'))
    ) {
      res.status(400).send(`Bad Request Fields`)
      return
    }
    if (queryStart > queryEnd) {
      res.status(400).send(`Start must be less than End`)
      return
    }
    const appAndPluginId = `${appId}_${pluginId}`
    const query = {
      selector: {
        usdValue: { $gte: 0 },
        timestamp: { $gte: queryStart, $lt: queryEnd }
      },
      fields: [
        'orderId',
        'depositCurrency',
        'payoutCurrency',
        'timestamp',
        'usdValue'
      ],
      // proper api arcitechture should page forward instead of all in 1 chunk
      limit: 1000000
    }

    let result
    try {
      const r = await reportsTransactions.partitionedFind(appAndPluginId, query)
      result = asDbReq(r)
    } catch (e) {
      console.log(e)
    }
    // TODO: put the sort within the query, need to add default indexs in the database.
    const sortedTxs = result.docs.sort(function (a, b) {
      return a.timestamp - b.timestamp
    })
    const answer = getAnalytics(
      sortedTxs,
      queryStart,
      queryEnd,
      appId,
      pluginId,
      timePeriod
    )
    res.json(answer)
  })

  app.get('/v1/checkTx/', async function(req, res) {
    let queryResult
    try {
      queryResult = asCheckTxReq(req.query)
    } catch (e) {
      res.status(400).send(`Missing Request fields.`)
      return
    }
    const query = {
      selector: {
        _id: { $eq: queryResult.apiKey }
      },
      fields: ['appId'],
      limit: 1
    }
    const searchedAppId = asApiKeySearch(await reportsApps.find(query))
    if (searchedAppId.docs.length === 0) {
      res.status(404).send('Api Key has no match.')
      return
    }
    const appId = searchedAppId.docs[0].appId
    let result
    try {
      const query = `${appId}_${queryResult.pluginId}:${queryResult.orderId}`
      const dbResult = await reportsTransactions.get(query.toLowerCase())
      result = asDbTx(dbResult)
    } catch (e) {
      console.log(e)
      res.status(404).send('Could not find Transaction.')
      return
    }
    const out = {
      appId: appId,
      pluginId: queryResult.pluginId,
      orderId: queryResult.orderId,
      usdValue: undefined
    }
    if (result != null && result.usdValue != null) {
      out.usdValue = result.usdValue
    }
    res.json(out)
  })

  app.listen(3000, function() {
    console.log('Server started on Port 3000')
  })
}
main()
