import { asObject, asString } from 'cleaners'
import Router from 'express-promise-router'

import { reportsApps } from '../../indexApi'

const asAppIdReq = asObject({
  apiKey: asString
})
const asAppIdDbReq = asObject({
  appId: asString
})

export const getAppIdRouter = Router()

getAppIdRouter.get('/', async function(req, res) {
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
