// The agent tools a routine plans its writes through, as internal/agenttools
// plans them for the routine caller (routines-engine D4, D11): only the tools
// and arguments routine steps use. Entity ids derive from the call's
// client_request_id exactly as on the server (requestSeed, entityID), so a run
// planned on a device and the same occurrence planned on the server name the
// same entities. Pure: the snapshot is the run's view of the rows.
import { nameId } from '../../ids'
import { running, startBatch, type EntryLike } from '../../time'
import { dayPartFields, type DayPart } from '../../dayParts'
import type { Membership } from '../../types'
import type { Change, Row } from './types'

/** A well-formed call the planner refuses (agenttools.ToolError); code becomes the step's error. */
export class ToolError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

/** A malformed call (agenttools.ArgError): the step fails with invalid_argument. */
export class ArgError extends Error {}

export const PER_CALL = 50
const SECTION_GAP = 1000
const MAX_PENDING_APPENDS = 100
const APPEND_ID = /^[A-Za-z0-9_-]{1,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const COLOR = /^#[0-9a-fA-F]{6}$/

/** What the tools read: the run's rows with the planned changes laid over. */
export interface ToolSnapshot {
  userId: string
  /** The routine caller's token id: rule:<rule-id>. */
  tokenId: string
  now: number
  tasks: Map<string, Row>
  projects: Map<string, Row>
  labels: Row[]
  sections: Map<string, Row>
  timeEntries: Row[]
  prefs: Row
  memberships: Map<string, Membership>
}

export interface ToolPlan { changes: Change[]; result?: Record<string, unknown> }

type Args = Record<string, unknown>

const str = (r: Row | undefined, f: string): string => (typeof r?.[f] === 'string' ? (r[f] as string) : '')
const isDeleted = (r: Row | undefined): boolean => !!r && r.deleted_at !== null && r.deleted_at !== undefined
const notFound = (entity: string) => new ToolError('not_found', `no such ${entity} (unknown, deleted, or not visible to you); nothing was changed`)
const forbidden = () => new ToolError('forbidden', 'your role does not allow this change; nothing was changed')

/** requestSeed: the same user, token and request id always name the same entities. */
export function requestSeed(userId: string, tokenId: string, requestId: string): string {
  return nameId('agent-request', `${userId}\x00${tokenId}\x00${requestId}`)
}

export function entityId(seed: string, i: number): string {
  return nameId('agent-entity', `${seed}:${i}`)
}

function seedOf(s: ToolSnapshot, a: Args): string {
  const v = a.client_request_id
  if (v === undefined) return ''
  if (typeof v !== 'string' || !v.trim()) throw new ArgError('client_request_id: must not be empty')
  return requestSeed(s.userId, s.tokenId, v)
}

function newId(seed: string, i: number): string {
  if (seed) return entityId(seed, i)
  return globalThis.crypto.randomUUID()
}

function chosenId(a: Args, prefix: string): string {
  const v = a.id
  if (v === undefined || v === '') return ''
  if (typeof v !== 'string' || !UUID.test(v.toLowerCase())) throw new ArgError(`${prefix}id: must be a UUID`)
  return v.toLowerCase()
}

function text(a: Args, name: string, required: boolean, max: number): string | null {
  const v = a[name]
  if (v === undefined || v === null) {
    if (required) throw new ArgError(`${name}: is required`)
    return null
  }
  if (typeof v !== 'string') throw new ArgError(`${name}: must be a string`)
  if (required && !v.trim()) throw new ArgError(`${name}: must not be empty`)
  if (Array.from(v).length > max) throw new ArgError(`${name}: at most ${max} characters`)
  return v
}

function color(a: Args, def: string): string {
  if (a.color === undefined) return def
  if (typeof a.color !== 'string' || !COLOR.test(a.color)) throw new ArgError('color: must be #rrggbb')
  return a.color
}

/** The caller's role in a project ("owner" for personal ones). */
export function roleIn(s: ToolSnapshot, pid: string): string {
  return (pid && s.memberships.get(pid)?.role) || 'owner'
}

/** internal/sync CanWrite. */
export function canWrite(role: string, entity: string, field: string): boolean {
  switch (role) {
    case 'owner': return true
    case 'admin': return ['task', 'section', 'field', 'note'].includes(entity) || (entity === 'project' && field !== 'deleted_at' && field !== 'workspace_id')
    case 'editor': return ['task', 'section', 'field', 'note'].includes(entity) || (entity === 'project' && (field === 'description' || field === 'notes_doc'))
  }
  return false
}

function liveTask(s: ToolSnapshot, id: string): Row | undefined {
  const t = s.tasks.get(id)
  return t && !isDeleted(t) ? t : undefined
}

function liveProject(s: ToolSnapshot, id: string): Row | undefined {
  const p = s.projects.get(id)
  return p && !isDeleted(p) ? p : undefined
}

function liveLabels(s: ToolSnapshot): Row[] {
  return s.labels.filter((l) => !isDeleted(l))
}

/** Label names (case-insensitive) or ids to ids (labelIDsFor). */
function labelIds(s: ToolSnapshot, prefix: string, v: unknown): string[] {
  if (!Array.isArray(v)) throw new ArgError(`${prefix}labels: must be an array of strings`)
  if (v.length > 50) throw new ArgError(`${prefix}labels: at most 50 labels`)
  const out: string[] = []
  for (const n of v as string[]) {
    let id = ''
    const live = liveLabels(s)
    if (live.some((l) => str(l, 'id') === n)) id = n
    else {
      const hit = live.find((l) => { const name = str(l, 'name'); return name && !name.startsWith('enc:') && name.toLowerCase() === n.trim().toLowerCase() })
      if (hit) id = str(hit, 'id')
    }
    if (!id) throw new ArgError(`${prefix}labels: no label named "${n}" (create it with create_label first)`)
    if (!out.includes(id)) out.push(id)
  }
  return out
}

const calendarDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

/** The planning fields create_tasks reads (planningPatch, without blockers and locations). */
function planningPatch(p: string, it: Args, patch: Record<string, unknown>): void {
  if ('deadline' in it) {
    const v = it.deadline
    if (v !== null && (typeof v !== 'string' || !calendarDate(v))) throw new ArgError(`${p}deadline: must be a calendar date in YYYY-MM-DD form or null`)
    patch.deadline = v
  }
  if ('start' in it) {
    const v = it.start
    if (v !== null && (typeof v !== 'string' || (v !== 'someday' && !calendarDate(v)))) throw new ArgError(`${p}start: must be a calendar date in YYYY-MM-DD form, "someday" or null`)
    patch.start = v
  }
  for (const f of ['evening', 'span']) {
    if (f in it) {
      if (typeof it[f] !== 'boolean') throw new ArgError(`${p}${f}: must be true or false`)
      patch[f] = it[f]
    }
  }
  if ('day_part' in it) {
    const v = it.day_part
    if (v !== null && !['morning', 'afternoon', 'evening'].includes(v as string)) throw new ArgError(`${p}day_part: must be morning, afternoon, evening or null`)
    Object.assign(patch, dayPartFields((v as DayPart | null) ?? null))
  }
  if ('energy' in it) {
    const v = it.energy
    if (v !== null && v !== '' && !['deep', 'medium', 'low'].includes(v as string)) throw new ArgError(`${p}energy: must be deep, medium, low or null`)
    patch.energy = v ?? ''
  }
}

function createTasks(s: ToolSnapshot, a: Args): ToolPlan {
  const list = a.items as Args[]
  const seed = seedOf(s, a)
  const changes: Change[] = []
  const chosen = new Set<string>()
  list.forEach((it, i) => {
    const p = `items[${i}].`
    const title = text(it, 'title', true, 500)!
    const desc = text(it, 'description', false, 20000) ?? ''
    let id = chosenId(it, p)
    if (!id) id = newId(seed, i)
    else {
      if (chosen.has(id)) throw new ArgError(`${p}id: each id may appear only once per call`)
      chosen.add(id)
    }
    const patch: Record<string, unknown> = {
      title: title.trim(), description: desc, project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: s.now + i,
      created_at: s.now, completed_at: null, deleted_at: null,
    }
    let pid = typeof it.project_id === 'string' ? it.project_id : ''
    if (pid) {
      if (!liveProject(s, pid)) throw notFound('project')
      patch.project_id = pid
      if (!canWrite(roleIn(s, pid), 'task', 'title')) throw forbidden()
    }
    const sid = typeof it.section_id === 'string' ? it.section_id : ''
    if (sid) {
      const sec = s.sections.get(sid)
      if (!sec || isDeleted(sec) || str(sec, 'project_id') !== pid) throw new ArgError(`${p}section_id: no such section in that project`)
      patch.section_id = sid
    }
    const parent = typeof it.parent_id === 'string' ? it.parent_id : ''
    if (parent) {
      const pt = liveTask(s, parent)
      if (!pt) throw notFound('task')
      const pp = str(pt, 'project_id')
      if (!pid && !('project_id' in it) && pp) {
        pid = pp
        patch.project_id = pid
        if (!canWrite(roleIn(s, pid), 'task', 'title')) throw forbidden()
      }
      if (pp !== pid) throw new ArgError(`${p}parent_id: the parent task must be in the same project`)
      patch.parent_id = parent
    }
    for (const f of ['priority', 'due', 'estimate_minutes']) if (it[f] !== undefined && it[f] !== null) patch[f] = it[f]
    if (it.labels !== undefined && it.labels !== null) patch.labels = labelIds(s, p, it.labels)
    if (typeof it.recurrence === 'string') patch.recurrence = it.recurrence
    planningPatch(p, it, patch)
    changes.push({ entity: 'task', entityId: id, create: true, patch })
  })
  return { changes }
}

function addComment(s: ToolSnapshot, a: Args): ToolPlan {
  const taskId = typeof a.task_id === 'string' ? a.task_id : ''
  if (!taskId) throw new ArgError('task_id: the task id is required')
  const body = text(a, 'body', true, 10000)!
  if (!liveTask(s, taskId)) throw notFound('task')
  const id = chosenId(a, '') || globalThis.crypto.randomUUID()
  const patch = { task_id: taskId, author_id: s.userId, body, parent_id: null, mentions: [], created_at: s.now, edited_at: null, deleted_at: null }
  return { changes: [{ entity: 'comment', entityId: id, create: true, patch }] }
}

function createProject(s: ToolSnapshot, a: Args): ToolPlan {
  const name = text(a, 'name', true, 200)!
  const c = color(a, '#64748b')
  const seed = seedOf(s, a)
  const id = chosenId(a, '') || newId(seed, 0)
  const patch: Record<string, unknown> = { name: name.trim(), color: c, position: s.now, archived: false, parent_id: null, created_at: s.now, deleted_at: null }
  if (typeof a.icon === 'string') patch.icon = a.icon
  const parent = typeof a.parent_id === 'string' ? a.parent_id : ''
  if (parent) {
    if (!liveProject(s, parent)) throw notFound('project')
    patch.parent_id = parent
  }
  return { changes: [{ entity: 'project', entityId: id, create: true, patch }] }
}

/** AppendBlock: Markdown added at the end of a note after a blank line. */
export function appendBlock(note: string, add: string): string {
  const n = note.replace(/[ \t\r\n]+$/, '')
  return n ? `${n}\n\n${add}` : add
}

function updateProject(s: ToolSnapshot, a: Args): ToolPlan {
  const id = typeof a.id === 'string' ? a.id : ''
  if (!id) throw new ArgError('id: the project id is required')
  const patch: Record<string, unknown> = {}
  const name = text(a, 'name', false, 200)
  if (name !== null) {
    if (!name.trim()) throw new ArgError('name: must not be empty')
    patch.name = name.trim()
  }
  if (a.color !== undefined) patch.color = color(a, '')
  if (a.icon !== undefined) patch.icon = a.icon
  const p = liveProject(s, id)
  if (!p) throw notFound('project')
  const role = roleIn(s, id)
  if (a.append_description !== undefined) {
    if (!canWrite(role, 'project', 'description')) throw forbidden()
    const add = text(a, 'append_description', true, 20000)!
    patch.description = appendBlock(str(p, 'description'), add)
  }
  if (!Object.keys(patch).length) throw new ArgError('nothing to change: give name, color, icon, parent_id, position, workspace_id, flow_mode, status, description or append_description')
  for (const f of Object.keys(patch)) if (!canWrite(role, 'project', f)) throw forbidden()
  for (const [f, v] of Object.entries(patch)) if (JSON.stringify(p[f] ?? null) === JSON.stringify(v)) delete patch[f]
  if (!Object.keys(patch).length) return { changes: [] }
  return { changes: [{ entity: 'project', entityId: id, patch }] }
}

function descendants(s: ToolSnapshot, id: string): string[] {
  const children = new Map<string, string[]>()
  for (const [pid, p] of s.projects) {
    if (isDeleted(p)) continue
    const parent = str(p, 'parent_id')
    if (parent) children.set(parent, [...(children.get(parent) ?? []), pid])
  }
  const out: string[] = []
  const seen = new Set([id])
  const queue = [id]
  while (queue.length) {
    const cur = queue.shift()!
    for (const k of [...(children.get(cur) ?? [])].sort()) {
      if (!seen.has(k)) { seen.add(k); out.push(k); queue.push(k) }
    }
  }
  return out
}

function archiveProjects(s: ToolSnapshot, a: Args): ToolPlan {
  const id = typeof a.id === 'string' ? a.id : ''
  if (!id) throw new ArgError('id: the project id is required')
  const on = a.archived === true
  if (!liveProject(s, id)) throw notFound('project')
  const targets = on ? [id, ...descendants(s, id)] : [id]
  for (const pid of targets) if (!canWrite(roleIn(s, pid), 'project', 'archived')) throw forbidden()
  const changes: Change[] = []
  for (const pid of targets) {
    if ((s.projects.get(pid)?.archived === true) === on) continue
    changes.push({ entity: 'project', entityId: pid, patch: { archived: on } })
  }
  if (changes.length > PER_CALL) throw new ArgError(`id: archiving this project would change ${changes.length} projects, more than ${PER_CALL} per call`)
  return { changes }
}

function createSections(s: ToolSnapshot, a: Args): ToolPlan {
  const pid = typeof a.project_id === 'string' ? a.project_id : ''
  if (!pid) throw new ArgError('project_id: the project id is required')
  const list = a.items as Args[]
  const seed = seedOf(s, a)
  if (!liveProject(s, pid)) throw notFound('project')
  const role = roleIn(s, pid)
  if (!canWrite(role, 'section', 'name')) throw forbidden()
  // The project's stored sections (the server reads them from the database, not the plan).
  const existing = [...s.sections.values()].filter((x) => str(x, 'project_id') === pid && !isDeleted(x) && !x._planned)
    .sort((x, y) => (Number(x.position) || 0) - (Number(y.position) || 0))
  let next = existing.length ? (Number(existing[existing.length - 1].position) || 0) + SECTION_GAP : s.now
  const changes: Change[] = []
  list.forEach((it, i) => {
    const p = `items[${i}].`
    const name = text(it, 'name', true, 200)!
    const id = chosenId(it, p) || newId(seed, i)
    changes.push({ entity: 'section', entityId: id, create: true, patch: { name: name.trim(), project_id: pid, position: next, color: null, icon: null, created_at: s.now, deleted_at: null } })
    next += SECTION_GAP
  })
  return { changes }
}

function createLabel(s: ToolSnapshot, a: Args): ToolPlan {
  const name = text(a, 'name', true, 100)!.trim()
  const c = color(a, '#64748b')
  const seed = seedOf(s, a)
  const id = chosenId(a, '') || newId(seed, 0)
  for (const l of liveLabels(s)) {
    const n = str(l, 'name')
    if (str(l, 'id') === id || (n && !n.startsWith('enc:') && n.toLowerCase() === name.toLowerCase())) return { changes: [] }
  }
  return { changes: [{ entity: 'label', entityId: id, create: true, patch: { name, color: c, position: s.now, created_at: s.now, deleted_at: null } }] }
}

/** FavouriteEntries: trimmed kind:id entries in order, de-duplicated. */
export function favouriteEntries(v: string): string[] {
  const out: string[] = []
  for (const part of v.split(',')) {
    const e = part.trim()
    if (e && e.includes(':') && !out.includes(e)) out.push(e)
  }
  return out
}

function setFavourite(s: ToolSnapshot, a: Args): ToolPlan {
  const id = typeof a.id === 'string' ? a.id : ''
  if (!id) throw new ArgError('id: the project id is required')
  const on = a.favourite === true
  if (!liveProject(s, id)) throw notFound('project')
  const list = favouriteEntries(str(s.prefs, 'favourites'))
  const entry = `project:${id}`
  const has = list.includes(entry)
  if (on === has) return { changes: [] }
  const next = on ? [...list, entry] : list.filter((e) => e !== entry)
  return { changes: [{ entity: 'user_prefs', entityId: 'me', patch: { favourites: next.join(',') } }] }
}

function appendToNote(s: ToolSnapshot, a: Args): ToolPlan {
  const taskId = typeof a.task_id === 'string' ? a.task_id : ''
  const txt = text(a, 'text', true, 20000)!
  const aid = typeof a.append_id === 'string' && a.append_id ? a.append_id : globalThis.crypto.randomUUID()
  if (!APPEND_ID.test(aid)) throw new ArgError('append_id: 1 to 64 letters, digits, - or _')
  const t = liveTask(s, taskId)
  const pid = t ? str(t, 'project_id') : ''
  // A task of a project the caller cannot see (or one in the Trash) is not found.
  if (!t || (pid && !liveProject(s, pid))) throw notFound('task')
  const field = `appends.${aid}`
  if (!canWrite(roleIn(s, pid), 'task', field)) throw forbidden()
  const pending = Object.entries(t).filter(([f, v]) => f.startsWith('appends.') && v !== '').length
  if (field in t) throw new ToolError('append_taken', 'this append id was used already; nothing was changed')
  if (pending >= MAX_PENDING_APPENDS) throw new ToolError('too_many_appends', 'the note has too many appends waiting; nothing was changed')
  return { changes: [{ entity: 'task', entityId: taskId, patch: { [field]: txt } }] }
}

function entries(s: ToolSnapshot): EntryLike[] {
  return s.timeEntries.filter((e) => !isDeleted(e)) as unknown as EntryLike[]
}

function startTimer(s: ToolSnapshot, a: Args): ToolPlan {
  const taskId = typeof a.task_id === 'string' ? a.task_id : ''
  if (!taskId) throw new ArgError('task_id: the task id is required')
  const seed = seedOf(s, a)
  const t = liveTask(s, taskId)
  if (!t) throw notFound('task')
  if (roleIn(s, str(t, 'project_id')) === 'viewer') throw forbidden()
  const id = chosenId(a, '') || newId(seed, 0)
  if (seed && s.timeEntries.some((e) => str(e, 'id') === id)) return { changes: [] }
  const list = entries(s)
  const changes: Change[] = []
  const run = running(list, s.userId)
  if (run) {
    if (a.stop_running !== true || !liveTask(s, run.task_id)) throw new ToolError('timer_running', 'another timer of the user is running; nothing was changed')
    for (const rp of startBatch(list, s.userId, s.now)) changes.push({ entity: 'time_entry', entityId: rp.id, patch: { ended_at: rp.ended_at } })
  }
  changes.push({ entity: 'time_entry', entityId: id, create: true, patch: {
    task_id: taskId, user_id: s.userId, started_at: s.now, ended_at: null, device_id: `agent:${s.tokenId}`, note: '', created_at: s.now, deleted_at: null,
  } })
  return { changes }
}

function stopTimer(s: ToolSnapshot): ToolPlan {
  const list = entries(s)
  const run = running(list, s.userId)
  if (!run || !liveTask(s, run.task_id)) throw new ToolError('not_found', 'no timer of the user is running; nothing was changed')
  return { changes: startBatch(list, s.userId, s.now).map((rp) => ({ entity: 'time_entry', entityId: rp.id, patch: { ended_at: rp.ended_at } })) }
}

const TOOLS: Record<string, (s: ToolSnapshot, a: Args) => ToolPlan> = {
  create_tasks: createTasks, add_comment: addComment, create_project: createProject, update_project: updateProject, archive_projects: archiveProjects,
  create_sections: createSections, create_label: createLabel, set_favourite: setFavourite, append_to_note: appendToNote, start_timer: startTimer, stop_timer: stopTimer,
}

/** Plans one tool call; ToolError and ArgError describe a refusal. */
export function planTool(s: ToolSnapshot, name: string, args: Args): ToolPlan {
  const fn = TOOLS[name]
  if (!fn) throw new ToolError('invalid_argument', `${name} is not available on this device`)
  return fn(s, args)
}
