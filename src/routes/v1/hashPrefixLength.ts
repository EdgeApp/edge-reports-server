import { asObject, asString } from 'cleaners'
import Router from 'express-promise-router'

import { reportsTransactions } from '../../indexApi'
import { HttpError } from '../../util/httpErrors'
import { trial } from '../../util/trail'

const asHashPrefixLengthReq = asObject({
  /**
   * ISO date string for the start of the query range.
   */
  startIsoDate: asString,

  /**
   * ISO date string for the end of the query range.
   */
  endIsoDate: asString
})

export const hashPrefixLengthRouter = Router()

// Target: each query should return approximately this many transactions on average
const TARGET_TX_PER_QUERY = 100

// SHA256 hex hash is 64 characters (256 bits)
const MAX_PREFIX_LENGTH = 64
const MIN_PREFIX_LENGTH = 4

hashPrefixLengthRouter.get('/', async function(req, res) {
  const query = trial(
    () => asHashPrefixLengthReq(req.query),
    error => {
      throw new HttpError(400, String(error))
    }
  )

  const { startIsoDate, endIsoDate } = query

  const startDate = new Date(startIsoDate)
  const endDate = new Date(endIsoDate)

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    res.status(400).send({ error: 'Invalid date format' })
    return
  }

  // Calculate minutes in range
  const rangeMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60)
  if (rangeMinutes <= 0) {
    res.status(400).send({ error: 'endIsoDate must be after startIsoDate' })
    return
  }

  // Get approximate transaction count in the date range
  const countQuery = {
    selector: {
      isoDate: {
        $gte: startDate.toISOString(),
        $lte: endDate.toISOString()
      }
    },
    fields: ['_id'],
    limit: 10000
  }

  const countResult: any = await reportsTransactions.find(countQuery)
  const txCount = countResult.docs.length

  // Calculate average transactions per minute
  const avgTxPerMinute = txCount / rangeMinutes

  // Total address space for SHA256 hex prefixes
  // Each hex char gives 16 possibilities, so n chars = 16^n addresses
  // We want: (total possible addresses) / (16^prefixLength) * avgTxPerMinute * rangeMinutes ≈ TARGET_TX_PER_QUERY
  //
  // Solving for prefixLength:
  // prefixLength = log16(txCount / TARGET_TX_PER_QUERY)

  let prefixLength: number
  if (txCount <= TARGET_TX_PER_QUERY) {
    prefixLength = MIN_PREFIX_LENGTH
  } else {
    // Calculate prefix length that would give us ~TARGET_TX_PER_QUERY results
    prefixLength = Math.ceil(
      Math.log(txCount / TARGET_TX_PER_QUERY) / Math.log(16)
    )
    prefixLength = Math.max(
      MIN_PREFIX_LENGTH,
      Math.min(MAX_PREFIX_LENGTH, prefixLength)
    )
  }

  res.send({
    prefixLength,
    startIsoDate: startDate.toISOString(),
    endIsoDate: endDate.toISOString(),
    estimatedTxCount: txCount,
    avgTxPerMinute: avgTxPerMinute.toFixed(2)
  })
})
