import { asMaybe, asValue } from 'cleaners'

import {
  AlertType,
  HealthAlert,
  HealthReport,
  WindowComparison,
  WindowName
} from './healthMetrics'

const asErrorClass = asValue(
  'authExpired',
  'rateLimited',
  'schemaChanged',
  'partnerOutage',
  'network',
  'unknown'
)

export type ErrorClass = ReturnType<typeof asErrorClass>

interface ErrorClassInfo {
  label: string
  /** When the class applies, used as the Jev choice description */
  description: string
  action: string
}

export const ERROR_CLASSES: { [errorClass in ErrorClass]: ErrorClassInfo } = {
  authExpired: {
    label: 'auth expired',
    description:
      'The partner rejected our credentials: HTTP 401 or 403, invalid, expired or revoked API key, signature or permission errors.',
    action: 'Renew or rotate the partner API key in reports_apps.'
  },
  rateLimited: {
    label: 'rate limited',
    description:
      'The partner throttled us: HTTP 429, too many requests, quota or rate limit exceeded.',
    action:
      'Reduce query frequency or ask the partner for a higher rate limit, then confirm the next cycles pass.'
  },
  schemaChanged: {
    label: 'schema changed',
    description:
      'The partner answered but the response no longer matches what the plugin expects: cleaner or validation errors, missing or renamed fields, unexpected types, JSON parse errors.',
    action:
      'Update the partner plugin cleaner in src/partners to the new response shape.'
  },
  partnerOutage: {
    label: 'partner outage',
    description:
      'The partner service itself is failing: HTTP 5xx, maintenance, service unavailable, internal server error.',
    action:
      'Check the partner status page or contact the partner; no code change until their API recovers.'
  },
  network: {
    label: 'network',
    description:
      'The request never got a partner answer: DNS failure, connection refused or reset, TLS or certificate errors, socket hang up, request or promise timeouts.',
    action:
      'Check DNS, TLS and connectivity from the reports host to the partner API.'
  },
  unknown: {
    label: 'unknown',
    description:
      'None of the other classes fit, or the error text is too vague to tell.',
    action: 'Read the full error in the reportsQuery pm2 log and triage.'
  }
}

/** Error class label used when Jev gave no answer */
export const UNCLASSIFIED_LABEL = 'unknown (unclassified)'

const ALERT_TYPE_LABELS: { [type in AlertType]: string } = {
  queryErrors: 'query errors',
  missingProvider: 'missing provider',
  missingVolume: 'missing volume',
  chainQuiet: 'chain quiet'
}

/** The full plain-text summary */
export function formatSummary(report: HealthReport): string {
  const lines: string[] = []
  lines.push(`Edge reports health check, ${report.nowIsoDate}`)
  lines.push(
    `Windows 24h and 7d against the trailing ${report.baselineWeeks}-week baseline (baseline scaled to the window length). Orders are completed orders.`
  )
  lines.push(
    `${report.alerts.length} alerts, ${report.providers.length} providers checked, ${report.chains.length} chains checked, ${report.skipped.length} skipped.`
  )

  lines.push('', 'ALERTS')
  if (report.alerts.length === 0) lines.push('None.')
  report.alerts.forEach((alert, index) => {
    lines.push(`${index + 1}. ${formatAlertLine(alert, report.alerts)}`)
  })

  lines.push('', 'PROVIDERS')
  lines.push(
    ...formatTable(
      [
        'app/partner',
        '24h orders',
        '24h USD',
        '7d orders',
        '7d USD',
        'recent cycles'
      ],
      report.providers.map(provider => [
        `${provider.appId}/${provider.partnerId}`,
        ...windowCells(provider.windows),
        provider.statusCycles.length === 0
          ? 'no status history'
          : provider.statusCycles
              .slice(-report.statusCyclesShown)
              .map(cycle => (cycle.result === 'success' ? 'ok' : cycle.result))
              .join(' ')
      ])
    )
  )
  for (const provider of report.providers) {
    const lastCycle = provider.statusCycles[provider.statusCycles.length - 1]
    if (lastCycle != null && lastCycle.result !== 'success') {
      lines.push(
        `  ${provider.appId}/${provider.partnerId} last status (${
          lastCycle.isoDate
        }): ${truncate(lastCycle.status, 200)}`
      )
    }
  }

  lines.push('', 'CHAINS')
  lines.push(
    `Orders with no chain pluginId, not counted toward any chain: ${report.unmappedChainOrders
      .map(
        (comparison, index) =>
          `${comparison.window} ${comparison.observed.orders} of ${report
            .allOrders[index]?.observed.orders ?? 0}`
      )
      .join(', ')}.`
  )
  lines.push(
    ...formatTable(
      [
        'chain',
        '24h orders',
        '24h USD',
        '7d orders',
        '7d USD',
        'providers checked'
      ],
      report.chains.map(chain => {
        const weekProviders = chain.providers.find(
          entry => entry.window === '7d'
        )
        return [
          chain.chainPluginId,
          ...windowCells(chain.windows),
          weekProviders == null
            ? '0'
            : `${weekProviders.supporting.length} (${weekProviders.healthy.length} healthy)`
        ]
      })
    )
  )

  lines.push('', 'SKIPPED (not queried by the engine)')
  if (report.skipped.length === 0) lines.push('None.')
  for (const skipped of report.skipped) {
    lines.push(`${skipped.appId}/${skipped.partnerId}: ${skipped.reason}`)
  }

  return lines.join('\n') + '\n'
}

/**
 * One alert on one line: type, provider or chain, app, window, observed vs
 * baseline, error class, overlap notes and a suggested action.
 */
export function formatAlertLine(
  alert: HealthAlert,
  allAlerts: HealthAlert[]
): string {
  const fields: string[] = [ALERT_TYPE_LABELS[alert.type]]
  if (alert.type === 'chainQuiet') {
    fields.push(`chain ${alert.chainPluginId ?? ''}`, 'app all')
  } else {
    fields.push(`provider ${alert.partnerId ?? ''}`, `app ${alert.appId ?? ''}`)
  }

  if (alert.type === 'queryErrors') {
    const streak = alert.errorStreak ?? 0
    fields.push(
      `window last ${streak} cycles`,
      `observed ${streak} consecutive failed cycles vs threshold ${alert.errorThreshold ??
        streak}`
    )
  } else if (alert.comparison != null) {
    fields.push(
      `window ${alert.window ?? ''}`,
      `observed ${formatStats(
        alert.comparison,
        'observed'
      )} vs baseline ${formatStats(alert.comparison, 'expected')}`
    )
  }
  if (alert.type === 'chainQuiet') {
    fields.push(
      `providers checked ${alert.providersChecked ??
        0} (${alert.healthyProviders ?? 0} healthy)`
    )
  }

  fields.push(`class ${alertClassLabel(alert, allAlerts)}`)
  if (alert.recentErrors != null && alert.recentErrors.length > 0) {
    fields.push(`last error: ${truncate(alert.recentErrors[0], 160)}`)
  }
  if (alert.likelyCauses.length > 0) {
    fields.push(`likely cause: ${alert.likelyCauses.join(', ')}`)
  }
  if (alert.affectsChains.length > 0) {
    fields.push(`affects chains: ${alert.affectsChains.join(', ')}`)
  }
  fields.push(`action: ${suggestedAction(alert, allAlerts)}`)
  return fields.join(' | ')
}

/** A one-line suggested action for an alert */
export function suggestedAction(
  alert: HealthAlert,
  allAlerts: HealthAlert[]
): string {
  const errorClass = parseErrorClass(alert.errorClass)
  switch (alert.type) {
    case 'queryErrors':
      return ERROR_CLASSES[errorClass ?? 'unknown'].action
    case 'missingProvider':
      return queryErrorsFor(alert, allAlerts) != null
        ? 'Fix the query errors for this partner first; no orders are stored while its query fails.'
        : 'Confirm the partner API still returns recent orders and the plugin progress cache is advancing.'
    case 'missingVolume':
      return queryErrorsFor(alert, allAlerts) != null
        ? 'Fix the query errors for this partner first; order statuses stop updating while its query fails.'
        : 'Check for orders stuck pending or missing usdValue (rates engine), then compare with the partner dashboard.'
    case 'chainQuiet':
      return alert.likelyCauses.length > 0
        ? `Start with the ${alert.likelyCauses.join(
            ', '
          )} alert; the chain drop likely follows from it.`
        : 'Check the chain network status and the Edge wallet plugin for this chain; its other providers look healthy.'
  }
}

/**
 * The error class shown on an alert: its own classification for query
 * errors, the partner's query error class for other provider alerts.
 */
function alertClassLabel(alert: HealthAlert, allAlerts: HealthAlert[]): string {
  const source =
    alert.type === 'queryErrors' ? alert : queryErrorsFor(alert, allAlerts)
  if (source == null) return 'n/a'
  const errorClass = parseErrorClass(source.errorClass)
  return errorClass == null
    ? UNCLASSIFIED_LABEL
    : ERROR_CLASSES[errorClass].label
}

function queryErrorsFor(
  alert: HealthAlert,
  allAlerts: HealthAlert[]
): HealthAlert | undefined {
  if (alert.type === 'chainQuiet' || alert.type === 'queryErrors') return
  return allAlerts.find(
    other =>
      other.type === 'queryErrors' &&
      other.appId === alert.appId &&
      other.partnerId === alert.partnerId
  )
}

export const parseErrorClass = (value?: string): ErrorClass | undefined =>
  asMaybe(asErrorClass)(value)

function windowCells(windows: WindowComparison[]): string[] {
  const cells: string[] = []
  for (const name of ['24h', '7d'] as WindowName[]) {
    const comparison = windows.find(entry => entry.window === name)
    if (comparison == null) {
      cells.push('-', '-')
      continue
    }
    cells.push(
      `${comparison.observed.orders} / ${formatOrders(
        comparison.expected.orders
      )}`,
      `${formatUsd(comparison.observed.usdVolume)} / ${formatUsd(
        comparison.expected.usdVolume
      )}`
    )
  }
  return cells
}

function formatStats(
  comparison: WindowComparison,
  which: 'observed' | 'expected'
): string {
  const stats = comparison[which]
  const orders =
    which === 'observed' ? String(stats.orders) : formatOrders(stats.orders)
  return `${orders} orders ${formatUsd(stats.usdVolume)}`
}

const formatOrders = (orders: number): string =>
  orders.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })

const formatUsd = (usd: number): string =>
  `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

const truncate = (text: string, length: number): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > length
    ? `${oneLine.slice(0, length - 3)}...`
    : oneLine
}

/** Left-aligned plain-text table with a header row */
function formatTable(header: string[], rows: string[][]): string[] {
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map(row => (row[column] ?? '').length))
  )
  const formatRow = (row: string[]): string =>
    row
      .map((cell, column) => cell.padEnd(widths[column]))
      .join('  ')
      .trimEnd()
  return [formatRow(header), ...rows.map(formatRow)]
}
