import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch'

import { config } from './config'

export const SIX_DAYS = 6

const CURRENCY_CONVERSION = {
  AWCBEP20: 'AWC',
  AWCBSC: 'AWC',
  DAIMATIC: 'DAI',
  ETHOP: 'ETH',
  WBTCMATIC: 'WBTC',
  USDCERC20: 'USDC',
  USDT20: 'USDT',
  USDTERC20: 'USDT',
  USDTPOLYGON: 'USDT',
  USDCPOLYGON: 'USDC',
  USDCTRC20: 'USDC',
  USDTTRC20: 'USDT',
  ZADDR: 'ZEC',
  BCHABC: 'BCH',
  BCHSV: 'BSV',
  FTMMAINNET: 'FTM',
  BNBMAINNET: 'BNB',
  AVAXC: 'AVAX',
  POLYGON: 'MATIC'
}

export const standardizeNames = (field: string): string => {
  if (CURRENCY_CONVERSION[field] !== undefined) {
    return CURRENCY_CONVERSION[field]
  }
  return field
}

export const promiseTimeout = async <T>(
  msg: string,
  p: Promise<T>
): Promise<T> => {
  const timeoutMins = config.timeoutOverrideMins ?? 5
  return await new Promise((resolve, reject) => {
    datelog('STARTING', msg)
    setTimeout(() => reject(new Error(`Timeout: ${msg}`)), 60000 * timeoutMins)
    p.then(v => resolve(v)).catch(e => reject(e))
  })
}

export const smartIsoDateFromTimestamp = (
  timestamp: number | string
): { timestamp: number; isoDate } => {
  if (typeof timestamp === 'string') {
    timestamp = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z'
    const date = new Date(timestamp)
    return {
      timestamp: date.getTime() / 1000,
      isoDate: date.toISOString()
    }
  } else {
    if (timestamp > 9999999999) {
      timestamp = timestamp / 1000
    }
    return {
      timestamp,
      isoDate: new Date(timestamp * 1000).toISOString()
    }
  }
}

export const datelog = function(...args: any): void {
  const date = new Date().toISOString()
  console.log(date, ...args)
}

export const snoozeReject = async (ms: number): Promise<void> =>
  await new Promise((resolve: Function, reject: Function) =>
    setTimeout(reject, ms)
  )

export const snooze = async (ms: number): Promise<void> =>
  await new Promise((resolve: Function) => setTimeout(resolve, ms))

export const retryFetch = async (
  request: RequestInfo,
  init?: RequestInit,
  maxRetries: number = 5
): Promise<Response> => {
  let retries = 0
  let err: any

  while (retries++ < maxRetries) {
    try {
      const response = await fetch(request, init)
      return response
    } catch (e) {
      err = e
      if (err.code.includes('ETIMEDOUT') === false) {
        throw err
      }
      await snooze(5000 * retries)
    }
  }
  throw err
}

export const getStartOfMonthsAgo = (
  dateString: string,
  months: number
): Date => {
  const date = new Date(dateString)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()

  return new Date(Date.UTC(year, month - months, 1))
}

export const getStartOfMonthsFromNow = (
  dateString: string,
  months: number
): Date => {
  const date = new Date(dateString)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return new Date(Date.UTC(year, month + months, 1, 0, 0, 0, 0))
}
