import { asObject, asOptional, asString } from 'cleaners'
import Router from 'express-promise-router'

import { reportsApps } from '../../indexApi'
import { validateApiKey } from '../../util/validateApiKey'

const asPluginIdsReq = asObject({
  apiKey: asString
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

  // Validate API key and get appId
  let appId: string
  try {
    appId = await validateApiKey(queryResult.apiKey)
  } catch {
    res.status(401).send(`Invalid API Key`)
    return
  }

  const query = {
    selector: {
      appId: { $eq: appId.toLowerCase() }
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
