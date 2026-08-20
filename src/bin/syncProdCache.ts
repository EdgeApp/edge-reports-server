/**
 * Pull production dashboard cache DBs into the local CouchDB from
 * config.json. Does not copy reports_transactions (~11 GB) or
 * reports_hour (~40 GB). Dashboard /v2/ reads reports_apps + reports_day
 * (and month for longer presets).
 *
 * Requires SSH to reports-wusa1.edge.app and a local Couch that already
 * has partitioned DBs (`npm run setup`). Never point query/cache engines
 * at the tunnel; this script only pulls.
 *
 *   node -r sucrase/register src/bin/syncProdCache.ts
 *   node -r sucrase/register src/bin/syncProdCache.ts --apps-only
 */
import { ChildProcess, execFileSync, spawn } from 'child_process'
import { asBoolean, asJSON, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

import { config } from '../config'

const asRemoteConfig = asObject({ couchDbFullpath: asString })
const asReplicateOk = asObject({ ok: asBoolean })

const PROD_HOST = 'reports-wusa1.edge.app'
const TUNNEL_PORT = 15984
const PROD_CONFIG_PATH = '/tmp/reports-sanity/config.json'
const CACHE_DBS = ['reports_apps', 'reports_day', 'reports_month']
const APPS_ONLY_DBS = ['reports_apps']
const REPLICATE_TIMEOUT_MS = 4 * 60 * 60 * 1000

async function main(): Promise<void> {
  const appsOnly = process.argv.includes('--apps-only')
  const dbNames = appsOnly ? APPS_ONLY_DBS : CACHE_DBS
  const localUrl = trimSlash(config.couchDbFullpath ?? '')
  if (localUrl === '') {
    throw new Error('config.json couchDbFullpath is empty')
  }

  await assertLocalCouch(localUrl)
  for (const name of dbNames) {
    await assertLocalDb(localUrl, name)
  }

  console.log(`Opening SSH tunnel ${PROD_HOST} -> 127.0.0.1:${TUNNEL_PORT}`)
  const prodUrl = readRemoteCouchUrl(PROD_HOST)
  const tunneledUrl = withHostPort(prodUrl, '127.0.0.1', TUNNEL_PORT)
  const ssh = startTunnel(PROD_HOST, TUNNEL_PORT)
  try {
    await waitForCouch(tunneledUrl, 20000)
    for (const name of dbNames) {
      console.log(`Replicating ${name} (pull from prod)`)
      await replicate(tunneledUrl, localUrl, name)
      console.log(`Done ${name}`)
    }
  } finally {
    ssh.kill('SIGTERM')
  }
}

function readRemoteCouchUrl(host: string): string {
  const raw = execFileSync('ssh', [host, 'cat', PROD_CONFIG_PATH], {
    encoding: 'utf8'
  })
  const parsed = asJSON(asRemoteConfig)(raw)
  if (!parsed.couchDbFullpath.startsWith('http')) {
    throw new Error(
      `Remote ${PROD_CONFIG_PATH} did not yield a couch URL. Copy prod config.json to that path on the box.`
    )
  }
  return parsed.couchDbFullpath
}

function startTunnel(host: string, localPort: number): ChildProcess {
  const ssh = spawn('ssh', ['-N', '-L', `${localPort}:127.0.0.1:5984`, host], {
    stdio: 'ignore'
  })
  ssh.on('error', (error: unknown) => {
    console.error('ssh tunnel failed', error)
  })
  return ssh
}

async function assertLocalCouch(localUrl: string): Promise<void> {
  try {
    const response = await fetch(localUrl, { timeout: 3000 })
    if (!response.ok && response.status !== 401) {
      throw new Error(`Local Couch HTTP ${response.status}`)
    }
  } catch (error) {
    throw new Error(
      `Local Couch is not reachable at ${redactUrl(
        localUrl
      )}. Start CouchDB, then npm run setup. (${
        error instanceof Error ? error.message : String(error)
      })`
    )
  }
}

async function assertLocalDb(localUrl: string, name: string): Promise<void> {
  const response = await fetch(`${localUrl}/${name}`, { timeout: 10000 })
  if (response.status === 404) {
    throw new Error(`Local DB ${name} is missing. Run: socket npm run setup`)
  }
  if (!response.ok) {
    throw new Error(`Local DB ${name} HTTP ${response.status}`)
  }
}

async function waitForCouch(url: string, maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs
  let lastError = 'timeout'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { timeout: 2000 })
      if (response.ok || response.status === 401) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(400)
  }
  throw new Error(`Tunnel Couch did not answer: ${lastError}`)
}

async function replicate(
  sourceBase: string,
  targetBase: string,
  dbName: string
): Promise<void> {
  const response = await fetch(`${targetBase}/_replicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: `${sourceBase}/${dbName}`,
      target: `${targetBase}/${dbName}`,
      create_target: false
    }),
    timeout: REPLICATE_TIMEOUT_MS
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`_replicate ${dbName} HTTP ${response.status}: ${text}`)
  }
  const body = asJSON(asReplicateOk)(text)
  if (!body.ok) {
    throw new Error(`_replicate ${dbName} did not return ok: ${text}`)
  }
}

function withHostPort(urlStr: string, hostname: string, port: number): string {
  const parsed = new URL(urlStr)
  parsed.hostname = hostname
  parsed.port = String(port)
  return trimSlash(parsed.toString())
}

function redactUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr)
    if (parsed.password !== '') parsed.password = '***'
    if (parsed.username !== '') parsed.username = '***'
    return parsed.toString()
  } catch {
    return '[unparseable url]'
  }
}

function trimSlash(urlStr: string): string {
  return urlStr.replace(/\/$/, '')
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
