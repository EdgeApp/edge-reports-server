// import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'
import nano from 'nano'

import { config } from './config'
import { analyticsRouter } from './routes/v1/analytics'
import { checkTxsRouter } from './routes/v1/checkTxs'
import { getAppIdRouter } from './routes/v1/getAppId'
import { getPluginIdsRouter } from './routes/v1/getPluginIds'
import { HttpError } from './util/httpErrors'

export const nanoDb = nano(config.couchDbFullpath)
export const reportsTransactions = nanoDb.use('reports_transactions')
export const reportsApps = nanoDb.use('reports_apps')

async function main(): Promise<void> {
  // start express and couch db server
  const app = express()

  app.use(express.json())
  // app.use(bodyParser.json({ type: 'application/json' }))
  app.use(cors())
  app.use('/', express.static('dist'))

  app.use('/v1/analytics/', analyticsRouter)
  app.use('/v1/checkTxs/', checkTxsRouter)
  app.use('/v1/getAppId/', getAppIdRouter)
  app.use('/v1/getPluginIds/', getPluginIdsRouter)

  // Error router
  app.use(function(err, _req, res, _next) {
    console.error(err.stack)
    if (err instanceof HttpError) {
      console.error(`HTTP status ${err.status}:`, err.error)
      res.status(err.status).send({
        error: {
          message: err.error.message
        }
      })
    } else {
      res.status(500).send({
        error: 'Internal Server Error'
      })
    }
  })

  app.listen(config.httpPort, function() {
    console.log(`Server started on Port ${config.httpPort}`)
  })
}
main().catch(e => console.log(e))
