import { asArray, asObject, asOptional, asString, asValue } from 'cleaners'
import Router from 'express-promise-router'

import { reportsApps, reportsTransactions } from '../../indexApi'
import { asApps, asDbTx, StandardTx } from '../../types'

interface CheckTxsSuccessResponse
  extends Omit<StandardTx, 'rawTx' | 'usdValue'> {
  pluginId: string
  usdValue?: number
}

interface CheckTxsPartialSuccessResponse {
  pluginId: string
  orderId: string
  usdValue?: number
}

interface CheckTxsFailureResponse {
  pluginId: string
  orderId: string
  error: string
}

type CheckTxsResponse =
  | CheckTxsSuccessResponse
  | CheckTxsPartialSuccessResponse
  | CheckTxsFailureResponse

const asCheckTxsParams = asObject({
  info: asOptional(asValue('all'))
})

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
  let queryResult, params
  try {
    queryResult = asCheckTxsReq(req.body)
    params = asCheckTxsParams(req.query)
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
      const { doc } = result
      if (result.error != null || doc == null) {
        const txError: CheckTxsFailureResponse = {
          pluginId: queryResult.data[index].pluginId,
          orderId: queryResult.data[index].orderId,
          error: `Could not find transaction: ${result.key}`
        }
        return txError
      }
      const usdValue = doc.usdValue >= 0 ? doc.usdValue : undefined
      if (params.info === 'all') {
        const tx: CheckTxsSuccessResponse = {
          pluginId: queryResult.data[index].pluginId,
          ...doc
        }
        tx.usdValue = usdValue
        return tx
      }
      const tx: CheckTxsPartialSuccessResponse = {
        pluginId: queryResult.data[index].pluginId,
        orderId: queryResult.data[index].orderId,
        usdValue
      }
      return tx
    })
    res.json({ appId, data })
  } catch (e) {
    console.log(e)
    res.status(500).send(`Internal Server Error.`)
  }
})
