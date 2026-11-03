// The fixed scenario of an upgrade fixture (OpenSpec change stability-contract,
// design D4), driven through the public API of whatever version runs at <base>.
// A step the version does not have (404 or 405) is skipped and the manifest
// records the counts the version itself reports at the end, so the upgrade
// test compares the same reads before and after migrating.
//
//   node scripts/release/upgrade-scenario.mjs http://127.0.0.1:18090 <manifest.json> [export.json]
//
// Run by scripts/release/upgrade-fixture.sh, which starts the version and
// stores its data directory next to the manifest.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

export const OWNER = { email: 'owner@example.com', name: 'Owner', password: 'upgrade fixture password one' }
export const MEMBER = { email: 'member@example.com', name: 'Member', password: 'upgrade fixture password two' }
export const ATTACHMENT = 'An attachment written by the upgrade fixture.\n'

/** A client with its own cookie jar; `token` switches it to a bearer token. */
export function client(base, token = '') {
  const cookies = new Map()
  async function call(method, path, body, { raw = false, form = null } = {}) {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    else if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    if (method !== 'GET') headers.Origin = base
    let payload
    if (form) payload = form
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    const res = await fetch(base + path, { method, headers, body: payload, redirect: 'manual' })
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      cookies.set(pair.slice(0, i), pair.slice(i + 1))
    }
    if (raw) return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) }
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { status: res.status, json }
  }
  return { call }
}

const absent = (r) => r.status === 404 || r.status === 405

/** must: the call succeeded, else the scenario stops with the answer. */
function must(r, what) {
  if (r.status < 200 || r.status > 299) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json
}

/** pull: every op visible from cursor on, for device. */
export async function pull(c, device, cursor) {
  let n = 0
  let at = cursor
  for (let i = 0; i < 1000; i++) {
    const r = must(await c.call('POST', '/api/v1/sync', { device, cursor: at, ops: [] }), 'sync pull')
    n += (r.ops ?? []).length
    at = r.cursor
    if (!r.hasMore) return { ops: n, cursor: at }
  }
  throw new Error('sync pull did not finish')
}

/** counts: what the version reports, read the same way the upgrade test reads it. */
export async function counts(c, ids) {
  const list = async (path, key) => {
    const r = await c.call('GET', path)
    return absent(r) ? null : (must(r, path)[key] ?? []).length
  }
  const out = {
    projects: await list('/api/v1/projects', 'projects'),
    sections: await list('/api/v1/sections', 'sections'),
    labels: await list('/api/v1/labels', 'labels'),
    tasks: await list('/api/v1/tasks', 'tasks'),
    tasks_with_deleted: await list('/api/v1/tasks?include_deleted=true', 'tasks'),
    reminders: await list('/api/v1/reminders', 'reminders'),
    time_entries: await list('/api/v1/time-entries', 'entries'),
    members: await list(`/api/v1/projects/${ids.shared}/members`, 'members'),
    comments: 0,
    attachments: null,
  }
  for (const id of ids.tasks) {
    out.comments += (await list(`/api/v1/tasks/${id}/comments`, 'comments')) ?? 0
    const a = await list(`/api/v1/tasks/${id}/attachments`, 'attachments')
    if (a !== null) out.attachments = (out.attachments ?? 0) + a
  }
  return out
}

export async function runScenario(base) {
  const owner = client(base)
  must(await owner.call('POST', '/api/v1/auth/register', OWNER), 'register the owner')
  const token = must(await owner.call('POST', '/api/v1/tokens', { name: 'upgrade fixture' }), 'create a token').secret
  const api = client(base, token)

  const member = client(base)
  must(await member.call('POST', '/api/v1/auth/register', MEMBER), 'register the member')

  const create = async (plural, body) => must(await api.call('POST', `/api/v1/${plural}`, body), `create in ${plural}`).id
  const home = await create('labels', { name: 'Home', color: '#16a34a' })
  const work = await create('labels', { name: 'Work', color: '#2563eb' })
  const garden = await create('projects', { name: 'Garden', color: '#65a30d' })
  const shared = await create('projects', { name: 'Shared plans', color: '#9333ea' })
  const todo = await create('sections', { name: 'To do', project_id: garden })
  const doing = await create('sections', { name: 'Doing', project_id: garden })
  const tasks = {}
  tasks.prune = await create('tasks', { title: 'Prune the roses', description: 'Before the frost.\n\n- gloves\n- shears', project_id: garden, section_id: todo, priority: 1, labels: [home], due: { date: '2026-11-20' } })
  tasks.water = await create('tasks', { title: 'Water the beds', project_id: garden, section_id: doing, priority: 2, labels: [home, work], due: { date: '2026-11-21', time: '09:30' } })
  tasks.gloves = await create('tasks', { title: 'Buy gloves', project_id: garden, parent_id: tasks.prune, priority: 4 })
  tasks.daily = await create('tasks', { title: 'Check the greenhouse', priority: 3, due: { date: '2026-11-10' }, recurrence: 'every day' })
  tasks.done = await create('tasks', { title: 'Order seeds', priority: 4 })
  tasks.gone = await create('tasks', { title: 'Old idea', priority: 4 })
  tasks.trip = await create('tasks', { title: 'Plan the trip', project_id: shared, priority: 2, due: { date: '2026-12-01' } })
  must(await api.call('PATCH', `/api/v1/tasks/${tasks.done}`, { completed_at: 1762000000000 }), 'complete a task')
  must(await api.call('DELETE', `/api/v1/tasks/${tasks.gone}`), 'delete a task')
  const reminder = await api.call('POST', '/api/v1/reminders', { task_id: tasks.water, kind: 'relative', offset_minutes: 30 })
  const skipped = []
  if (reminder.status !== 201) skipped.push(`reminder (${reminder.status})`)

  // A phone that synced up to here; the upgrade test continues it from this cursor.
  const phone = await pull(api, 'fixture-phone', 0)

  const share = await owner.call('POST', `/api/v1/projects/${shared}/members`, { email: MEMBER.email, role: 'editor' })
  if (share.status > 299) skipped.push(`sharing (${share.status})`)
  if (share.status === 202) {
    // From the versions where a member accepts an invitation to a project first.
    const inv = must(await member.call('GET', '/api/v1/me/member-invitations'), 'list invitations').invitations ?? []
    for (const i of inv) must(await member.call('POST', `/api/v1/me/member-invitations/${i.id}/accept`), 'accept the invitation')
  }
  must(await api.call('POST', `/api/v1/tasks/${tasks.prune}/comments`, { body: 'Use the **sharp** shears.' }), 'comment')
  must(await api.call('POST', `/api/v1/tasks/${tasks.trip}/comments`, { body: 'Train or car?' }), 'comment')

  let attachment = null
  const form = new FormData()
  form.append('file', new Blob([ATTACHMENT], { type: 'text/plain' }), 'notes.txt')
  const up = await api.call('POST', `/api/v1/tasks/${tasks.prune}/attachments`, undefined, { form })
  if (up.status === 201) attachment = { id: up.json.id, sha256: createHash('sha256').update(ATTACHMENT).digest('hex'), size: Buffer.byteLength(ATTACHMENT) }
  else skipped.push(`attachment (${up.status})`)

  const entry = await api.call('POST', '/api/v1/time-entries', { taskId: tasks.water, startedAt: 1762000000000, endedAt: 1762001800000 })
  if (entry.status > 299) skipped.push(`time entry (${entry.status})`)

  // The member turns on end-to-end encryption (a key record only: the server never sees a key).
  const b64 = (n, seed) => Buffer.alloc(n, seed).toString('base64url')
  const keys = await member.call('PUT', '/api/v1/encryption/keys', { version: 1, kdf: 1, iterations: 600000, salt: b64(16, 1), wrappedByPassphrase: b64(40, 2), wrappedByRecovery: b64(40, 3) })
  if (keys.status > 299) skipped.push(`encryption (${keys.status})`)

  must(await api.call('PATCH', `/api/v1/tasks/${tasks.water}`, { title: 'Water the raised beds' }), 'edit after the phone synced')

  const ids = { labels: [home, work], projects: [garden, shared], sections: [todo, doing], shared, tasks: Object.values(tasks), attachment: attachment?.id ?? null }
  const all = await pull(api, 'fixture-count', 0)
  const after = await pull(api, 'fixture-count-after', phone.cursor)
  const exp = must(await api.call('GET', '/api/v1/export'), 'export')
  const manifest = {
    created_at: Date.now(),
    owner: OWNER,
    member: MEMBER,
    token,
    ids,
    attachment,
    member_encryption: keys.status <= 299,
    phone_cursor: phone.cursor,
    counts: await counts(api, ids),
    ops: all.ops,
    ops_after_phone_cursor: after.ops,
    export: { format: exp.format, version: exp.version, tasks: (exp.tasks ?? []).length },
    skipped,
  }
  return { manifest, exportDoc: exp }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [base, out, exportOut] = process.argv.slice(2)
  if (!base || !out) {
    console.error('usage: upgrade-scenario.mjs <base-url> <manifest.json> [export.json]')
    process.exit(2)
  }
  const { manifest, exportDoc } = await runScenario(base)
  writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')
  // The version's own export, which every later server must import (docs/stability.md).
  if (exportOut) writeFileSync(exportOut, JSON.stringify(exportDoc, null, 2) + '\n')
  console.log(JSON.stringify({ counts: manifest.counts, ops: manifest.ops, skipped: manifest.skipped }))
}
