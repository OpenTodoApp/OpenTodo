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
//     Prints the medians of the measured runs against the app's budgets
//     (scripts/perf/budgets.json, setting app-simulator) as Markdown for the job
//     summary, and fails when one is exceeded or was not measured.
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate, loadBudgets, median } from '../../../scripts/perf/budgets.mjs'

// Imported by the budgets test for `report`; the commands run only as a script.
const main = process.argv[1] === fileURLToPath(import.meta.url)
const [cmd, ...args] = main ? process.argv.slice(2) : []
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

// The app's budgets (scripts/perf/budgets.json, setting app-simulator; docs/performance.md
// shows them). Two are the part of a phone's budget a simulator can judge: JavaScript
// start to Today (the simulator's own launch time is reported beside it) and the memory
// over the empty app. The harness's request for its step is not the app's time.
const SAMPLES = {
  'app-js-to-today': (r) => (typeof r.jsStartToTodayMs === 'number' ? r.jsStartToTodayMs - (r.instructionMs ?? 0) : undefined),
  'app-inbox': (r) => r.inbox?.totalMs,
  'app-pull-page': (r) => r.pull?.applyMs,
  'app-pull-frame': (r) => r.pull?.longestFrameMs,
  'app-complete-task': (r) => r.complete?.toFrameP95Ms,
  'app-memory-growth': (r, base) => (typeof r.peakRssMB === 'number' && typeof base?.peakRssMB === 'number' ? +(r.peakRssMB - base.peakRssMB).toFixed(1) : undefined),
}

// Reported beside the budgets, never judged here.
const REPORTED = [
  ['Cold start to Today drawn (a phone\'s budget: 1,000 ms)', (r) => r.coldStartMs],
  ['… launch to first JavaScript (the simulator)', (r) => r.launchToJsMs],
  ['… the harness asking the host for its step', (r) => r.instructionMs],
  ['… opening the database', (r) => r.open?.openMs],
  ['… Today query (open tasks by index)', (r) => r.open?.todayQueryMs],
  ['Completing a task: the write alone, p95', (r) => r.complete?.writeP95Ms],
  ['Resident memory, peak (MB)', (r) => r.peakRssMB],
]

/** The summary in Markdown, and whether every budget holds. */
export function report({ device, results }, budgets = loadBudgets()) {
  const runs = results.filter((r) => r.phase === 'measure' && !r.error)
  const base = results.find((r) => r.phase === 'baseline')
  const numbers = (xs) => xs.filter((x) => typeof x === 'number')
  const range = (xs) => (numbers(xs).length ? `${Math.min(...numbers(xs))}–${Math.max(...numbers(xs))}` : '')
  const samples = Object.fromEntries(Object.entries(SAMPLES).map(([id, get]) => [id, numbers(runs.map((r) => get(r, base)))]))
  const verdict = evaluate(budgets, 'app-simulator', samples)
  const lines = [`Device: ${device.split('\n').find((l) => l.includes('Booted'))?.trim() ?? 'simulator'}`, '', '| Metric | Budget | Median | Range |', '|---|---|---|---|']
  for (const m of verdict.metrics) {
    lines.push(`| ${m.name} | ≤ ${m.limit} ${m.unit} | ${m.runs.length ? `${m.median} (${m.ok ? 'within' : 'over'})` : 'not measured'} | ${range(m.runs)} |`)
  }
  for (const [name, get] of REPORTED) {
    const values = numbers(runs.map(get))
    lines.push(`| ${name} | | ${values.length ? median(values) : 'n/a'} | ${range(values)} |`)
  }
  const seed = results.find((r) => r.phase === 'seed')
  const verify = results.find((r) => r.phase === 'verify')
  const count = (get) => (numbers(runs.map(get)).length ? median(numbers(runs.map(get))) : '?')
  lines.push('', `Empty app peak memory: ${base?.peakRssMB ?? 'n/a'} MB. Seeding ${seed?.rows ?? '?'} rows: ${seed?.seedMs ?? '?'} ms. Today ${count((r) => r.todayCount)} rows, Inbox ${count((r) => r.inbox?.count)}.`)
  lines.push(`Kill after write: ${verify ? (verify.ok ? 'the task and its queued ops were there after SIGKILL' : `FAILED ${JSON.stringify(verify)}`) : 'not run'}.`)
  const errors = results.filter((r) => r.error)
  if (errors.length) lines.push('', 'Errors:', ...errors.map((e) => `- ${e.phase}: ${String(e.error).split('\n')[0]}`))
  const failures = verdict.metrics.filter((m) => !m.ok).map((m) => m.failure)
  if (failures.length) lines.push('', 'Over budget:', ...failures.map((f) => `- ${f}`))
  return { text: lines.join('\n'), failures }
}

function summary(file) {
  const { text, failures } = report(JSON.parse(readFileSync(file, 'utf8')))
  console.log(text)
  if (failures.length) process.exitCode = 1
}

if (!main) { /* imported */ } else if (cmd === 'dump') await dump(...args)
else if (cmd === 'summary') summary(args[0])
else if (cmd === 'run') await run(args[0], args[1], args[2], Number(args[3] ?? 3))
else { console.error('usage: host.mjs dump|run|summary …'); process.exit(2) }
