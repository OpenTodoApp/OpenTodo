// Upgrade check (OpenSpec self-hosting "Upgrades from released versions keep the data"):
// for each released version, start that release's own server binary on a fresh data
// directory, write an account's data through its API (owner, API token, projects,
// section, label, tasks with every common field, a subtask, a completed and a deleted
// task, a comment, a saved view), read it back, stop it, then start the server under
// test on the same directory. The check fails unless the database reaches this build's
// schema version, the token and the password still work, the export and the full op log
// read back what the release returned, and a new write is accepted.
//
// Usage: node scripts/upgrade-check.mjs [v0.13.0 v0.14.0 ...]
// Env:   OPENTODO_BIN       server under test (default bin/opentodo)
//        UPGRADE_FROM       versions to test when none are named (space separated;
//                           default: the three newest releases and v0.6.1, the
//                           oldest release with a server binary, schema 34)
//        UPGRADE_CACHE      where release binaries are kept (default .cache/releases)
//        GH_TOKEN           optional, for the GitHub API's release list
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
// node:sqlite is experimental in Node 22; its warning is noise here.
process.removeAllListeners('warning')
const { DatabaseSync } = await import('node:sqlite')

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const repo = 'pixari/OpenTodo'
const OLDEST = 'v0.6.1'
const bin = path.resolve(process.env.OPENTODO_BIN ?? path.join(root, 'bin/opentodo'))
const cache = path.resolve(process.env.UPGRADE_CACHE ?? path.join(root, '.cache/releases'))
const port = 18300 + Math.floor(Math.random() * 500)
const base = `http://127.0.0.1:${port}`
const latestSchema = Math.max(...readdirSync(path.join(root, 'internal/store/migrations')).map((f) => Number(f.slice(0, 4))).filter(Number.isFinite))

const step = (s) => console.log('·', s)
function fail(msg) {
  throw new Error(msg)
}

async function versions() {
  if (process.argv.length > 2) return process.argv.slice(2)
  if (process.env.UPGRADE_FROM) return process.env.UPGRADE_FROM.split(/\s+/).filter(Boolean)
  const headers = process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, { headers })
  if (!res.ok) fail(`release list: HTTP ${res.status}`)
  const releases = (await res.json()).filter((r) => !r.draft && !r.prerelease).map((r) => r.tag_name)
  return [...new Set([...releases.slice(0, 3), OLDEST])]
}

/** The release's linux-amd64 server binary, checked against its SHA256SUMS. */
async function releaseBinary(tag) {
  const file = path.join(cache, tag, 'opentodo-linux-amd64')
  if (existsSync(file)) return file
  mkdirSync(path.dirname(file), { recursive: true })
  const get = async (name) => {
    const res = await fetch(`https://github.com/${repo}/releases/download/${tag}/${name}`)
    if (!res.ok) fail(`${tag}/${name}: HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  const sums = (await get('SHA256SUMS')).toString()
  const want = sums.split('\n').map((l) => l.trim().split(/\s+/)).find(([, n]) => n === 'opentodo-linux-amd64')?.[0]
  if (!want) fail(`${tag}: no opentodo-linux-amd64 in SHA256SUMS`)
  const body = await get('opentodo-linux-amd64')
  const got = createHash('sha256').update(body).digest('hex')
  if (got !== want) fail(`${tag}: checksum ${got}, SHA256SUMS says ${want}`)
  writeFileSync(file, body)
  chmodSync(file, 0o755)
  return file
}

async function startServer(binary, dataDir, label) {
  const log = path.join(dataDir, `..`, `${label}.log`)
  const out = []
  const proc = spawn(binary, [], {
    env: { ...process.env, OPENTODO_DATA_DIR: dataDir, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  proc.stdout.on('data', (d) => out.push(d))
  proc.stderr.on('data', (d) => out.push(d))
  const exited = new Promise((resolve) => proc.on('exit', resolve))
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) break
    try {
      if ((await fetch(`${base}/healthz`)).ok) {
        return {
          stop: async () => {
            proc.kill('SIGTERM')
            await exited
            writeFileSync(log, Buffer.concat(out))
          },
        }
      }
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  proc.kill('SIGKILL')
  await exited
  fail(`${label} did not start:\n${Buffer.concat(out).toString()}`)
}

/** A small API client: a session cookie or a bearer token. */
function client(auth = {}) {
  return async (method, p, body) => {
    const headers = { 'content-type': 'application/json' }
    if (auth.token) headers.authorization = `Bearer ${auth.token}`
    if (auth.cookie) headers.cookie = auth.cookie
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    if (!res.ok) fail(`${method} ${p}: HTTP ${res.status} ${text}`)
    if (!auth.token) {
      const set = res.headers.getSetCookie?.() ?? []
      if (set.length) auth.cookie = set.map((c) => c.split(';')[0]).join('; ')
    }
    return text ? JSON.parse(text) : null
  }
}

const EMAIL = 'upgrade@example.com'
const PASSWORD = 'upgrade check password'

/** Writes the account's data through the release's own API. */
async function seed() {
  const session = {}
  const api = client(session)
  await api('POST', '/api/v1/auth/register', { email: EMAIL, name: 'Upgrade', password: PASSWORD })
  if (!session.cookie) await api('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD })
  const { secret: token } = await api('POST', '/api/v1/tokens', { name: 'upgrade', scope: 'full' })
  if (!token) fail('no secret in the create-token answer')

  const device = `upgrade-${randomUUID()}`
  let ts = Date.now() - 60_000
  const ops = []
  const put = (entity, entityId, fields) => {
    for (const [field, value] of Object.entries(fields)) ops.push({ id: randomUUID(), entity, entityId, field, value, ts: ts++, device })
  }
  const id = { work: randomUUID(), home: randomUUID(), section: randomUUID(), label: randomUUID(), view: randomUUID() }
  const task = { a: randomUUID(), b: randomUUID(), sub: randomUUID(), done: randomUUID(), gone: randomUUID(), comment: randomUUID() }
  put('project', id.work, { name: 'Work', color: '#3b82f6', position: 1, archived: false, parent_id: null, created_at: 1_700_000_000_000, deleted_at: null })
  put('project', id.home, { name: 'Zuhause – Küche ✓', color: '#22c55e', position: 2, archived: false, parent_id: id.work, created_at: 1_700_000_000_001, deleted_at: null })
  put('section', id.section, { name: 'Next up', project_id: id.work, position: 1, created_at: 1_700_000_000_002, deleted_at: null })
  put('label', id.label, { name: 'errand', color: '#f59e0b', position: 1, created_at: 1_700_000_000_003, deleted_at: null })
  put('task', task.a, {
    title: 'Write the report', description: 'Two **pages**, with a table', project_id: id.work, parent_id: null, priority: 1,
    due: { date: '2026-11-02', time: '09:30' }, labels: [id.label], position: 1, created_at: 1_700_000_000_010, completed_at: null, deleted_at: null,
    estimate_minutes: 45, deadline: '2026-11-05', section_id: id.section,
  })
  put('task', task.b, { title: 'Ruf Oma an 📞', description: '', project_id: id.home, parent_id: null, priority: 3, due: { date: '2026-11-03' }, labels: [], position: 2, created_at: 1_700_000_000_011, completed_at: null, deleted_at: null })
  put('task', task.sub, { title: 'Collect the numbers', description: '', project_id: id.work, parent_id: task.a, priority: 4, due: null, labels: [], position: 1, created_at: 1_700_000_000_012, completed_at: null, deleted_at: null })
  put('task', task.done, { title: 'Done already', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [id.label], position: 3, created_at: 1_700_000_000_013, completed_at: 1_700_000_100_000, deleted_at: null })
  put('task', task.gone, { title: 'Deleted task', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 4, created_at: 1_700_000_000_014, completed_at: null, deleted_at: Date.now() - 3_600_000 }) // recent: the trash purge keeps it
  put('task', task.a, { title: 'Write the quarterly report' }) // a second write to one field
  put('view', id.view, { name: 'Urgent', query: 'p1 & !done', position: 1, created_at: 1_700_000_000_020, deleted_at: null })
  const me = (await client({ token })('GET', '/api/v1/me')).user
  put('comment', task.comment, { task_id: task.a, parent_id: null, body: 'Draft is in the shared folder', author_id: me.id, mentions: [], created_at: 1_700_000_000_030, edited_at: null, deleted_at: null })

  // Fields a release does not know are refused one op at a time; keep what it took.
  const res = await client({ token })('POST', '/api/v1/sync', { device, cursor: 0, ops })
  const rejected = new Set((res.rejected ?? []).map((r) => r.id))
  const unknown = ops.filter((o) => rejected.has(o.id)).map((o) => `${o.entity}.${o.field}`)
  if (unknown.length) console.log(`  the release refused ${unknown.length} op(s): ${[...new Set(unknown)].join(', ')}`)
  if (res.applied < ops.length * 0.8) fail(`the release applied ${res.applied} of ${ops.length} ops`)
  return { token, task }
}

/** Every op of the account, in log order, from a new device. */
async function pullOps(api) {
  const device = `reader-${randomUUID()}`
  const all = []
  let cursor = 0
  for (let i = 0; i < 100; i++) {
    const res = await api('POST', '/api/v1/sync', { device, cursor, ops: [] })
    all.push(...res.ops)
    cursor = res.cursor
    if (!res.hasMore) break
  }
  return all
}

const opKey = (o) => JSON.stringify([o.id, o.entity, o.entityId, o.field, o.value, o.ts, o.device])

/** Every row and field the release exported is exported the same way now. Fields the new build adds are allowed. */
function compareExports(before, after) {
  const problems = []
  for (const [key, rows] of Object.entries(before)) {
    if (!Array.isArray(rows)) continue
    const now = after[key]
    if (!Array.isArray(now)) {
      problems.push(`export.${key} is gone`)
      continue
    }
    const byId = new Map(now.map((r) => [r.id, r]))
    for (const row of rows) {
      const got = byId.get(row.id)
      if (!got) {
        problems.push(`export.${key}: row ${row.id} is gone`)
        continue
      }
      for (const [f, v] of Object.entries(row)) {
        if (JSON.stringify(got[f]) !== JSON.stringify(v)) problems.push(`export.${key}[${row.id}].${f}: ${JSON.stringify(v)} became ${JSON.stringify(got[f])}`)
      }
    }
  }
  return problems
}

async function checkVersion(tag) {
  console.log(`== upgrade from ${tag}`)
  const work = mkdtempSync(path.join(tmpdir(), `opentodo-upgrade-${tag}-`))
  const data = path.join(work, 'data')
  try {
    step(`start ${tag} on a fresh data directory`)
    const old = await startServer(await releaseBinary(tag), data, tag)
    let seeded, beforeExport, beforeOps
    try {
      step('write the data through its API')
      seeded = await seed()
      const api = client({ token: seeded.token })
      beforeExport = await api('GET', '/api/v1/export')
      beforeOps = await pullOps(api)
    } finally {
      await old.stop()
    }
    const oldSchema = new DatabaseSync(path.join(data, 'opentodo.db'), { readOnly: true })
    const fromVersion = oldSchema.prepare('PRAGMA user_version').get().user_version
    oldSchema.close()

    step(`start the server under test (schema ${fromVersion} → ${latestSchema})`)
    const now = await startServer(bin, data, 'current')
    try {
      const api = client({ token: seeded.token })
      step('the token and the password still work')
      await api('GET', '/api/v1/me')
      await client({})('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD })

      step('the export and the op log read back the same')
      const problems = compareExports(beforeExport, await api('GET', '/api/v1/export'))
      const afterOps = new Set((await pullOps(api)).map(opKey))
      const lost = beforeOps.filter((o) => !afterOps.has(opKey(o)))
      if (lost.length) problems.push(`${lost.length} op(s) changed or lost, e.g. ${opKey(lost[0])}`)
      if (problems.length) fail(`data changed in the upgrade from ${tag}:\n  ${problems.slice(0, 20).join('\n  ')}`)
      console.log(`  ${beforeOps.length} ops and ${Object.values(beforeExport).filter(Array.isArray).reduce((n, r) => n + r.length, 0)} exported rows unchanged`)

      step('a new write is accepted')
      const op = { id: randomUUID(), entity: 'task', entityId: seeded.task.b, field: 'title', value: 'Called Oma', ts: Date.now(), device: `after-${randomUUID()}` }
      const res = await api('POST', '/api/v1/sync', { device: op.device, cursor: 0, ops: [op] })
      if (res.applied !== 1) fail(`write after the upgrade: ${JSON.stringify(res)}`)
      const exported = await api('GET', '/api/v1/export')
      if (exported.tasks.find((t) => t.id === seeded.task.b)?.title !== 'Called Oma') fail('the write after the upgrade does not read back')
    } finally {
      await now.stop()
    }
    const db = new DatabaseSync(path.join(data, 'opentodo.db'), { readOnly: true })
    const version = db.prepare('PRAGMA user_version').get().user_version
    db.close()
    if (version !== latestSchema) fail(`schema version ${version} after the upgrade, want ${latestSchema}`)
    console.log(`  upgrade from ${tag} OK (schema ${fromVersion} → ${version})`)
  } catch (e) {
    for (const f of readdirSync(work).filter((f) => f.endsWith('.log'))) console.log(`--- ${f}\n${readFileSync(path.join(work, f), 'utf8').slice(-4000)}`)
    throw e
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (!existsSync(bin)) fail(`no server binary at ${bin} (make build)`)
const list = await versions()
if (!list.length) fail('no release to upgrade from')
for (const tag of list) await checkVersion(tag)
console.log(`UPGRADE OK (${list.join(', ')})`)
