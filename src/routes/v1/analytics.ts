import { asArray, asObject, asString } from 'cleaners'
import Router from 'express-promise-router'

import { cacheAnalytic } from '../../dbutils'

const asAnalyticsReq = asObject({
  start: asString,
  end: asString,
  appId: asString,
  pluginIds: asArray(asString),
  timePeriod: asString
})

export const analyticsRouter = Router()

analyticsRouter.post(`/`, async function(req, res) {
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
