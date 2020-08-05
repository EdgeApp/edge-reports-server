import bodyParser from 'body-parser'
import { asObject, asString } from 'cleaners'
import cors from 'cors'
import express from 'express'
import nano from 'nano'

import config from '../config.json'
import { asDbTx } from './types'

const asReq = asObject({
  pluginId: asString,
  orderId: asString
})

const nanoDb = nano(config.couchDbFullpath)

async function main(): Promise<void> {
  // start express and couch db server
  const app = express()
  const dbTransactions = nanoDb.use('db_transactions')

  app.use(bodyParser.json({ limit: '1mb' }))
  app.use(cors())

  app.get('/v1/checkTx/', async function(req, res) {
    console.log('req.query', req.query)
    let queryResult
    try {
      queryResult = asReq(req.query)
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
