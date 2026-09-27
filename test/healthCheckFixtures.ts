import {
  asHealthCheckConfig,
  HealthApp,
  HealthDump,
  HealthTx,
  StatusCycle
} from '../src/healthCheck/healthCheckTypes'

export const NOW_ISO = '2026-09-01T00:00:00.000Z'
export const NOW_MS = Date.parse(NOW_ISO)
export const DAY_MS = 24 * 60 * 60 * 1000

export const defaultHealthConfig = asHealthCheckConfig({})

interface SpreadTxsOptions {
  count: number
  /** Start of the span, in days before now */
  fromDaysAgo: number
  /** End of the span, in days before now */
  toDaysAgo: number
  usdValue?: number
  status?: string
  depositChainPluginId?: string
  payoutChainPluginId?: string
}

/** Spreads count orders evenly over a span of days */
export function spreadTxs(options: SpreadTxsOptions): HealthTx[] {
  const {
    count,
    fromDaysAgo,
    toDaysAgo,
    usdValue = 100,
    status = 'complete',
    depositChainPluginId,
    payoutChainPluginId
  } = options
  const fromMs = NOW_MS - fromDaysAgo * DAY_MS
  const stepMs = ((fromDaysAgo - toDaysAgo) * DAY_MS) / count
  const txs: HealthTx[] = []
  for (let i = 0; i < count; i++) {
    txs.push({
      isoDate: new Date(fromMs + (i + 0.5) * stepMs).toISOString(),
      status,
      usdValue,
      depositChainPluginId,
      payoutChainPluginId
    })
  }
  return txs
}

/** Steady orders per day across the whole 7d window plus its baseline */
export const steadyTxs = (
  perDay: number,
  extra: Partial<SpreadTxsOptions> = {}
): HealthTx[] =>
  spreadTxs({ count: 63 * perDay, fromDaysAgo: 63, toDaysAgo: 0, ...extra })

export const makeApp = (
  appId: string,
  partners: { [partnerId: string]: string | undefined }
): HealthApp => {
  const partnerIds: HealthApp['partnerIds'] = {}
  for (const partnerId of Object.keys(partners)) {
    partnerIds[partnerId] = { pluginId: partners[partnerId] }
  }
  return { appId, partnerIds }
}

export const makeDump = (overrides: Partial<HealthDump>): HealthDump => ({
  nowIsoDate: NOW_ISO,
  apps: [],
  disablePartnerQuery: { plugins: {}, appPartners: {} },
  soloAppIds: null,
  soloPartnerIds: null,
  transactions: {},
  statusHistory: {},
  ...overrides
})

export const makeCycles = (
  results: Array<StatusCycle['result']>,
  partnerId: string
): StatusCycle[] =>
  results.map((result, index) => ({
    isoDate: new Date(
      NOW_MS - (results.length - index) * 60 * 60 * 1000
    ).toISOString(),
    result,
    status:
      result === 'success'
        ? `[runPlugin] ${partnerId} Successful update in 3 seconds.`
        : result === 'noPlugin'
        ? `[runPlugin] ${partnerId} Missing or disabled plugin`
        : `[runPlugin] ${partnerId} Error: Error: HTTP 429 Too Many Requests (cycle ${index})`
  }))
