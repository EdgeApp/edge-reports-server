import { asMaybe, asNumber, asObject } from 'cleaners'
import nano from 'nano'

import { datelog } from '../util'
import {
  asStatusDoc,
  StatusCycle,
  StatusDoc,
  StatusResult
} from './healthCheckTypes'

const asCouchStatusError = asObject({ statusCode: asNumber })

/** Classifies a runPlugin status string */
export const statusResult = (status: string): StatusResult => {
  if (status.includes('Successful update')) return 'success'
  if (status.includes('Missing or disabled plugin')) return 'noPlugin'
  return 'error'
}

/** Appends a cycle to a status doc, keeping the newest maxLength cycles */
export const appendStatusCycle = (
  doc: StatusDoc,
  cycle: StatusCycle,
  maxLength: number
): StatusDoc => ({
  ...doc,
  cycles: [...doc.cycles, cycle].slice(-Math.max(1, maxLength))
})

/**
 * Records one query engine cycle for an app partner in reports_status.
 * Failures are logged and never thrown, so status tracking cannot break
 * the query loop.
 */
export async function recordPartnerStatus(
  dbStatus: nano.DocumentScope<unknown>,
  appPartnerId: string,
  status: string,
  maxLength: number
): Promise<void> {
  const cycle: StatusCycle = {
    isoDate: new Date().toISOString(),
    result: statusResult(status),
    status
  }
  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const existing = await dbStatus
        .get(appPartnerId)
        .then(raw => asStatusDoc(raw))
        .catch(
          (error: unknown): StatusDoc => {
            if (asMaybe(asCouchStatusError)(error)?.statusCode === 404) {
              return { _id: appPartnerId, _rev: undefined, cycles: [] }
            }
            throw error
          }
        )
      await dbStatus.insert(appendStatusCycle(existing, cycle, maxLength))
      return
    } catch (error) {
      const isConflict = asMaybe(asCouchStatusError)(error)?.statusCode === 409
      if (isConflict && attempt < maxAttempts) continue
      datelog(`[recordPartnerStatus] ${appPartnerId} failed:`, String(error))
      return
    }
  }
}
