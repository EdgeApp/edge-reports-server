import { asObject, asOptional, asString } from 'cleaners'
import Router from 'express-promise-router'

import { revolut } from '../../partners/revolut'

const asRevolutQueryReq = asObject({
  appId: asString
})
const asRevolutConfigDbReq = asObject({
  revolutApiKey: asObject(
    asObject({
      apiKey: asString
    })
  )
})

export const revolutRouter = Router()

revolutRouter.get('/', async function(req, res) {
  let queryResult
  try {
    queryResult = asRevolutQueryReq(req.query)
  } catch (e) {
    res.status(400).send(`Missing Request fields.`)
    return
  }

  const query = {
    selector: {
      appId: { $eq: queryResult.appId.toLowerCase() }
    },
    fields: ['revolutApiKey'],
    limit: 1
  }
  let config
  try {
    const rawApp = await revolut.queryFunc(query)
    const app = asRevolutConfigDbReq(rawApp.docs[0])

    // Get API key from app config
    config = {
      revolutApiKey: app.revolutApiKey?.apiKey || ''
    }
  } catch (e) {
    res.status(404).send(`App ID not found.`)
    return
  }

  // Query Revolut transactions with config
  const result = await revolut.queryFunc({
    ...query,
    settings: config
  })

  res.json(result)
})
