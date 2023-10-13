// import bodyParser from 'body-parser'
import { asArray, asObject, asOptional, asString } from 'cleaners'
import cors from 'cors'
import express from 'express'
import nano from 'nano'

import { config } from './config'
import { cacheAnalytic } from './dbutils'
import { asApps, asDbTx } from './types'

const asAnalyticsReq = asObject({
  start: asString,
  end: asString,
  appId: asString,
  pluginIds: asArray(asString),
  timePeriod: asString
})

const asCheckTxsReq = asObject({
  apiKey: asString,
  data: asArray(
    asObject({
      pluginId: asString,
      orderId: asString
    })
  )
})

const asCheckTxsFetch = asArray(
  asObject({
    key: asString,
    doc: asOptional(asDbTx),
    error: asOptional(asString)
  })
)

const asPluginIdsReq = asObject({
  appId: asString
})
const asPartnerIdsDbReq = asObject({
  partnerIds: asObject(
    asObject({
      pluginId: asOptional(asString),
      apiKeys: asObject(asString)
    })
  )
})

const asAppIdReq = asObject({
  apiKey: asString
})
const asAppIdDbReq = asObject({
  appId: asString
})

interface CheckTxsResponse {
  pluginId: string
  orderId: string
  error?: string
  usdValue?: number
}

const CHECKTXS_BATCH_LIMIT = 100

const nanoDb = nano(config.couchDbFullpath)

async function main(): Promise<void> {
  // start express and couch db server
  const app = express()
  const reportsTransactions = nanoDb.use('reports_transactions')
  const reportsApps = nanoDb.use('reports_apps')

  app.use(express.json())
  // app.use(bodyParser.json({ type: 'application/json' }))
  app.use(cors())
  app.use('/', express.static('dist'))

  const query = {
    selector: {
      appId: { $exists: true }
    },
    limit: 1000000
  }
  console.log(config)
  const rawApps = await reportsApps.find(query)
  const apps = asApps(rawApps.docs)

  app.post(`/v1/analytics/`, async function(req, res) {
    let analyticsQuery: ReturnType<typeof asAnalyticsReq>
    try {
      analyticsQuery = asAnalyticsReq(req.body)
    } catch {
      res.status(400).send(`Missing Request Fields`)
      return
    }
    const { start, end, appId, pluginIds } = analyticsQuery
    const timePeriod = analyticsQuery.timePeriod.toLowerCase()
    const queryStart = new Date(start).getTime() / 1000
    const queryEnd = new Date(end).getTime() / 1000
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

    const result = await cacheAnalytic(
      queryStart,
      queryEnd,
      appId,
      pluginIds,
      timePeriod
    )

    res.json(result)
  })

  app.post('/v1/checkTxs/', async function(req, res) {
    let queryResult
    try {
      queryResult = asCheckTxsReq(req.body)
    } catch (e) {
      return res.status(400).send(`Missing Request fields.`)
    }
    if (queryResult.data.length > CHECKTXS_BATCH_LIMIT) {
      return res.status(400).send(`Exceeded Limit of ${CHECKTXS_BATCH_LIMIT}`)
    }
    const searchedAppId = apps.find(app => app._id === queryResult.apiKey)
    if (typeof searchedAppId === 'undefined') {
      return res.status(400).send(`API Key has no match.`)
    }
    const { appId } = searchedAppId
    const keys = queryResult.data.map(tx => {
      return `${appId}_${tx.pluginId}:${tx.orderId}`.toLowerCase()
    })
    try {
      const dbResult = await reportsTransactions.fetch({ keys })
      const cleanedResult = asCheckTxsFetch(dbResult.rows)
      const data: CheckTxsResponse[] = cleanedResult.map((result, index) => {
        const tx: CheckTxsResponse = {
          pluginId: queryResult.data[index].pluginId,
          orderId: queryResult.data[index].orderId,
          usdValue: undefined
        }
        if (result.error != null) {
          return {
            ...tx,
            error: `Could not find transaction: ${result.key}`
          }
        }
        if (result.doc != null) tx.usdValue = result.doc.usdValue
        return tx
      })
      res.json({ appId, data })
    } catch (e) {
      console.log(e)
      return res.status(500).send(`Internal Server Error.`)
    }
  })

  app.get('/v1/getPluginIds/', async function(req, res) {
    let queryResult
    try {
      queryResult = asPluginIdsReq(req.query)
    } catch (e) {
      res.status(400).send(`Missing Request fields.`)
      return
    }
    const query = {
      selector: {
        appId: { $eq: queryResult.appId.toLowerCase() }
      },
      fields: ['partnerIds'],
      limit: 1
    }
    let partnerIds
    try {
      const rawApp = await reportsApps.find(query)
      const app = asPartnerIdsDbReq(rawApp.docs[0])
      partnerIds = Object.keys(app.partnerIds)
    } catch (e) {
      res.status(404).send(`App ID not found.`)
      return
    }
    res.json(partnerIds)
  })

  app.get('/v1/getAppId/', async function(req, res) {
    let queryResult
    try {
      queryResult = asAppIdReq(req.query)
    } catch (e) {
      res.status(400).send(`Missing Request fields.`)
      return
    }
    let appId
    try {
      const dbResult = await reportsApps.get(queryResult.apiKey)
      appId = asAppIdDbReq(dbResult).appId
    } catch (e) {
      res.status(400).send(`API KEY UNRECOGNIZED.`)
      return
    }
    res.json(appId)
  })

  app.listen(config.httpPort, function() {
    console.log(`Server started on Port ${config.httpPort}`)
  })
}
main().catch(e => console.log(e))
