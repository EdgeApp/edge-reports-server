import { asMaybe, asObject, asString } from 'cleaners'
import Router from 'express-promise-router'

import { reportsTransactions } from '../../indexApi'
import { asDbTx, DbTx, Status } from '../../types'
import { EdgeTokenId } from '../../util/asEdgeTokenId'
import { HttpError } from '../../util/httpErrors'
import { trial } from '../../util/trail'

const asGetTxInfoReq = asObject({
  /**
   * Prefix of the destination address.
   * Minimum 3 character; Maximum 5 characters.
   */
  addressPrefix: asString,

  /**
   * ISO date string to start searching for transactions.
   */
  startIsoDate: asString,

  /**
   * ISO date string to end searching for transactions.
   */
  endIsoDate: asString
})

interface TxInfo {
  providerId: string
  orderId: string
  isoDate: string
  sourceAmount: number // exchangeAmount units
  sourceCurrencyCode: string
  sourcePluginId?: string
  sourceTokenId?: EdgeTokenId
  status: Status
  destinationAddress?: string
  destinationAmount: number // exchangeAmount units
  destinationPluginId?: string
  destinationTokenId?: EdgeTokenId
}

export const getTxInfoRouter = Router()

getTxInfoRouter.get('/', async function(req, res) {
  const query = trial(
    () => asGetTxInfoReq(req.query),
    error => {
      throw new HttpError(400, String(error))
    }
  )

  if (query.addressPrefix.length < 3) {
    res.status(400).send('addressPrefix must be at least 3 characters')
    return
  }

  const startDate = new Date(query.startIsoDate)
  const endDate = new Date(query.endIsoDate)

  const addressKey = query.addressPrefix.slice(
    0,
    Math.min(query.addressPrefix.length, 5)
  )

  const results = await reportsTransactions.find({
    selector: {
      payoutAddress: {
        $gte: addressKey,
        $lte: addressKey + '\uffff'
      },
      isoDate: {
        $gte: startDate.toISOString(),
        $lte: endDate.toISOString()
      }
    }
  })

  const rows = results.docs
    .map(doc => asMaybe(asDbTx)(doc))
    .filter((item): item is DbTx => item != null)

  const txs: TxInfo[] = rows.map(row => ({
    providerId: getProviderId(row),
    orderId: row.orderId,
    isoDate: row.isoDate,
    sourceAmount: row.depositAmount,
    sourceCurrencyCode: row.depositCurrency,
    status: row.status,
    // TODO: Infer the pluginId and tokenId from the document:
    // sourcePluginId?: string,
    // sourceTokenId?: EdgeTokenId,
    destinationAddress: row.payoutAddress,
    destinationAmount: row.payoutAmount
    // TODO: Infer the pluginId and tokenId from the document:
    // destinationPluginId?: string
    // destinationTokenId?: EdgeTokenId
  }))

  res.send({
    txs
  })
})

/*
Returns the providerId from the document id.
For example: edge_switchain:<orderId> -> switchain
*/
function getProviderId(row: DbTx): string {
  return row._id?.split(':')[0].split('_')[1] ?? ''
}
