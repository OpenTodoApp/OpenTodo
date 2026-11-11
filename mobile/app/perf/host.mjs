// The host side of the app's performance run (OpenSpec change native-app-foundation,
// design D4, task 5.2's app-perf; the storage spike's harness, kept). Never part of the
// app: app-native.yml's app-perf job runs it on the Mac that runs the iOS simulator.
//
//   node perf/host.mjs dump <perfseed data dir> <server binary> <out ops.json>
//     Starts the server on the fixture, signs in as the perfseed owner and pulls the
//     whole account through /api/v1/sync, as a new device would; writes the pages.
//   node perf/host.mjs run <rows.json> <bundle id> <out results.json> [runs]
//     Serves the rows and the instructions to the app on 127.0.0.1:8099. Launches the
//     app with no database once (the baseline), once to seed it, `runs` times cold to
//     measure, sampling the app's resident memory; then once to write a task, kills it
//     (SIGKILL) as soon as it reports the write committed, and once more to read it back.
//   node perf/host.mjs summary <results.json>
//     Prints the medians of the measured runs against the budgets (design D4), as
//     Markdown for the job summary.
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const [cmd, ...args] = process.argv.slice(2)
const log = (s) => console.log(`[host ${new Date().toISOString().slice(11, 23)}] ${s}`)

async function dump(fixture, bin, out) {
  const dir = mkdtempSync(join(tmpdir(), 'app-perf-'))
  copyFileSync(join(fixture, 'opentodo.db'), join(dir, 'opentodo.db'))
  const base = 'http://127.0.0.1:18090'
  const proc = spawn(bin, [], { env: { ...process.env, OPENTODO_DATA_DIR: dir, OPENTODO_ADDR: '127.0.0.1:18090', OPENTODO_LOG_LEVEL: 'warn' }, stdio: ['ignore', 'inherit', 'inherit'] })
  try {
    for (let i = 0; i < 600; i++) {
      try { if ((await fetch(`${base}/healthz`)).ok) break } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 100))
    }
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'perf@example.com', password: 'perf-password-10k' }) })
    if (!login.ok) throw new Error(`login: ${login.status} ${await login.text()}`)
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    const pages = []
    let cursor = 0
    for (;;) {
      const res = await fetch(`${base}/api/v1/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ device: 'app-perf', cursor, ops: [], features: ['latest_docs'] }) })
      if (!res.ok) throw new Error(`sync: ${res.status} ${await res.text()}`)
      const page = await res.json()
      pages.push({ ops: page.ops, memberships: page.memberships ?? [] })
      cursor = page.cursor
      if (!page.hasMore) break
    }
    writeFileSync(out, JSON.stringify({ pages }))
    log(`dump: ${pages.length} pages, ${pages.reduce((n, p) => n + p.ops.length, 0)} ops in ${out}`)
  } finally {
    proc.kill('SIGTERM')
  }
}

function simctl(...a) {
  return execFileSync('xcrun', ['simctl', ...a], { encoding: 'utf8' }).trim()
}

/**
 * Why the app ended, for a step that failed: the newest crash report of the app on this
 * Mac (a fatal JS error in a Release build aborts with its message in the report), and
 * the app's last log lines on the simulator.
 */
function appLog() {
  const out = []
  try {
    const dir = join(homedir(), 'Library/Logs/DiagnosticReports')
    const reports = readdirSync(dir).filter((f) => f.startsWith('OpenTodo')).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    if (reports[0]) {
      const text = readFileSync(reports[0], 'utf8')
      copyFileSync(reports[0], join(process.env.APP_PERF_OUT ?? tmpdir(), `crash-${Date.now()}.ips`))
      const reason = /"(?:reason|exception|type|signal|indicator)"\s*:\s*"[^"]*"|Unhandled JS Exception[^"\n]*|Termination Reason[^\n]*/g
      out.push(`crash report ${reports[0]}: ${[...new Set(text.match(reason) ?? [])].slice(0, 12).join(' | ')}`)
    } else out.push('no crash report')
  } catch (e) {
    out.push(`(no crash report: ${e.message})`)
  }
  try {
    out.push(execFileSync('xcrun', ['simctl', 'spawn', 'booted', 'log', 'show', '--last', '2m', '--style', 'compact', '--predicate', 'processImagePath CONTAINS "OpenTodo"'], { encoding: 'utf8', maxBuffer: 64 << 20 })
      .split('\n').slice(-30).join('\n'))
  } catch (e) {
    out.push(`(no log: ${e.message})`)
  }
  return out.join('\n')
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

  /** Launches the app for one step; `kill` ends it with SIGKILL the moment it answers. */
  async function launch(step, { kill = false } = {}) {
    instruction = step
    try { simctl('terminate', 'booted', bundle) } catch { /* not running */ }
    let fail
    const result = new Promise((resolve, reject) => {
      waiter = resolve
      fail = reject
      setTimeout(() => reject(new Error(`no result for ${JSON.stringify(step)} in 10 min`)), 10 * 60_000)
    })
    const launchedAt = Date.now()
    const pid = Number(simctl('launch', 'booted', bundle).split(':').pop())
    let peak = 0
    // A process that is gone (a crash at start) fails the step at once, with its log.
    const sampler = setInterval(() => {
      const now = rss(pid)
      if (now === 0) fail(new Error(`the app (pid ${pid}) ended without a result for ${JSON.stringify(step)}: ${appLog()}`))
      peak = Math.max(peak, now)
    }, 50)
    try {
      const r = await result
      if (kill) {
        execFileSync('kill', ['-9', String(pid)])
        return { ...r, killedAfterMs: Date.now() - launchedAt }
      }
      peak = Math.max(peak, rss(pid))
      return {
        ...r,
        launchedAt,
        launchToJsMs: r.jsStartedAt ? r.jsStartedAt - launchedAt : null,
        coldStartMs: r.todayDrawnAt ? r.todayDrawnAt - launchedAt : null,
        peakRssMB: +(peak / 2 ** 20).toFixed(1),
      }
    } finally {
      clearInterval(sampler)
      try { simctl('terminate', 'booted', bundle) } catch { /* gone */ }
    }
  }

  const device = simctl('list', 'devices', 'booted')
  const save = () => writeFileSync(out, JSON.stringify({ device, results }, null, 2))
  const step = async (s, opts) => {
    try {
      const r = await launch(s, opts)
      log(`${s.phase}${s.run ? ` ${s.run}` : ''}: ${JSON.stringify(r)}`)
      results.push(r)
    } catch (e) {
      log(`${s.phase}: ${e.message}`)
      results.push({ ...s, error: String(e.message) })
    }
    save()
    return results.at(-1)
  }
  await step({ phase: 'baseline' })
  const seeded = await step({ phase: 'seed' })
  if (!seeded.error) {
    for (let i = 1; i <= runs; i++) await step({ phase: 'measure', run: i })
    const written = await step({ phase: 'write' }, { kill: true })
    if (written.id) await step({ phase: 'verify', id: written.id })
  }
  server.close()
  save()
  log(`results in ${out}`)
  const failed = results.filter((r) => r.error || r.ok === false)
  if (failed.length) process.exitCode = 1
}

// The budgets of the performance-budgets delta (design D4); memory is judged on a phone,
// so the simulator's number is shown with its increase over the empty app.
const BUDGETS = [
  ['Cold start to Today drawn', (r) => r.coldStartMs, 1000],
  ['… launch to first JavaScript', (r) => r.launchToJsMs, null],
  ['… JavaScript start to Today drawn', (r) => r.jsStartToTodayMs, null],
  ['… Today query (open tasks by index)', (r) => r.open?.todayQueryMs, null],
  ['Opening Inbox', (r) => r.inbox?.totalMs, 300],
  ['500-op pull page', (r) => r.pull?.applyMs, 400],
  ['Longest JS-thread frame during the pull', (r) => r.pull?.longestFrameMs, 50],
  ['Resident memory, peak (MB)', (r) => r.peakRssMB, null],
]

function summary(file) {
  const { device, results } = JSON.parse(readFileSync(file, 'utf8'))
  const runs = results.filter((r) => r.phase === 'measure' && !r.error)
  const median = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
  const range = (xs) => { const s = xs.filter((x) => typeof x === 'number'); return s.length ? `${Math.min(...s)}–${Math.max(...s)}` : '' }
  const lines = [`Device: ${device.split('\n').find((l) => l.includes('Booted'))?.trim() ?? 'simulator'}`, '', '| Metric | Budget | Median | Range |', '|---|---|---|---|']
  for (const [name, get, budget] of BUDGETS) {
    const values = runs.map(get)
    const m = median(values)
    const mark = budget && m !== null ? (m <= budget ? ' (within)' : ' (over)') : ''
    lines.push(`| ${name} | ${budget ? `≤ ${budget} ms` : ''} | ${m ?? 'n/a'}${mark} | ${range(values)} |`)
  }
  const base = results.find((r) => r.phase === 'baseline')
  const seed = results.find((r) => r.phase === 'seed')
  const verify = results.find((r) => r.phase === 'verify')
  lines.push('', `Empty app peak memory: ${base?.peakRssMB ?? 'n/a'} MB. Seeding ${seed?.rows ?? '?'} rows: ${seed?.seedMs ?? '?'} ms. Today ${median(runs.map((r) => r.todayCount))} rows, Inbox ${median(runs.map((r) => r.inbox?.count))}.`)
  lines.push(`Kill after write: ${verify ? (verify.ok ? 'the task and its queued ops were there after SIGKILL' : `FAILED ${JSON.stringify(verify)}`) : 'not run'}.`)
  const errors = results.filter((r) => r.error)
  if (errors.length) lines.push('', 'Errors:', ...errors.map((e) => `- ${e.phase}: ${String(e.error).split('\n')[0]}`))
  console.log(lines.join('\n'))
}

if (cmd === 'dump') await dump(...args)
else if (cmd === 'summary') summary(args[0])
else if (cmd === 'run') await run(args[0], args[1], args[2], Number(args[3] ?? 3))
else { console.error('usage: host.mjs dump|run|summary …'); process.exit(2) }
