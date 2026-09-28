import { asArray, asObject, asOptional, asString, asValue } from 'cleaners'
import Router from 'express-promise-router'

import { reportsApps, reportsTransactions } from '../../indexApi'
import { asApps, StandardTx } from '../../types'
import { makeTxStore, resolveTxs } from '../../util/resolveConversions'

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
  const { appId, partnerIds } = searchedAppId
  try {
    const resolved = await resolveTxs(
      makeTxStore(reportsTransactions),
      appId,
      Object.keys(partnerIds),
      queryResult.data
    )
    const data: CheckTxsResponse[] = resolved.map((tx, index) => {
      const { pluginId, orderId } = queryResult.data[index]
      if (tx == null) {
        const key = `${appId}_${pluginId}:${orderId}`.toLowerCase()
        const txError: CheckTxsFailureResponse = {
          pluginId,
          orderId,
          error: `Could not find transaction: ${key}`
        }
        return txError
      }
      const { doc } = tx
      const usdValue = doc.usdValue >= 0 ? doc.usdValue : undefined
      if (params.info === 'all') {
        const fullTx: CheckTxsSuccessResponse = {
          pluginId,
          ...doc
        }
        fullTx.usdValue = usdValue
        return fullTx
      }
      const partialTx: CheckTxsPartialSuccessResponse = {
        pluginId,
        orderId,
        usdValue
      }
      return partialTx
    })
    res.json({ appId, data })
  } catch (e) {
    console.log(e)
    res.status(500).send(`Internal Server Error.`)
  }
})
