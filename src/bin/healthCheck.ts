import { asBoolean, asJSON, asObject, asOptional, asString } from 'cleaners'
import { program } from 'commander'
import fs from 'fs'

import { config } from '../config'
import { asHealthDump, HealthDump } from '../healthCheck/healthCheckTypes'
import { loadHealthDump } from '../healthCheck/healthCouch'
import { applyJev } from '../healthCheck/healthJev'
import { analyzeHealth } from '../healthCheck/healthMetrics'
import { formatSummary } from '../healthCheck/healthSummary'
import { makeJevClient } from '../util/jev'

/**
 * Daily reports health check. Prints a plain-text summary to stdout and
 * writes it to a file. Exits 1 when any alert fires, 0 when none do, and
 * 2 when the check itself fails.
 */

const asCliOptions = asObject({
  dryRun: asOptional(asString),
  dumpOut: asOptional(asString),
  summaryOut: asString,
  now: asOptional(asString),
  jev: asBoolean
})

const log = (message: string): void => {
  console.error(message)
}

async function main(): Promise<number> {
  program
    .option(
      '--dry-run <dumpFile>',
      'Read inputs from a JSON dump instead of CouchDB'
    )
    .option('--dump-out <dumpFile>', 'Write the inputs read to a JSON dump')
    .option(
      '--summary-out <file>',
      'Summary file path',
      config.healthCheck.summaryPath
    )
    .option('--now <isoDate>', 'Evaluate as of this time instead of now')
    .option('--no-jev', 'Skip the Jev classification and ordering calls')
  program.parse(process.argv)
  const options = asCliOptions(program.opts())

  const now = options.now == null ? undefined : parseDate(options.now)
  let dump: HealthDump
  if (options.dryRun != null) {
    dump = asJSON(asHealthDump)(fs.readFileSync(options.dryRun, 'utf8'))
    if (now != null) dump = { ...dump, nowIsoDate: now.toISOString() }
  } else {
    dump = await loadHealthDump({
      couchDbFullpath: config.couchDbFullpath,
      now: now ?? new Date(),
      baselineWeeks: config.healthCheck.baselineWeeks,
      soloAppIds: config.soloAppIds,
      soloPartnerIds: config.soloPartnerIds,
      log
    })
  }
  if (options.dumpOut != null) {
    fs.writeFileSync(options.dumpOut, JSON.stringify(dump))
    log(`Wrote dump to ${options.dumpOut}`)
  }

  let report = analyzeHealth(dump, config.healthCheck)
  if (options.jev) {
    const client = makeJevClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      url: config.healthCheck.jevUrl,
      model: config.healthCheck.jevModel,
      timeoutMs: config.healthCheck.jevTimeoutMs,
      warn: log
    })
    report = await applyJev(report, client)
  }

  const summary = formatSummary(report)
  process.stdout.write(summary)
  fs.writeFileSync(options.summaryOut, summary)
  return report.alerts.length > 0 ? 1 : 0
}

function parseDate(value: string): Date {
  const date = new Date(value)
  if (value === '' || isNaN(date.valueOf())) {
    throw new Error(`Invalid --now date: ${value}`)
  }
  return date
}

main()
  .then(exitCode => process.exit(exitCode))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(2)
  })
