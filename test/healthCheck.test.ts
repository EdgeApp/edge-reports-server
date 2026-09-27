import { expect } from 'chai'
import { spawnSync } from 'child_process'
import fs from 'fs'
import { describe, it } from 'mocha'
import os from 'os'
import path from 'path'

import {
  asHealthCheckConfig,
  StatusDoc
} from '../src/healthCheck/healthCheckTypes'
import { applyJev } from '../src/healthCheck/healthJev'
import {
  analyzeHealth,
  compareWindow,
  HEALTH_WINDOWS,
  HealthAlert,
  TimedTx
} from '../src/healthCheck/healthMetrics'
import { formatSummary } from '../src/healthCheck/healthSummary'
import {
  appendStatusCycle,
  statusResult
} from '../src/healthCheck/statusHistory'
import { JevFetch, makeJevClient } from '../src/util/jev'
import {
  DAY_MS,
  defaultHealthConfig,
  makeApp,
  makeCycles,
  makeDump,
  NOW_ISO,
  NOW_MS,
  spreadTxs,
  steadyTxs
} from './healthCheckFixtures'

const [DAY_WINDOW, WEEK_WINDOW] = HEALTH_WINDOWS
const BASELINE_MS = 56 * DAY_MS

const alertKeys = (alerts: HealthAlert[]): string[] =>
  alerts.map(alert => alert.key).sort((a, b) => a.localeCompare(b))

describe('healthCheck baseline arithmetic', () => {
  it('scales the 56-day baseline to the window length', () => {
    // One order a day across the 24h window and its baseline:
    const txs: TimedTx[] = []
    for (let day = 0; day < 57; day++) {
      txs.push({ timeMs: NOW_MS - (day + 0.5) * DAY_MS, volumeUsd: 10 })
    }
    const daily = compareWindow(txs, NOW_MS, DAY_WINDOW, BASELINE_MS)
    expect(daily.observed).deep.equals({ orders: 1, usdVolume: 10 })
    expect(daily.baselineTotal).deep.equals({ orders: 56, usdVolume: 560 })
    expect(daily.expected.orders).closeTo(1, 1e-9)
    expect(daily.expected.usdVolume).closeTo(10, 1e-9)

    const weekly = compareWindow(txs, NOW_MS, WEEK_WINDOW, BASELINE_MS)
    expect(weekly.observed.orders).equals(7)
    // The 7d baseline is days 7 through 63; only days 7 through 57 have data:
    expect(weekly.baselineTotal.orders).equals(50)
    expect(weekly.expected.orders).closeTo(50 / 8, 1e-9)
  })

  it('puts boundary orders in the right period', () => {
    const windowStartMs = NOW_MS - DAY_MS
    const baselineStartMs = windowStartMs - BASELINE_MS
    const txs: TimedTx[] = [
      { timeMs: NOW_MS, volumeUsd: 1 },
      { timeMs: windowStartMs, volumeUsd: 2 },
      { timeMs: windowStartMs - 1, volumeUsd: 4 },
      { timeMs: baselineStartMs, volumeUsd: 8 },
      { timeMs: baselineStartMs - 1, volumeUsd: 16 },
      { timeMs: NOW_MS + 1, volumeUsd: 32 }
    ]
    const comparison = compareWindow(txs, NOW_MS, DAY_WINDOW, BASELINE_MS)
    expect(comparison.observed).deep.equals({ orders: 2, usdVolume: 3 })
    expect(comparison.baselineTotal).deep.equals({ orders: 2, usdVolume: 12 })
  })

  it('counts only complete orders, with volume from positive USD values', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {
        edge_alpha: [
          ...spreadTxs({ count: 2, fromDaysAgo: 1, toDaysAgo: 0 }),
          ...spreadTxs({
            count: 2,
            fromDaysAgo: 1,
            toDaysAgo: 0,
            status: 'pending',
            usdValue: 500
          }),
          ...spreadTxs({
            count: 1,
            fromDaysAgo: 1,
            toDaysAgo: 0,
            usdValue: -1
          })
        ]
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(report.providers[0].windows[0].observed).deep.equals({
      orders: 3,
      usdVolume: 200
    })
  })
})

describe('healthCheck missing provider', () => {
  it('fires when a window has no orders against a nonzero baseline', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {
        edge_alpha: spreadTxs({ count: 248, fromDaysAgo: 63, toDaysAgo: 1 })
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(alertKeys(report.alerts)).deep.equals([
      'missingProvider:edge_alpha:24h'
    ])
    const [alert] = report.alerts
    expect(alert.comparison?.observed.orders).equals(0)
    expect(alert.comparison?.expected.orders).closeTo(4, 1e-9)
  })

  it('fires on any nonzero baseline by default', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {
        edge_alpha: spreadTxs({ count: 2, fromDaysAgo: 50, toDaysAgo: 40 })
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(report.alerts.map(alert => [alert.type, alert.window])).deep.equals([
      ['missingProvider', '24h'],
      ['missingProvider', '7d']
    ])
  })

  it('stays quiet below a raised minimum of expected orders', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {
        edge_alpha: spreadTxs({ count: 2, fromDaysAgo: 50, toDaysAgo: 40 })
      }
    })
    const config = asHealthCheckConfig({
      partners: { alpha: { missingMinExpectedOrders: 1 } }
    })
    expect(analyzeHealth(dump, config).alerts).deep.equals([])
  })

  it('stays quiet when the baseline is empty', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {}
    })
    expect(analyzeHealth(dump, defaultHealthConfig).alerts).deep.equals([])
  })
})

describe('healthCheck missing volume', () => {
  it('fires when volume falls below the fraction of baseline', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {
        edge_alpha: [
          ...spreadTxs({ count: 672, fromDaysAgo: 63, toDaysAgo: 7 }),
          ...spreadTxs({
            count: 84,
            fromDaysAgo: 7,
            toDaysAgo: 0,
            usdValue: 10
          })
        ]
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(alertKeys(report.alerts)).deep.equals([
      'missingVolume:edge_alpha:24h',
      'missingVolume:edge_alpha:7d'
    ])
  })

  it('ignores expired quotes when gating on baseline orders', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {
        edge_alpha: [
          ...steadyTxs(20, { status: 'expired', usdValue: 0 }),
          ...spreadTxs({ count: 56, fromDaysAgo: 63, toDaysAgo: 7 }),
          ...spreadTxs({ count: 7, fromDaysAgo: 7, toDaysAgo: 0, usdValue: 1 })
        ]
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(report.alerts).deep.equals([])
  })

  it('needs at least 10 expected baseline orders', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {
        edge_alpha: [
          ...spreadTxs({ count: 56, fromDaysAgo: 63, toDaysAgo: 7 }),
          ...spreadTxs({ count: 7, fromDaysAgo: 7, toDaysAgo: 0, usdValue: 1 })
        ]
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(report.alerts).deep.equals([])
  })

  it('honors per-partner fraction overrides', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {
        edge_alpha: [
          ...spreadTxs({ count: 672, fromDaysAgo: 63, toDaysAgo: 7 }),
          ...spreadTxs({
            count: 84,
            fromDaysAgo: 7,
            toDaysAgo: 0,
            usdValue: 10
          })
        ]
      }
    })
    const config = asHealthCheckConfig({
      partners: { edge_alpha: { volumeFraction: 0.05 } }
    })
    expect(analyzeHealth(dump, config).alerts).deep.equals([])
  })
})

describe('healthCheck query errors', () => {
  const makeErrorDump = (
    results: Array<'success' | 'error' | 'noPlugin'>
  ): ReturnType<typeof makeDump> =>
    makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: { edge_alpha: steadyTxs(4) },
      statusHistory: { edge_alpha: makeCycles(results, 'alpha') }
    })

  it('fires after 3 consecutive failed cycles', () => {
    const report = analyzeHealth(
      makeErrorDump(['success', 'error', 'error', 'error']),
      defaultHealthConfig
    )
    expect(alertKeys(report.alerts)).deep.equals(['queryErrors:edge_alpha'])
    const [alert] = report.alerts
    expect(alert.errorStreak).equals(3)
    expect(alert.recentErrors?.[0]).contains('(cycle 3)')
  })

  it('does not fire when a success breaks the streak', () => {
    const report = analyzeHealth(
      makeErrorDump(['error', 'error', 'success', 'error', 'error']),
      defaultHealthConfig
    )
    expect(report.alerts).deep.equals([])
  })

  it('does not count missing-plugin cycles as errors', () => {
    const report = analyzeHealth(
      makeErrorDump(['noPlugin', 'noPlugin', 'noPlugin', 'noPlugin']),
      defaultHealthConfig
    )
    expect(report.alerts).deep.equals([])
  })

  it('honors per-partner cycle overrides', () => {
    const config = asHealthCheckConfig({
      partners: { alpha: { errorCycles: 2 } }
    })
    const report = analyzeHealth(
      makeErrorDump(['success', 'error', 'error']),
      config
    )
    expect(alertKeys(report.alerts)).deep.equals(['queryErrors:edge_alpha'])
  })
})

describe('healthCheck skipped partners', () => {
  it('mirrors the query engine selection and lists skipped partners', () => {
    const dump = makeDump({
      apps: [
        makeApp('edge', {
          alpha: undefined,
          banxa2: 'banxa',
          gamma: undefined
        }),
        makeApp('other', { alpha: undefined })
      ],
      disablePartnerQuery: {
        plugins: { banxa: true },
        appPartners: { edge_gamma: true }
      },
      soloAppIds: ['edge'],
      // Nothing stored lately for any of them:
      transactions: {
        edge_banxa2: spreadTxs({ count: 100, fromDaysAgo: 60, toDaysAgo: 8 }),
        edge_gamma: spreadTxs({ count: 100, fromDaysAgo: 60, toDaysAgo: 8 })
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(
      report.providers.map(provider => provider.appPartnerId)
    ).deep.equals(['edge_alpha'])
    expect(report.skipped).deep.equals([
      {
        appId: 'edge',
        partnerId: 'banxa2',
        reason: 'plugin banxa disabled in disablePartnerQuery.plugins'
      },
      {
        appId: 'edge',
        partnerId: 'gamma',
        reason: 'disabled in disablePartnerQuery.appPartners'
      },
      { appId: 'other', partnerId: 'alpha', reason: 'app not in soloAppIds' }
    ])
    expect(report.alerts).deep.equals([])
  })
})

describe('healthCheck chain quiet', () => {
  it('fires when a chain drops while its providers stay healthy', () => {
    const providerTxs = (): ReturnType<typeof spreadTxs> => [
      ...steadyTxs(10, { depositChainPluginId: 'bitcoin' }),
      ...spreadTxs({
        count: 56,
        fromDaysAgo: 63,
        toDaysAgo: 7,
        usdValue: 10,
        payoutChainPluginId: 'zano'
      })
    ]
    const dump = makeDump({
      apps: [
        makeApp('edge', { alpha: undefined, beta: undefined, gamma: undefined })
      ],
      transactions: {
        edge_alpha: providerTxs(),
        edge_beta: providerTxs(),
        edge_gamma: providerTxs()
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    // 24h expects only 3 zano orders, below the 10-order minimum:
    expect(alertKeys(report.alerts)).deep.equals(['chainQuiet:zano:7d'])
    const [alert] = report.alerts
    expect(alert.providersChecked).equals(3)
    expect(alert.healthyProviders).equals(3)
    expect(alert.likelyCauses).deep.equals([])
    expect(alert.comparison?.observed.orders).equals(0)
    expect(alert.comparison?.expected.orders).closeTo(21, 1e-9)
  })

  it('needs at least two otherwise healthy providers', () => {
    const dump = makeDump({
      apps: [makeApp('edge', { alpha: undefined })],
      transactions: {
        edge_alpha: [
          ...steadyTxs(10, { depositChainPluginId: 'bitcoin' }),
          ...spreadTxs({
            count: 168,
            fromDaysAgo: 63,
            toDaysAgo: 7,
            usdValue: 10,
            payoutChainPluginId: 'zano'
          })
        ]
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(report.alerts).deep.equals([])
    const zano = report.chains.find(chain => chain.chainPluginId === 'zano')
    expect(zano?.providers[1].supporting).deep.equals(['edge_alpha'])
  })

  it('counts one partner in several apps as one healthy provider', () => {
    const providerTxs = (): ReturnType<typeof spreadTxs> => [
      ...steadyTxs(10, { depositChainPluginId: 'bitcoin' }),
      ...spreadTxs({
        count: 84,
        fromDaysAgo: 63,
        toDaysAgo: 7,
        usdValue: 10,
        payoutChainPluginId: 'zano'
      })
    ]
    const dump = makeDump({
      apps: [
        makeApp('edge', { alpha: undefined }),
        makeApp('coinhub', { alpha: undefined })
      ],
      transactions: {
        edge_alpha: providerTxs(),
        coinhub_alpha: providerTxs()
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(report.alerts).deep.equals([])
    const zano = report.chains.find(chain => chain.chainPluginId === 'zano')
    expect(zano?.providers[1].supporting).deep.equals([
      'coinhub_alpha',
      'edge_alpha'
    ])
    expect(zano?.providers[1].healthyPlugins).equals(1)
  })

  it('lists a coinciding provider as the likely cause', () => {
    const dump = makeDump({
      apps: [
        makeApp('edge', { alpha: undefined, beta: undefined, gamma: undefined })
      ],
      transactions: {
        // The main zano provider stops storing orders a week ago:
        edge_alpha: spreadTxs({
          count: 560,
          fromDaysAgo: 63,
          toDaysAgo: 7,
          payoutChainPluginId: 'zano'
        }),
        edge_beta: [
          ...steadyTxs(10, { depositChainPluginId: 'bitcoin' }),
          ...steadyTxs(1, { usdValue: 10, payoutChainPluginId: 'zano' })
        ],
        edge_gamma: [
          ...steadyTxs(10, { depositChainPluginId: 'bitcoin' }),
          ...steadyTxs(1, { usdValue: 10, payoutChainPluginId: 'zano' })
        ]
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(alertKeys(report.alerts)).deep.equals([
      'chainQuiet:zano:24h',
      'chainQuiet:zano:7d',
      'missingProvider:edge_alpha:24h',
      'missingProvider:edge_alpha:7d'
    ])
    const chainAlert = report.alerts.find(
      alert => alert.key === 'chainQuiet:zano:7d'
    )
    expect(chainAlert?.likelyCauses).deep.equals(['edge/alpha'])
    expect(chainAlert?.providersChecked).equals(3)
    expect(chainAlert?.healthyProviders).equals(2)
    const providerAlert = report.alerts.find(
      alert => alert.key === 'missingProvider:edge_alpha:7d'
    )
    expect(providerAlert?.affectsChains).deep.equals(['zano'])

    const summary = formatSummary(report)
    expect(summary).contains('likely cause: edge/alpha')
    expect(summary).contains('affects chains: zano')
  })

  it('keeps a sibling app with the same plugin out of the overlap', () => {
    const dump = makeDump({
      apps: [
        makeApp('edge', {
          alpha: undefined,
          beta: undefined,
          gamma: undefined
        }),
        makeApp('coinhub', { alpha: undefined })
      ],
      transactions: {
        edge_alpha: spreadTxs({
          count: 560,
          fromDaysAgo: 63,
          toDaysAgo: 7,
          payoutChainPluginId: 'zano'
        }),
        edge_beta: [
          ...steadyTxs(10, { depositChainPluginId: 'bitcoin' }),
          ...steadyTxs(1, { usdValue: 10, payoutChainPluginId: 'zano' })
        ],
        edge_gamma: [
          ...steadyTxs(10, { depositChainPluginId: 'bitcoin' }),
          ...steadyTxs(1, { usdValue: 10, payoutChainPluginId: 'zano' })
        ],
        // The same partner in another app never served zano and also stops:
        coinhub_alpha: spreadTxs({
          count: 560,
          fromDaysAgo: 63,
          toDaysAgo: 7,
          depositChainPluginId: 'monero'
        })
      }
    })
    const report = analyzeHealth(dump, defaultHealthConfig)
    expect(alertKeys(report.alerts)).deep.equals([
      'chainQuiet:zano:24h',
      'chainQuiet:zano:7d',
      'missingProvider:coinhub_alpha:24h',
      'missingProvider:coinhub_alpha:7d',
      'missingProvider:edge_alpha:24h',
      'missingProvider:edge_alpha:7d'
    ])
    const chainAlert = report.alerts.find(
      alert => alert.key === 'chainQuiet:zano:7d'
    )
    expect(chainAlert?.likelyCauses).deep.equals(['edge/alpha'])
    expect(chainAlert?.healthyProviders).equals(2)
    const siblingAlert = report.alerts.find(
      alert => alert.key === 'missingProvider:coinhub_alpha:7d'
    )
    expect(siblingAlert?.affectsChains).deep.equals([])
  })
})

describe('healthCheck summary', () => {
  const dump = makeDump({
    apps: [
      makeApp('edge', { alpha: undefined, beta: undefined, banxa: undefined })
    ],
    disablePartnerQuery: { plugins: { banxa: true }, appPartners: {} },
    transactions: {
      edge_alpha: spreadTxs({ count: 248, fromDaysAgo: 63, toDaysAgo: 1 }),
      edge_beta: steadyTxs(4)
    },
    statusHistory: {
      edge_beta: makeCycles(['success', 'error', 'error', 'error'], 'beta')
    }
  })

  it('carries every field on each alert line', () => {
    const summary = formatSummary(analyzeHealth(dump, defaultHealthConfig))
    expect(summary).contains(
      '1. query errors | provider beta | app edge | window last 3 cycles | observed 3 consecutive failed cycles vs threshold 3 | class unknown (unclassified) | last error: [runPlugin] beta Error: Error: HTTP 429 Too Many Requests (cycle 3) | action: '
    )
    expect(summary).contains(
      '2. missing provider | provider alpha | app edge | window 24h | observed 0 orders $0 vs baseline 4.0 orders $400 | class n/a | action: '
    )
    expect(summary).contains('SKIPPED (not queried by the engine)')
    expect(summary).contains(
      'edge/banxa: plugin banxa disabled in disablePartnerQuery.plugins'
    )
    expect(summary).contains('CHAINS')
    expect(summary).not.match(/—/)
  })
})

describe('healthCheck Jev', () => {
  const dump = makeDump({
    apps: [makeApp('edge', { alpha: undefined, beta: undefined })],
    transactions: {
      edge_alpha: spreadTxs({ count: 248, fromDaysAgo: 63, toDaysAgo: 1 }),
      edge_beta: steadyTxs(4)
    },
    statusHistory: {
      edge_beta: makeCycles(['error', 'error', 'error'], 'beta')
    }
  })
  const clientOptions = {
    apiKey: 'test-key',
    url: 'https://jev.test/v1/systemone',
    model: 'jev-latest',
    timeoutMs: 1000
  }

  it('fails open when the API is unreachable', async () => {
    const warnings: string[] = []
    const failingFetch: JevFetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND jev.test')
    }
    const client = makeJevClient({
      ...clientOptions,
      fetch: failingFetch,
      warn: message => warnings.push(message)
    })
    const mechanical = analyzeHealth(dump, defaultHealthConfig)
    const report = await applyJev(mechanical, client)
    expect(report.alerts.map(alert => alert.key)).deep.equals(
      mechanical.alerts.map(alert => alert.key)
    )
    expect(report.alerts[0].errorClass).equals(undefined)
    expect(formatSummary(report)).contains('class unknown (unclassified)')
    expect(warnings.length).equals(2)
  })

  it('makes no call without an API key', async () => {
    let calls = 0
    const countingFetch: JevFetch = async () => {
      calls++
      throw new Error('unexpected call')
    }
    const client = makeJevClient({
      ...clientOptions,
      apiKey: undefined,
      fetch: countingFetch
    })
    await applyJev(analyzeHealth(dump, defaultHealthConfig), client)
    expect(calls).equals(0)
  })

  it('classifies errors and orders alerts by score', async () => {
    const requests: Array<{ state: string; questions: object }> = []
    const fakeFetch: JevFetch = async (url, init) => {
      const request = JSON.parse(init.body)
      requests.push(request)
      expect(url).equals(clientOptions.url)
      expect(init.headers.Authorization).equals('Bearer test-key')
      expect(request.model).equals('jev-latest')
      const answers =
        request.questions.errorClass != null
          ? {
              errorClass: {
                type: 'choice',
                choice: 'rateLimited',
                confidence: 0.9,
                probabilities: {}
              }
            }
          : {
              // Alert 2 (missing provider) is scored above alert 1:
              alert_1: { type: 'score', score: 1, confidence: 0.8 },
              alert_2: { type: 'score', score: 2.5, confidence: 0.8 }
            }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ model: 'jev-1', answers, usage: {} })
      }
    }
    const client = makeJevClient({ ...clientOptions, fetch: fakeFetch })
    const report = await applyJev(
      analyzeHealth(dump, defaultHealthConfig),
      client
    )
    expect(requests.length).equals(2)
    expect(requests[0].state).contains('HTTP 429')
    expect(report.alerts.map(alert => alert.key)).deep.equals([
      'missingProvider:edge_alpha:24h',
      'queryErrors:edge_beta'
    ])
    const summary = formatSummary(report)
    expect(summary).contains('class rate limited')
    expect(summary).contains('action: Reduce query frequency')
  })
})

describe('healthCheck status history', () => {
  it('classifies runPlugin status strings', () => {
    expect(
      statusResult('[runPlugin] moonpay Successful update in 3.2 seconds.')
    ).equals('success')
    expect(statusResult('[runPlugin] xgram Missing or disabled plugin')).equals(
      'noPlugin'
    )
    expect(statusResult('[runPlugin] moonpay Error: HTTP 401')).equals('error')
  })

  it('keeps the newest cycles up to the cap', () => {
    let doc: StatusDoc = { _id: 'edge_alpha', _rev: undefined, cycles: [] }
    const cycles = makeCycles(['error', 'error', 'success', 'error'], 'alpha')
    for (const cycle of cycles) doc = appendStatusCycle(doc, cycle, 3)
    expect(doc.cycles).deep.equals(cycles.slice(1))
  })
})

describe('healthCheck CLI dry run', () => {
  it('reads a JSON dump, writes the summary and exits 1 on alerts', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'healthCheck-'))
    const summaryPath = path.join(tmpDir, 'summary.txt')
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        require.resolve('sucrase/register'),
        path.join(__dirname, '../src/bin/healthCheck.ts'),
        '--dry-run',
        path.join(__dirname, 'fixtures/healthCheckDump.json'),
        '--summary-out',
        summaryPath,
        '--no-jev'
      ],
      { cwd: tmpDir, encoding: 'utf8' }
    )
    expect(result.status).equals(1, result.stderr)
    const summary = fs.readFileSync(summaryPath, 'utf8')
    expect(result.stdout).equals(summary)
    expect(summary).contains(`Edge reports health check, ${NOW_ISO}`)
    expect(summary).contains('1. missing provider | provider alpha | app edge')
  })
})
