import { asMaybe, asObject, asString } from 'cleaners'
import Router from 'express-promise-router'

import { reportsTransactions } from '../../indexApi'
import { asDbTx, DbTx, Status } from '../../types'
import { EdgeTokenId } from '../../util/asEdgeTokenId'
import { asNumberString } from '../../util/asNumberString'
import { HttpError } from '../../util/httpErrors'
import { trial } from '../../util/trail'

const asGetTxInfoReq = asObject({
  /**
   * Prefix of the destination address.
   * Minimum 3 character; Maximum 5 characters.
   */
  addressHashfix: asNumberString,

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
  isoDate: string
  swapInfo: SwapInfo

  deposit: AssetInfo
  payout: AssetInfo
}

interface AssetInfo {
  address: string
  pluginId: string
  tokenId: EdgeTokenId
  amount: number
}

interface SwapInfo {
  orderId: string
  pluginId: string
  status: Status
}

export const getTxInfoRouter = Router()

getTxInfoRouter.get('/', async function(req, res) {
  const query = trial(
    () => asGetTxInfoReq(req.query),
    error => {
      throw new HttpError(400, String(error))
    }
  )

  if (query.addressHashfix < 0 || query.addressHashfix > 2 ** 40) {
    res.status(400).send('addressHashfix must be between 0 and 2^40')
    return
  }

  const startDate = new Date(query.startIsoDate)
  const endDate = new Date(query.endIsoDate)
  const startKey = [query.addressHashfix, startDate.toISOString()]
  const endKey = [query.addressHashfix, endDate.toISOString()]

  const results = await reportsTransactions.view(
    'getTxInfo',
    'payoutHashfixByDate',
    {
      start_key: startKey,
      end_key: endKey,
      inclusive_end: true,
      include_docs: true
    }
  )

  const rows = results.rows
    .map(row => asMaybe(asDbTx)(row.doc))
    .filter((item): item is DbTx => item != null)

  const txs: TxInfo[] = rows.map(row => {
    const swapInfo = getSwapInfo(row)

    const deposit: AssetInfo = {
      // TODO: Remove empty strings after db migration
      address: row.depositAddress ?? '',
      pluginId: '',
      tokenId: '',
      amount: row.depositAmount
    }

    const payout: AssetInfo = {
      // TODO: Remove empty strings after db migration
      address: row.payoutAddress ?? '',
      pluginId: '',
      tokenId: '',
      amount: row.payoutAmount
    }

    const result: TxInfo = {
      swapInfo,
      deposit,
      payout,
      isoDate: row.isoDate
    }

    return result
  })

  res.send({
    txs
  })
})

/*
Returns the pluginId from the document id.
For example: edge_switchain:<orderId> -> switchain
*/
function getPluginId(row: DbTx): string {
  return row._id?.split(':')[0].split('_')[1] ?? ''
}

function getSwapInfo(row: DbTx): SwapInfo {
  const pluginId = getPluginId(row)
  const orderId = row.orderId
  const status = row.status

  return {
    orderId,
    pluginId,
    status
  }
}
