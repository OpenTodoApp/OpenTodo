// The host side of the storage spike (OpenSpec change native-app-foundation, task 2,
// design D4). Never part of the app: the workflow storage-spike.yml runs it on the Mac
// that runs the iOS simulator.
//
//   node spike/host.mjs dump <perfseed data dir> <server binary> <out ops.json>
//     Starts the server on the fixture, signs in as the perfseed owner and pulls the
//     whole account through /api/v1/sync, as a new device would; writes the pages.
//   node spike/host.mjs run <rows.json> <bundle id> <out results.json> [runs]
//     Serves the rows and the instructions to the app on 127.0.0.1:8099, and for each
//     candidate launches the app once to seed it, then `runs` times cold to measure,
//     sampling the app process's resident memory. Writes every result as JSON.
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [cmd, ...args] = process.argv.slice(2)
const log = (s) => console.log(`[host ${new Date().toISOString().slice(11, 23)}] ${s}`)

async function dump(fixture, bin, out) {
  const dir = mkdtempSync(join(tmpdir(), 'spike-'))
  copyFileSync(join(fixture, 'opentodo.db'), join(dir, 'opentodo.db'))
  const base = 'http://127.0.0.1:18090'
  const proc = spawn(bin, [], { env: { ...process.env, OPENTODO_DATA_DIR: dir, OPENTODO_ADDR: '127.0.0.1:18090', OPENTODO_LOG_LEVEL: 'warn' }, stdio: ['ignore', 'inherit', 'inherit'] })
  try {
    for (let i = 0; i < 600; i++) {
      try { if ((await fetch(`${base}/healthz`)).ok) break } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 100))
    }
    const summary = JSON.parse(readFileSync(join(fixture, 'perfseed.json'), 'utf8'))
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'perf@example.com', password: 'perf-password-10k' }) })
    if (!login.ok) throw new Error(`login: ${login.status} ${await login.text()}`)
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    const pages = []
    let cursor = 0
    for (;;) {
      const res = await fetch(`${base}/api/v1/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ device: 'storage-spike', cursor, ops: [], features: ['latest_docs'] }) })
      if (!res.ok) throw new Error(`sync: ${res.status} ${await res.text()}`)
      const page = await res.json()
      pages.push({ ops: page.ops, memberships: page.memberships ?? [] })
      cursor = page.cursor
      if (!page.hasMore) break
    }
    writeFileSync(out, JSON.stringify({ owner: summary.ownerId ?? summary.owner_id ?? null, pages }))
    log(`dump: ${pages.length} pages, ${pages.reduce((n, p) => n + p.ops.length, 0)} ops in ${out}`)
  } finally {
    proc.kill('SIGTERM')
  }
}

function simctl(...a) {
  return execFileSync('xcrun', ['simctl', ...a], { encoding: 'utf8' }).trim()
}

function rss(pid) {
  try { return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) * 1024 } catch { return 0 }
}

async function run(rowsFile, bundle, out, runs = 3) {
  const rows = readFileSync(rowsFile)
  let instruction = null
  let waiter = null
  const results = []
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/rows.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(rows); return }
    if (req.method === 'GET' && req.url === '/next') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(instruction)); return }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      res.writeHead(204); res.end()
      if (req.url === '/log') log(`app: ${body}`)
      if (req.url === '/result') waiter?.(JSON.parse(body))
    })
  })
  await new Promise((r) => server.listen(8099, '127.0.0.1', r))

  async function launch(step) {
    instruction = step
    try { simctl('terminate', 'booted', bundle) } catch { /* not running */ }
    const result = new Promise((resolve, reject) => {
      waiter = resolve
      setTimeout(() => reject(new Error(`no result for ${JSON.stringify(step)} in 15 min`)), 15 * 60_000)
    })
    const launchedAt = Date.now()
    const pid = Number(simctl('launch', 'booted', bundle).split(':').pop())
    let peak = 0
    const sampler = setInterval(() => { peak = Math.max(peak, rss(pid)) }, 50)
    try {
      const r = await result
      peak = Math.max(peak, rss(pid))
      const end = rss(pid)
      return { ...r, launchedAt, coldStartMs: r.todayDrawnAt ? r.todayDrawnAt - launchedAt : null, peakRssMB: +(peak / 2 ** 20).toFixed(1), endRssMB: +(end / 2 ** 20).toFixed(1) }
    } finally {
      clearInterval(sampler)
      try { simctl('terminate', 'booted', bundle) } catch { /* gone */ }
    }
  }

  for (const candidate of ['A', 'B']) {
    try {
      log(`${candidate}: seed`)
      const seed = await launch({ candidate, phase: 'seed' })
      log(`${candidate}: seed ${JSON.stringify(seed)}`)
      results.push(seed)
      if (seed.error) continue
      for (let i = 1; i <= runs; i++) {
        const m = await launch({ candidate, phase: 'measure', run: i })
        log(`${candidate}: run ${i} ${JSON.stringify(m)}`)
        results.push(m)
      }
    } catch (e) {
      log(`${candidate}: ${e.message}`)
      results.push({ candidate, error: String(e.message) })
    }
  }
  server.close()
  writeFileSync(out, JSON.stringify({ device: simctl('list', 'devices', 'booted'), results }, null, 2))
  log(`results in ${out}`)
}

if (cmd === 'dump') await dump(...args)
else if (cmd === 'run') await run(args[0], args[1], args[2], Number(args[3] ?? 3))
else { console.error('usage: host.mjs dump|run …'); process.exit(2) }
