import { asArray, asObject, asOptional, asString } from 'cleaners'
import Router from 'express-promise-router'

import { reportsApps, reportsTransactions } from '../../indexApi'
import { asApps, asDbTx } from '../../types'

interface CheckTxsResponse {
  pluginId: string
  orderId: string
  error?: string
  usdValue?: number
}

const asCheckTxsFetch = asArray(
  asObject({
    key: asString,
    doc: asOptional(asDbTx),
    error: asOptional(asString)
  })
)

const asCheckTxsReq = asObject({
  apiKey: asString,
  data: asArray(
    asObject({
      pluginId: asString,
      orderId: asString
    })
  )
})

const CHECKTXS_BATCH_LIMIT = 100

export const checkTxsRouter = Router()

checkTxsRouter.post('/', async function(req, res) {
  let queryResult
  try {
    queryResult = asCheckTxsReq(req.body)
  } catch (e) {
    return res.status(400).send(`Missing Request fields.`)
  }
  if (queryResult.data.length > CHECKTXS_BATCH_LIMIT) {
    return res.status(400).send(`Exceeded Limit of ${CHECKTXS_BATCH_LIMIT}`)
  }

  const rawApps = await reportsApps.find({
    selector: {
      appId: { $exists: true }
    },
    limit: 1000000
  })
  const apps = asApps(rawApps.docs)

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
