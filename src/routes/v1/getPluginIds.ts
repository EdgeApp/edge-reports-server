import { asObject, asOptional, asString } from 'cleaners'
import Router from 'express-promise-router'

import { reportsApps } from '../../indexApi'

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

export const getPluginIdsRouter = Router()

getPluginIdsRouter.get('/', async function(req, res) {
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
