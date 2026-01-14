import { asDate, asMaybe, asObject } from 'cleaners'
import Router from 'express-promise-router'

import { reportsTransactions } from '../../indexApi'
import { asDbTx, DbTx, Status } from '../../types'
import { prefixToRange } from '../../util/addressHash'
import { EdgeTokenId } from '../../util/asEdgeTokenId'
import { asHex } from '../../util/asHex'
import { HttpError } from '../../util/httpErrors'
import { trial } from '../../util/trail'

const asGetTxInfoReq = asObject({
  /**
   * Hex prefix of the SHA256 hash of the payout address.
   * Length must match the server's required prefix length.
   */
  addressHashPrefix: asHex,

  /**
   * ISO date string to start searching for transactions.
   */
  startIsoDate: asDate,

  /**
   * ISO date string to end searching for transactions.
   */
  endIsoDate: asDate
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

  const { addressHashPrefix, startIsoDate, endIsoDate } = query

  const startIsoString = startIsoDate.toISOString()
  const endIsoString = endIsoDate.toISOString()

  // Validate prefix length matches required length
  const requiredPrefixLength = await getRequiredPrefixLength(
    startIsoString,
    endIsoString
  )
  if (addressHashPrefix.length !== requiredPrefixLength) {
    res.status(400).send({
      error: `addressHashPrefix must be exactly ${requiredPrefixLength} characters for this date range`
    })
    return
  }

  // Convert prefix to exact hash range boundaries
  const { startHash, endHash } = prefixToRange(addressHashPrefix.toLowerCase())

  // Mango query with range on hash prefix AND date
  const mangoQuery = {
    selector: {
      payoutAddressHash: {
        $gte: startHash,
        $lte: endHash
      },
      isoDate: {
        $gte: startIsoString,
        $lte: endIsoString
      }
    },
    use_index: 'payoutaddresshash-isodate',
    limit: 1000
  }

  const results: any = await reportsTransactions.find(mangoQuery)
  const rows = results.docs
    .map((doc: any) => asMaybe(asDbTx)(doc))
    .filter((item: DbTx | undefined): item is DbTx => item != null)

  const txs: TxInfo[] = rows.map((row: DbTx) => ({
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

/**
 * Calculate the required prefix length based on date range.
 * This is a placeholder - implement your heuristic here.
 */
async function getRequiredPrefixLength(
  startIsoDate: string,
  endIsoDate: string
): Promise<number> {
  // TODO: Implement actual heuristic based on avg tx/minute
  // For now, return a fixed value
  return 8
}
