import {
  HealthCheckConfig,
  HealthDump,
  HealthThresholdOverrides,
  HealthThresholds,
  HealthTx,
  StatusCycle
} from './healthCheckTypes'

export type WindowName = '24h' | '7d'

export interface WindowSpec {
  name: WindowName
  ms: number
}

export interface WindowStats {
  orders: number
  usdVolume: number
}

/** Observed activity in a window against the trailing baseline */
export interface WindowComparison {
  window: WindowName
  observed: WindowStats
  /** Baseline period totals scaled to the window length */
  expected: WindowStats
  /** Raw totals over the whole baseline period */
  baselineTotal: WindowStats
}

export interface ProviderReport {
  appId: string
  partnerId: string
  pluginId: string
  appPartnerId: string
  windows: WindowComparison[]
  /** Status history, oldest first; empty when the engine recorded none */
  statusCycles: StatusCycle[]
  /** Number of consecutive failed cycles ending at the newest cycle */
  errorStreak: number
}

export interface ChainWindowProviders {
  window: WindowName
  /** Providers (`appId_partnerId`) with baseline orders on the chain */
  supporting: string[]
  /** Supporting providers with no provider alert in the window */
  healthy: string[]
  /**
   * Distinct pluginIds among the healthy providers, so one partner running
   * in several apps counts once toward the two healthy providers rule
   */
  healthyPlugins: number
}

export interface ChainReport {
  chainPluginId: string
  windows: WindowComparison[]
  providers: ChainWindowProviders[]
}

export interface SkippedPartner {
  appId: string
  partnerId: string
  reason: string
}

export type AlertType =
  | 'queryErrors'
  | 'missingProvider'
  | 'missingVolume'
  | 'chainQuiet'

export interface HealthAlert {
  /** Stable key, unique within one report */
  key: string
  type: AlertType
  appId?: string
  partnerId?: string
  pluginId?: string
  chainPluginId?: string
  window?: WindowName
  comparison?: WindowComparison
  errorStreak?: number
  /** Consecutive failed cycles needed to alert */
  errorThreshold?: number
  /** Newest failed status strings, newest first */
  recentErrors?: string[]
  providersChecked?: number
  healthyProviders?: number
  /** Chains whose alert coincides with this provider alert */
  affectsChains: string[]
  /** Provider alerts (`appId/partnerId`) that coincide with this chain alert */
  likelyCauses: string[]
  /** Error classification from Jev, set for query error alerts */
  errorClass?: string
  /** Urgency score from Jev, used to order alerts */
  urgency?: number
}

export interface HealthReport {
  nowIsoDate: string
  baselineWeeks: number
  statusCyclesShown: number
  providers: ProviderReport[]
  chains: ChainReport[]
  /** Orders with no chain pluginId, compared per window */
  unmappedChainOrders: WindowComparison[]
  /** All checked orders, compared per window */
  allOrders: WindowComparison[]
  skipped: SkippedPartner[]
  alerts: HealthAlert[]
}

/** A completed order reduced to what the window arithmetic needs */
export interface TimedTx {
  timeMs: number
  /** USD value counted toward volume, 0 when the value is unknown */
  volumeUsd: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export const HEALTH_WINDOWS: WindowSpec[] = [
  { name: '24h', ms: DAY_MS },
  { name: '7d', ms: WEEK_MS }
]

const ALERT_TYPE_RANK: { [type in AlertType]: number } = {
  queryErrors: 0,
  missingProvider: 1,
  missingVolume: 2,
  chainQuiet: 3
}

/**
 * Builds the health report: per-provider and per-chain window comparisons,
 * the skipped list, and the mechanical alerts in mechanical order.
 */
export function analyzeHealth(
  dump: HealthDump,
  config: HealthCheckConfig
): HealthReport {
  const nowMs = Date.parse(dump.nowIsoDate)
  const baselineMs = config.baselineWeeks * WEEK_MS
  const providers: ProviderReport[] = []
  const skipped: SkippedPartner[] = []
  const alerts: HealthAlert[] = []

  const chainTxs = new Map<string, TimedTx[]>()
  const chainProviderTimes = new Map<string, Map<string, number[]>>()
  const unmappedTxs: TimedTx[] = []
  const checkedTxs: TimedTx[] = []

  for (const app of dump.apps) {
    for (const partnerId of Object.keys(app.partnerIds)) {
      const pluginId = app.partnerIds[partnerId].pluginId ?? partnerId
      const reason = partnerSkipReason(dump, app.appId, partnerId, pluginId)
      if (reason != null) {
        skipped.push({ appId: app.appId, partnerId, reason })
        continue
      }

      const appPartnerId = `${app.appId}_${partnerId}`
      const rawTxs = dump.transactions[appPartnerId] ?? []
      const timedTxs: TimedTx[] = []
      for (const tx of rawTxs) {
        const timedTx = toTimedTx(tx)
        if (timedTx == null) continue
        timedTxs.push(timedTx)
        checkedTxs.push(timedTx)

        const chains = txChains(tx)
        if (chains.length === 0) unmappedTxs.push(timedTx)
        for (const chain of chains) {
          const txs = chainTxs.get(chain) ?? []
          txs.push(timedTx)
          chainTxs.set(chain, txs)
          const providerTimes =
            chainProviderTimes.get(chain) ?? new Map<string, number[]>()
          const times = providerTimes.get(appPartnerId) ?? []
          times.push(timedTx.timeMs)
          providerTimes.set(appPartnerId, times)
          chainProviderTimes.set(chain, providerTimes)
        }
      }

      const statusCycles = dump.statusHistory[appPartnerId] ?? []
      const provider: ProviderReport = {
        appId: app.appId,
        partnerId,
        pluginId,
        appPartnerId,
        windows: HEALTH_WINDOWS.map(window =>
          compareWindow(timedTxs, nowMs, window, baselineMs)
        ),
        statusCycles,
        errorStreak: errorStreak(statusCycles)
      }
      providers.push(provider)
      alerts.push(
        ...providerAlerts(
          provider,
          resolveThresholds(config, [
            config.partners[partnerId],
            config.partners[appPartnerId]
          ]),
          config.statusCyclesShown
        )
      )
    }
  }

  const providerPlugins = new Map<string, string>()
  for (const provider of providers) {
    providerPlugins.set(provider.appPartnerId, provider.pluginId)
  }
  const chains: ChainReport[] = []
  const sortedChains = [...chainTxs.keys()].sort((a, b) => a.localeCompare(b))
  for (const chainPluginId of sortedChains) {
    const providerTimes =
      chainProviderTimes.get(chainPluginId) ?? new Map<string, number[]>()
    const windows = HEALTH_WINDOWS.map(window =>
      compareWindow(
        chainTxs.get(chainPluginId) ?? [],
        nowMs,
        window,
        baselineMs
      )
    )
    const chainProviders = HEALTH_WINDOWS.map(window => {
      const supporting = supportingProviders(
        providerTimes,
        nowMs,
        window,
        baselineMs
      )
      const unhealthy = unhealthyProviders(alerts, window.name)
      const healthy = supporting.filter(id => !unhealthy.has(id))
      return {
        window: window.name,
        supporting,
        healthy,
        healthyPlugins: new Set(healthy.map(id => providerPlugins.get(id))).size
      }
    })
    const chain: ChainReport = {
      chainPluginId,
      windows,
      providers: chainProviders
    }
    chains.push(chain)
    alerts.push(
      ...chainAlerts(
        chain,
        resolveThresholds(config, [config.chains[chainPluginId]])
      )
    )
  }

  linkOverlaps(alerts, chains)

  return {
    nowIsoDate: dump.nowIsoDate,
    baselineWeeks: config.baselineWeeks,
    statusCyclesShown: config.statusCyclesShown,
    providers,
    chains,
    unmappedChainOrders: HEALTH_WINDOWS.map(window =>
      compareWindow(unmappedTxs, nowMs, window, baselineMs)
    ),
    allOrders: HEALTH_WINDOWS.map(window =>
      compareWindow(checkedTxs, nowMs, window, baselineMs)
    ),
    skipped,
    alerts: sortAlerts(alerts)
  }
}

/**
 * Compares the window ending at now against the baseline period ending at
 * the window start. The baseline totals are scaled by windowMs / baselineMs
 * to give the expected activity for one window.
 */
export function compareWindow(
  txs: TimedTx[],
  nowMs: number,
  window: WindowSpec,
  baselineMs: number
): WindowComparison {
  const windowStartMs = nowMs - window.ms
  const baselineStartMs = windowStartMs - baselineMs
  const observed: WindowStats = { orders: 0, usdVolume: 0 }
  const baselineTotal: WindowStats = { orders: 0, usdVolume: 0 }
  for (const tx of txs) {
    if (tx.timeMs >= windowStartMs && tx.timeMs <= nowMs) {
      observed.orders += 1
      observed.usdVolume += tx.volumeUsd
    } else if (tx.timeMs >= baselineStartMs && tx.timeMs < windowStartMs) {
      baselineTotal.orders += 1
      baselineTotal.usdVolume += tx.volumeUsd
    }
  }
  const scale = window.ms / baselineMs
  return {
    window: window.name,
    observed,
    expected: {
      orders: baselineTotal.orders * scale,
      usdVolume: baselineTotal.usdVolume * scale
    },
    baselineTotal
  }
}

/**
 * Mirrors the query engine's partner selection. Returns why the engine
 * does not query this partner, or undefined when it does.
 */
export function partnerSkipReason(
  dump: HealthDump,
  appId: string,
  partnerId: string,
  pluginId: string
): string | undefined {
  const { soloAppIds, soloPartnerIds, disablePartnerQuery } = dump
  if (soloAppIds != null && !soloAppIds.includes(appId)) {
    return 'app not in soloAppIds'
  }
  if (soloPartnerIds?.includes(partnerId) === true) return
  if (disablePartnerQuery.plugins[pluginId]) {
    return `plugin ${pluginId} disabled in disablePartnerQuery.plugins`
  }
  if (disablePartnerQuery.appPartners[`${appId}_${partnerId}`]) {
    return 'disabled in disablePartnerQuery.appPartners'
  }
  if (soloPartnerIds != null) return 'partner not in soloPartnerIds'
}

/** Merges threshold overrides over the configured defaults, later wins */
export function resolveThresholds(
  config: HealthCheckConfig,
  overrides: Array<HealthThresholdOverrides | undefined>
): HealthThresholds {
  const thresholds: HealthThresholds = {
    volumeFraction: config.volumeFraction,
    minBaselineOrders: config.minBaselineOrders,
    errorCycles: config.errorCycles,
    missingMinExpectedOrders: config.missingMinExpectedOrders
  }
  for (const override of overrides) {
    if (override == null) continue
    thresholds.volumeFraction =
      override.volumeFraction ?? thresholds.volumeFraction
    thresholds.minBaselineOrders =
      override.minBaselineOrders ?? thresholds.minBaselineOrders
    thresholds.errorCycles = override.errorCycles ?? thresholds.errorCycles
    thresholds.missingMinExpectedOrders =
      override.missingMinExpectedOrders ?? thresholds.missingMinExpectedOrders
  }
  return thresholds
}

/** Counts consecutive failed cycles ending at the newest cycle */
export function errorStreak(cycles: StatusCycle[]): number {
  let streak = 0
  for (let i = cycles.length - 1; i >= 0; i--) {
    if (cycles[i].result !== 'error') break
    streak++
  }
  return streak
}

function providerAlerts(
  provider: ProviderReport,
  thresholds: HealthThresholds,
  statusCyclesShown: number
): HealthAlert[] {
  const { appId, partnerId, pluginId, appPartnerId } = provider
  const alerts: HealthAlert[] = []

  if (provider.errorStreak >= thresholds.errorCycles) {
    alerts.push({
      key: `queryErrors:${appPartnerId}`,
      type: 'queryErrors',
      appId,
      partnerId,
      pluginId,
      errorStreak: provider.errorStreak,
      errorThreshold: thresholds.errorCycles,
      recentErrors: provider.statusCycles
        .filter(cycle => cycle.result === 'error')
        .slice(-statusCyclesShown)
        .map(cycle => cycle.status)
        .reverse(),
      affectsChains: [],
      likelyCauses: []
    })
  }

  for (const comparison of provider.windows) {
    const { observed, expected, window } = comparison
    const base = {
      appId,
      partnerId,
      pluginId,
      window,
      comparison,
      affectsChains: [],
      likelyCauses: []
    }
    if (
      observed.orders === 0 &&
      expected.orders > 0 &&
      expected.orders >= thresholds.missingMinExpectedOrders
    ) {
      alerts.push({
        ...base,
        key: `missingProvider:${appPartnerId}:${window}`,
        type: 'missingProvider'
      })
      continue
    }
    if (
      expected.orders >= thresholds.minBaselineOrders &&
      observed.usdVolume < thresholds.volumeFraction * expected.usdVolume
    ) {
      alerts.push({
        ...base,
        key: `missingVolume:${appPartnerId}:${window}`,
        type: 'missingVolume'
      })
    }
  }
  return alerts
}

function chainAlerts(
  chain: ChainReport,
  thresholds: HealthThresholds
): HealthAlert[] {
  const alerts: HealthAlert[] = []
  for (const comparison of chain.windows) {
    const { observed, expected, window } = comparison
    const providers = chain.providers.find(entry => entry.window === window)
    if (providers == null) continue
    const quiet =
      observed.usdVolume < thresholds.volumeFraction * expected.usdVolume ||
      observed.orders < thresholds.volumeFraction * expected.orders
    if (
      quiet &&
      expected.orders >= thresholds.minBaselineOrders &&
      providers.healthyPlugins >= 2
    ) {
      alerts.push({
        key: `chainQuiet:${chain.chainPluginId}:${window}`,
        type: 'chainQuiet',
        chainPluginId: chain.chainPluginId,
        window,
        comparison,
        providersChecked: providers.supporting.length,
        healthyProviders: providers.healthy.length,
        affectsChains: [],
        likelyCauses: []
      })
    }
  }
  return alerts
}

/**
 * Cross-links provider alerts with chain alerts in the same window when the
 * provider supports the chain. Query error alerts match every window.
 */
function linkOverlaps(alerts: HealthAlert[], chains: ChainReport[]): void {
  for (const chainAlert of alerts) {
    if (chainAlert.type !== 'chainQuiet') continue
    const chain = chains.find(
      entry => entry.chainPluginId === chainAlert.chainPluginId
    )
    const providers = chain?.providers.find(
      entry => entry.window === chainAlert.window
    )
    if (providers == null || chainAlert.chainPluginId == null) continue
    for (const providerAlert of alerts) {
      if (providerAlert.type === 'chainQuiet') continue
      const providerId = alertProviderId(providerAlert)
      if (providerId == null || !providers.supporting.includes(providerId)) {
        continue
      }
      if (
        providerAlert.type !== 'queryErrors' &&
        providerAlert.window !== chainAlert.window
      ) {
        continue
      }
      const providerName = `${providerAlert.appId ??
        ''}/${providerAlert.partnerId ?? ''}`
      if (!chainAlert.likelyCauses.includes(providerName)) {
        chainAlert.likelyCauses.push(providerName)
      }
      if (!providerAlert.affectsChains.includes(chainAlert.chainPluginId)) {
        providerAlert.affectsChains.push(chainAlert.chainPluginId)
      }
    }
  }
}

/**
 * Orders alerts by Jev urgency when present, then mechanically: alert type,
 * shorter window first, larger expected baseline first.
 */
export function sortAlerts(alerts: HealthAlert[]): HealthAlert[] {
  return [...alerts].sort((a, b) => {
    const urgencyDiff = (b.urgency ?? -1) - (a.urgency ?? -1)
    if (urgencyDiff !== 0) return urgencyDiff
    const typeDiff = ALERT_TYPE_RANK[a.type] - ALERT_TYPE_RANK[b.type]
    if (typeDiff !== 0) return typeDiff
    const windowDiff = windowRank(a.window) - windowRank(b.window)
    if (windowDiff !== 0) return windowDiff
    const expectedDiff =
      (b.comparison?.expected.orders ?? 0) -
      (a.comparison?.expected.orders ?? 0)
    if (expectedDiff !== 0) return expectedDiff
    return a.key.localeCompare(b.key)
  })
}

const windowRank = (window?: WindowName): number =>
  window == null ? -1 : HEALTH_WINDOWS.findIndex(spec => spec.name === window)

/** The `appId_partnerId` a provider alert belongs to */
const alertProviderId = (alert: HealthAlert): string | undefined =>
  alert.appId == null || alert.partnerId == null
    ? undefined
    : `${alert.appId}_${alert.partnerId}`

/** Providers with a provider alert that applies to the window */
function unhealthyProviders(
  alerts: HealthAlert[],
  window: WindowName
): Set<string> {
  const unhealthy = new Set<string>()
  for (const alert of alerts) {
    const providerId = alertProviderId(alert)
    if (providerId == null) continue
    if (alert.type === 'queryErrors' || alert.window === window) {
      unhealthy.add(providerId)
    }
  }
  return unhealthy
}

/** Providers with at least one order on the chain in the baseline */
function supportingProviders(
  providerTimes: Map<string, number[]>,
  nowMs: number,
  window: WindowSpec,
  baselineMs: number
): string[] {
  const windowStartMs = nowMs - window.ms
  const baselineStartMs = windowStartMs - baselineMs
  const supporting: string[] = []
  for (const [providerId, times] of providerTimes) {
    if (times.some(time => time >= baselineStartMs && time < windowStartMs)) {
      supporting.push(providerId)
    }
  }
  return supporting.sort((a, b) => a.localeCompare(b))
}

/**
 * Only completed orders count, matching the analytics cache. Expired and
 * pending quotes never carry a USD value and would swamp the order counts.
 */
function toTimedTx(tx: HealthTx): TimedTx | undefined {
  if (tx.status !== 'complete') return
  const timeMs = Date.parse(tx.isoDate)
  if (isNaN(timeMs)) return
  return { timeMs, volumeUsd: Math.max(tx.usdValue, 0) }
}

/** Distinct chain pluginIds on either side of an order */
export function txChains(tx: HealthTx): string[] {
  const chains = new Set<string>()
  if (tx.depositChainPluginId != null && tx.depositChainPluginId !== '') {
    chains.add(tx.depositChainPluginId)
  }
  if (tx.payoutChainPluginId != null && tx.payoutChainPluginId !== '') {
    chains.add(tx.payoutChainPluginId)
  }
  return [...chains]
}
