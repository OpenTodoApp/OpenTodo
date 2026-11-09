// The assistant eval (OpenSpec change assistant-eval): recorded scenarios
// against a real model provider, through the server's own turn route.
//
//   make assistant-eval                         build, then run every scenario (needs the env below)
//   node scripts/assistant-eval/run.mjs         against an existing bin/opentodo
//   ASSISTANT_EVAL_FAKE=1 node scripts/assistant-eval/run.mjs
//                                               dry run on scripts/fake-llm.mjs: only the scenarios marked "fake"
//   node scripts/assistant-eval/run.mjs --replay <recorded.json>
//                                               check recorded events offline (no server, no provider)
//   node scripts/assistant-eval/run.mjs --check validate the scenario files only
//
// Env (read by this script only, never by the server):
//   ASSISTANT_EVAL_PROVIDER  anthropic | openai | gemini | compatible
//   ASSISTANT_EVAL_MODEL     the model id (optional for anthropic: the server's default)
//   ASSISTANT_EVAL_KEY       the API key (optional for a compatible endpoint)
//   ASSISTANT_EVAL_BASE_URL  a compatible endpoint's base URL (usually ends in /v1)
//   ASSISTANT_EVAL_RUNS      runs per scenario (default 3; a scenario passes on a majority)
//   ASSISTANT_EVAL_ONLY      comma-separated scenario names
//   OPENTODO_BIN             the server binary (default bin/opentodo)
//   OUT_DIR                  where the report goes (default eval-report)
//
// Each scenario gets a throwaway server on a temporary data directory (design
// D1): the owner is created, the assistant configured and consented, the seed
// written through REST, and every turn posted to POST /api/v1/assistant/turn.
// The key goes only to that local server, which sends it only to the provider.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReport, checkRun, parseEvents, validateScenario } from './lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const env = process.env
const OUT = env.OUT_DIR ?? 'eval-report'
const PASSWORD = 'correct horse battery staple'

/** Every scenario in scenarios/, checked; throws listing the problems. */
export function loadScenarios(dir = join(here, 'scenarios')) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  const problems = []
  const out = []
  const names = new Set()
  for (const f of files) {
    let s
    try { s = JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch (e) { problems.push(`${f}: ${e.message}`); continue }
    problems.push(...validateScenario(s, f))
    if (s.name && `${s.name}.json` !== f) problems.push(`${f}: name "${s.name}" must match the file name`)
    if (names.has(s.name)) problems.push(`${f}: name "${s.name}" used twice`)
    names.add(s.name)
    out.push(s)
  }
  if (problems.length) throw new Error(`scenario problems:\n  ${problems.join('\n  ')}`)
  return out
}

function writeReport(results, meta) {
  const { json, md } = buildReport(results, meta)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(json, null, 2) + '\n')
  writeFileSync(join(OUT, 'report.md'), md)
  for (const s of json.scenarios) {
    console.log(`${s.pass ? 'pass' : 'FAIL'}  ${s.name}  (${s.passed_runs} of ${s.runs} runs, ${s.tokens} tokens)`)
    if (!s.pass) for (const r of s.results) for (const t of r.turns) for (const f of t.failures) console.log(`        ${f}`)
  }
  console.log(`${json.passed} of ${json.scenarios.length} scenarios pass; report: ${join(OUT, 'report.md')}`)
  return json.failed === 0
}

// ---- offline modes ----

/**
 * Checks recorded events: {scenarios: [{name, ids?, today?, runs: [[turn events…]…]}]},
 * each turn's events as the stream sends them ([{name, data}]).
 */
export function replay(recorded, scenarios) {
  const byName = new Map(scenarios.map((s) => [s.name, s]))
  return recorded.scenarios.map((r) => {
    const scenario = byName.get(r.name)
    if (!scenario) throw new Error(`replay: unknown scenario ${r.name}`)
    return { scenario, runs: r.runs.map((turns) => checkRun(scenario, turns, r.ids ?? {}, r.today)) }
  })
}

// ---- live ----

async function freePort() {
  const s = createServer()
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok))
  const { port } = s.address()
  await new Promise((ok) => s.close(ok))
  return port
}

async function startServer() {
  const port = await freePort()
  const dir = mkdtempSync(join(tmpdir(), 'opentodo-eval-'))
  const base = `http://127.0.0.1:${port}`
  const proc = spawn(env.OPENTODO_BIN ?? join(repo, 'bin/opentodo'), [], {
    env: { ...env, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_DATA_DIR: dir, OPENTODO_BASE_URL: base }, stdio: 'ignore',
  })
  const stop = () => { proc.kill(); rmSync(dir, { recursive: true, force: true }) }
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return { base, stop } } catch { /* not up yet */ }
    await new Promise((ok) => setTimeout(ok, 250))
  }
  stop()
  throw new Error('the server did not start (build it first: make build)')
}

function client(base) {
  let cookie = ''
  const req = async (method, path, body, raw = false) => {
    const r = await fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const set = r.headers.getSetCookie?.() ?? []
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
    const text = await r.text()
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 300)}`)
    if (raw) return text
    return text ? JSON.parse(text) : null
  }
  return req
}

const dayFrom = (today, n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

/** Writes a scenario's seed through REST and returns its keys' ids. */
async function seed(api, s, today) {
  const ids = {}
  const sd = s.seed ?? {}
  for (const l of sd.labels ?? []) ids[l.key] = (await api('POST', '/api/v1/labels', { name: l.name })).id
  for (const p of sd.projects ?? []) {
    ids[p.key] = (await api('POST', '/api/v1/projects', { name: p.name, ...(p.parent ? { parent_id: ids[p.parent] } : {}) })).id
    if (p.kept_away) await api('PUT', `/api/v1/projects/${ids[p.key]}/agent-access`, { kept_away: true })
  }
  for (const t of sd.tasks ?? []) {
    const body = { title: t.title }
    if (t.description) body.description = t.description
    if (t.project) body.project_id = ids[t.project]
    if (t.due !== undefined) body.due = { date: dayFrom(today, t.due), ...(t.time ? { time: t.time } : {}) }
    if (t.deadline !== undefined) body.deadline = dayFrom(today, t.deadline)
    if (t.labels) body.labels = t.labels.map((k) => ids[k])
    if (t.location) body.location = t.location
    if (t.priority) body.priority = t.priority
    if (t.estimate_minutes) body.estimate_minutes = t.estimate_minutes
    ids[t.key] = (await api('POST', '/api/v1/tasks', body)).id
  }
  for (const n of sd.notes ?? []) ids[n.key] = (await api('POST', '/api/v1/notes', { title: n.title, description: n.description ?? '', ...(n.project ? { project_id: ids[n.project] } : {}) })).id
  return ids
}

function providerSettings(fakeURL) {
  const provider = fakeURL ? 'compatible' : env.ASSISTANT_EVAL_PROVIDER
  if (!['anthropic', 'openai', 'gemini', 'compatible'].includes(provider)) throw new Error('set ASSISTANT_EVAL_PROVIDER to anthropic, openai, gemini or compatible (or ASSISTANT_EVAL_FAKE=1 for a dry run)')
  const model = fakeURL ? 'fake-model' : env.ASSISTANT_EVAL_MODEL ?? ''
  if (!model && provider !== 'anthropic') throw new Error('set ASSISTANT_EVAL_MODEL')
  const baseURL = fakeURL ?? env.ASSISTANT_EVAL_BASE_URL
  if (provider === 'compatible' && !baseURL) throw new Error('set ASSISTANT_EVAL_BASE_URL for a compatible endpoint')
  const key = fakeURL ? '' : env.ASSISTANT_EVAL_KEY ?? ''
  if (!key && provider !== 'compatible') throw new Error('set ASSISTANT_EVAL_KEY')
  const p = { enabled: true, ...(model ? { model } : {}), ...(provider === 'compatible' ? { base_url: baseURL } : {}) }
  return {
    provider, model,
    body: { enabled: true, default_provider: provider, monthly_token_cap_per_user: 0, allow_private_endpoint: provider === 'compatible', providers: { [provider]: p }, ...(key ? { keys: { [provider]: key } } : {}) },
  }
}

async function runScenario(s, conf, runs) {
  const { base, stop } = await startServer()
  try {
    const api = client(base)
    const today = new Date().toISOString().slice(0, 10)
    await api('POST', '/api/v1/auth/register', { email: 'eval@example.com', name: 'Eval', password: PASSWORD })
    await api('PUT', '/api/v1/settings/assistant', conf.body)
    await api('PUT', '/api/v1/me/assistant', { consent: true, provider: conf.provider })
    const ids = await seed(api, s, today)
    const out = []
    for (let r = 0; r < runs; r++) {
      const messages = []
      const turns = []
      for (const t of s.turns) {
        messages.push({ role: 'user', text: t.say })
        let events
        try {
          events = parseEvents(await api('POST', '/api/v1/assistant/turn', { messages, timezone: 'UTC', view: s.view ?? 'today' }, true))
        } catch (e) {
          events = [{ name: 'error', data: { code: 'eval', message: e.message } }]
        }
        turns.push(events)
        messages.push({ role: 'assistant', text: events.filter((e) => e.name === 'text').map((e) => e.data.text).join('') || '(no answer)' })
      }
      out.push(checkRun(s, turns, ids, today))
      process.stdout.write(out.at(-1).pass ? '.' : 'x')
    }
    process.stdout.write('\n')
    return out
  } finally {
    stop()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const scenarios = loadScenarios()
  if (args[0] === '--check') {
    console.log(`${scenarios.length} scenarios ok`)
    return true
  }
  if (args[0] === '--replay') {
    if (!args[1]) throw new Error('--replay <recorded.json>')
    return writeReport(replay(JSON.parse(readFileSync(args[1], 'utf8')), scenarios), { mode: 'replay' })
  }
  const fake = env.ASSISTANT_EVAL_FAKE === '1'
  let llm
  if (fake) {
    const { startFakeLLM } = await import('../fake-llm.mjs')
    llm = await startFakeLLM(await freePort())
  }
  try {
    const conf = providerSettings(fake ? `http://127.0.0.1:${llm.address().port}/v1` : undefined)
    const only = (env.ASSISTANT_EVAL_ONLY ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    const chosen = scenarios.filter((s) => (!fake || s.fake) && (!only.length || only.includes(s.name)))
    if (!chosen.length) throw new Error('no scenario chosen')
    const runs = fake ? 1 : Math.max(1, Number(env.ASSISTANT_EVAL_RUNS ?? 3) || 3)
    const results = []
    for (const s of chosen) {
      process.stdout.write(`${s.name} `)
      results.push({ scenario: s, runs: await runScenario(s, conf, runs) })
    }
    return writeReport(results, { provider: conf.provider, model: conf.model || '(server default)', runs, date: new Date().toISOString().slice(0, 10), fake })
  } finally {
    llm?.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((ok) => process.exit(ok ? 0 : 1), (e) => { console.error(e.message); process.exit(2) })
}
