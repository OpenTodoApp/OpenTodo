// Activity log on the client (OpenSpec `comments-and-activity`, design D4/D5).
// Events are never synced: they are derived from ops with the same rule the
// server uses (internal/activity), checked by the shared fixture
// internal/activity/testdata/activity_fixture.json in both test suites.
//
// applyOps records every task, project and comment op it applies in the local
// `activity` table (author, old value, project), so the history works offline;
// events are derived from those rows when a view reads them. Each project keeps
// at most LOCAL_RETENTION events; older ones come from the server on demand.
import Dexie from 'dexie'
import { api } from './api'
import { decryptActivityPage } from './e2ee'
import { db } from './db'
import { fieldValueLabel } from './fieldNames'
import type { ActivityChange, ActivityEntry, ActivityEvent, ActivityKind, ActivityPage, Op } from './types'
import { t, msg, translatedMap, translatedList } from './i18n'

/** Device prefix of a public link's ops (OpenSpec `public-links`). */
export const PUBLIC_DEVICE_PREFIX = 'public:'
/** The actor shown for a public link's ticks: the link, never the member who created it. */
export const PUBLIC_ACTOR_LABEL = msg('Public link')

/** True for an event made through a public link (public-links D6). */
export function isPublicEvent(ev: Pick<ActivityEvent, 'device'> | undefined): boolean {
  return !!ev?.device?.startsWith(PUBLIC_DEVICE_PREFIX)
}

/** Device prefix of a task page's guest ops (OpenSpec `task-pages` D5). */
export const PAGE_DEVICE_PREFIX = 'page:'
/** The actor shown for a task page's guest writes when the guest's name is not known here. */
export const PAGE_ACTOR_LABEL = msg('Guest (task page)')

/** True for an event a guest made through a task page (task-pages D5). */
export function isPageEvent(ev: Pick<ActivityEvent, 'device'> | undefined): boolean {
  return !!ev?.device?.startsWith(PAGE_DEVICE_PREFIX)
}

/**
 * The actor shown for a guest's event, or null for a member's: "Public link" for a
 * public link's tick, "<name> (guest, task page)" for a task page's write. The name
 * comes from the reply itself, or from the server's label for a tick; without
 * either it reads "Guest (task page)".
 */
export function guestActorLabel(ev: Pick<ActivityEvent, 'device' | 'changes' | 'actorName'> | undefined): string | null {
  if (isPublicEvent(ev)) return t(PUBLIC_ACTOR_LABEL)
  if (!isPageEvent(ev)) return null
  const typed = ev?.changes.find((c) => c.field === 'guest_name')?.to
  if (typeof typed === 'string' && typed) return t('{name} (guest, task page)', { name: typed })
  return ev?.actorName || t(PAGE_ACTOR_LABEL)
}

/** Ops by one actor on one entity within this many ms of the group's first op fold into one event. */
export const WINDOW_MS = 5000
/** Local events kept per project (a constant, not a setting). */
export const LOCAL_RETENTION = 500

const COUNTED = new Set(['task', 'project', 'comment'])
/**
 * Opaque document fields (collaborative-rich-text): never recorded or shown. Their
 * readable projection (`description`) is written in the same batch and counts.
 * Same list as `Opaque` in internal/activity.
 */
export const OPAQUE = new Set(['task.notes_doc', 'project.notes_doc'])
const counts = (op: { entity: string; field: string }) => COUNTED.has(op.entity) && !OPAQUE.has(`${op.entity}.${op.field}`)

/** An op as the rule needs it; `from` is an optional known old value (local rows). */
export type ActivityOp = Pick<Op, 'id' | 'entity' | 'entityId' | 'field' | 'value' | 'ts' | 'device'> & {
  actor?: string
  seq?: number
  from?: unknown
}

const key = (entity: string, id: string, field: string) => `${entity}:${id}:${field}`
const canon = (v: unknown) => JSON.stringify(v === undefined ? null : v)

interface Group {
  ev: ActivityEvent
  order: string[]
  changes: Map<string, ActivityChange>
}

/**
 * The shared rule (see internal/activity/activity.go for the full statement):
 * order by (ts, device) keeping input order for ties, take old values in that
 * order, fold ops by one actor on one entity within WINDOW_MS of the group's
 * first op, classify each group by the fields it touched, drop groups that
 * changed nothing. Returns events oldest first.
 */
export function deriveActivity(ops: ActivityOp[], prior?: Map<string, unknown>): ActivityEvent[] {
  const list: ActivityOp[] = []
  const commentTask = new Map<string, string>()
  for (const op of ops) {
    if (!counts(op)) continue
    list.push(op)
    if (op.entity === 'comment' && op.field === 'task_id' && typeof op.value === 'string') commentTask.set(op.entityId, op.value)
  }
  list.sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.device < b.device ? -1 : a.device > b.device ? 1 : 0))
  const last = new Map<string, unknown>()
  const open = new Map<string, Group>()
  const groups: Group[] = []
  for (const op of list) {
    const fk = key(op.entity, op.entityId, op.field)
    let from: unknown
    if (last.has(fk)) from = last.get(fk)
    else if (op.from !== undefined) from = op.from
    else from = prior?.has(fk) ? prior.get(fk) : null
    last.set(fk, op.value)
    const actor = op.actor ?? ''
    // A public link's ticks and a task page's guest writes group apart and carry
    // their device (public-links D6, task-pages D5).
    const pub = op.device?.startsWith(PUBLIC_DEVICE_PREFIX) || op.device?.startsWith(PAGE_DEVICE_PREFIX) ? op.device : ''
    const gk = `${actor}\u0000${op.entity}\u0000${op.entityId}${pub ? `\u0000${pub}` : ''}`
    let g = open.get(gk)
    if (!g || op.ts - g.ev.ts > WINDOW_MS) {
      g = {
        ev: { id: op.id, kind: 'edited', actor, entity: op.entity as ActivityEvent['entity'], entityId: op.entityId, ts: op.ts, opIds: [], changes: [], ...(pub ? { device: pub } : {}) },
        order: [], changes: new Map(),
      }
      open.set(gk, g)
      groups.push(g)
    }
    g.ev.opIds.push(op.id)
    let c = g.changes.get(op.field)
    if (!c) {
      c = { field: op.field, from: from ?? null, to: null }
      g.changes.set(op.field, c)
      g.order.push(op.field)
    }
    c.to = op.value ?? null
  }
  const out: ActivityEvent[] = []
  for (const g of groups) {
    const ev = finish(g, commentTask)
    if (ev) out.push(ev)
  }
  return out
}

function finish(g: Group, commentTask: Map<string, string>): ActivityEvent | null {
  const ev = g.ev
  const fields = [...g.order].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  let changed = false
  ev.changes = fields.map((f) => {
    const c = g.changes.get(f) as ActivityChange
    if (canon(c.from) !== canon(c.to)) changed = true
    return { field: c.field, from: c.from, to: c.to }
  })
  const has = (f: string) => g.changes.has(f)
  const isNull = (f: string) => g.changes.get(f)?.to === null
  let kind: ActivityKind
  if (ev.entity === 'comment') {
    const item = commentTask.get(ev.entityId)
    if (item !== undefined) ev.taskId = item
    if (has('created_at') || has('author_id') || has('task_id')) kind = 'commented'
    else if (has('deleted_at') && !isNull('deleted_at')) kind = 'comment_deleted'
    else kind = 'comment_edited'
    ev.changes = []
  } else {
    if (ev.entity === 'task') ev.taskId = ev.entityId
    if (has('created_at')) kind = 'created'
    else if (has('completed_at')) kind = isNull('completed_at') ? 'reopened' : 'completed'
    else if (has('deleted_at')) kind = isNull('deleted_at') ? 'restored' : 'deleted'
    else if (has('due')) kind = 'rescheduled'
    else if (has('assignee_id')) kind = isNull('assignee_id') ? 'unassigned' : 'assigned'
    else if (has('project_id')) kind = 'moved'
    else if (has('blocked_by')) kind = 'dependencies'
    else if (has('archived')) kind = g.changes.get('archived')?.to === true ? 'archived' : 'unarchived'
    else kind = 'edited'
  }
  ev.kind = kind
  if (!changed && kind !== 'created' && kind !== 'commented') return null
  return ev
}

/** Newest first: by ts, then id, both descending (the server's page order). */
export function newestFirst(events: ActivityEvent[]): ActivityEvent[] {
  return [...events].sort((a, b) => (a.ts !== b.ts ? b.ts - a.ts : a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}

// ---- local recording (called by applyOps inside its transaction) ----

/** One applied op to record: the op, its author and the field's value before it. */
export interface RecordInput {
  op: Op
  actor: string
  from: unknown
  /** The task the op belongs to (the task itself, or the commented task). */
  taskId?: string
  projectKey: string
}

/** Store entries for applied ops and enforce the per-project bound. Runs inside applyOps' transaction. */
export async function recordActivity(inputs: RecordInput[]): Promise<void> {
  const rows: ActivityEntry[] = []
  for (const { op, actor, from, taskId, projectKey } of inputs) {
    if (!counts(op)) continue
    const row: ActivityEntry = {
      id: op.id, actor, entity: op.entity as ActivityEntry['entity'], entityId: op.entityId, field: op.field, value: op.value,
      ts: op.ts, device: op.device, from, projectKey,
    }
    if (taskId) row.taskId = taskId
    rows.push(row)
  }
  if (rows.length === 0) return
  // An op already recorded (a retry, or the server echoing a rewritten value)
  // keeps its first old value and author; only the value can change.
  const existing = await db.activity.bulkGet(rows.map((r) => r.id))
  const put = rows.map((r, i) => {
    const e = existing[i]
    return e ? { ...e, value: r.value } : r
  })
  await db.activity.bulkPut(put)
  for (const k of new Set(rows.map((r) => r.projectKey))) await trimProject(k)
}

/** Every recorded op of a project, oldest first. */
function projectEntries(projectKey: string) {
  return db.activity.where('[projectKey+ts]').between([projectKey, Dexie.minKey], [projectKey, Dexie.maxKey])
}

/**
 * Keep at most `limit` derived events for a project, dropping the oldest first.
 * Each event has at least one op, so nothing is derived until the op count passes the bound.
 */
export async function trimProject(projectKey: string, limit = LOCAL_RETENTION): Promise<number> {
  if ((await projectEntries(projectKey).count()) <= limit) return 0
  const entries = await projectEntries(projectKey).toArray()
  const events = deriveActivity(entries)
  if (events.length <= limit) return 0
  // deriveActivity is oldest first: the first events are the ones to drop.
  const drop = events.slice(0, events.length - limit).flatMap((e) => e.opIds)
  // Ops that never form an event (no-op writes) older than the kept window go too.
  const keep = new Set(events.slice(events.length - limit).flatMap((e) => e.opIds))
  const oldestKept = Math.min(...events.slice(events.length - limit).map((e) => e.ts))
  for (const e of entries) if (!keep.has(e.id) && e.ts < oldestKept) drop.push(e.id)
  await db.activity.bulkDelete([...new Set(drop)])
  return events.length - limit
}

/** Drop recorded ops (refused by the server). */
export async function forgetActivity(opIds: string[]): Promise<void> {
  if (opIds.length) await db.activity.bulkDelete(opIds)
}

/** Drop everything recorded about purged or no longer visible entities. */
export async function forgetEntities(ids: Iterable<string>): Promise<void> {
  const list = [...ids]
  if (list.length === 0) return
  const byEntity = await db.activity.where('entityId').anyOf(list).primaryKeys()
  const byTask = await db.activity.where('taskId').anyOf(list).primaryKeys()
  await db.activity.bulkDelete([...new Set([...byEntity, ...byTask])])
}

// ---- reading ----

/** Locally derived events of a task (the task's ops and its comments' ops), newest first. */
export async function taskActivity(taskId: string): Promise<ActivityEvent[]> {
  const entries = await db.activity.where('taskId').equals(taskId).toArray()
  return newestFirst(deriveActivity(entries.sort((a, b) => a.ts - b.ts)))
}

/** Locally derived events of a project ('inbox' for the Inbox), newest first. */
export async function projectActivity(projectKey: string): Promise<ActivityEvent[]> {
  return newestFirst(deriveActivity(await projectEntries(projectKey).toArray()))
}

/** Op ids still waiting in the outbox: events containing one are shown as pending. */
export async function pendingOpIds(): Promise<Set<string>> {
  return new Set((await db.outbox.toArray()).map((o) => o.id))
}

export const isPending = (ev: ActivityEvent, pending: Set<string>) => ev.opIds.some((id) => pending.has(id))

/**
 * Append a server page to the events already shown, without duplicates: an event
 * is skipped when its id or any of its ops is already listed (a locally derived
 * event may have folded slightly differently).
 */
export function mergeOlder(shown: ActivityEvent[], page: ActivityEvent[]): ActivityEvent[] {
  const ids = new Set(shown.map((e) => e.id))
  const ops = new Set(shown.flatMap((e) => e.opIds))
  const extra = page.filter((e) => !ids.has(e.id) && !e.opIds.some((id) => ops.has(id)))
  return newestFirst([...shown, ...extra])
}

/** One page of older events from the server. */
export async function fetchActivity(entity: 'task' | 'project', id: string, before?: string): Promise<ActivityPage> {
  // Ciphertext values (OpenSpec e2ee) are decrypted for display.
  return decryptActivityPage(await api.activity(entity, id, before))
}

// ---- wording ----

function dueText(v: unknown): string {
  if (!v || typeof v !== 'object') return t('no date')
  const d = v as { date?: string; time?: string }
  return d.time ? `${d.date} ${d.time}` : d.date ?? t('no date')
}

/**
 * The verb phrase of an event, e.g. "completed", "moved the due date to
 * 2026-10-12", "assigned to Bob". `name` resolves account ids, `project`
 * project ids.
 */
export function describeEvent(ev: ActivityEvent, name: (id: string) => string, project: (id: string | null) => string, task?: (id: string) => string | undefined): string {
  const to = (f: string) => ev.changes.find((c) => c.field === f)?.to
  const isProject = ev.entity === 'project'
  switch (ev.kind) {
    case 'created': return isProject ? t('created the project') : t('created the task')
    case 'completed': return t('completed')
    case 'reopened': return t('reopened')
    case 'deleted': return isProject ? t('deleted the project') : t('deleted the task')
    case 'restored': return isProject ? t('restored the project') : t('restored the task')
    case 'rescheduled': return to('due') ? t('moved the due date to {date}', { date: dueText(to('due')) }) : t('removed the due date')
    case 'assigned': return t('assigned to {name}', { name: name(String(to('assignee_id'))) })
    case 'unassigned': return t('removed the assignee')
    case 'moved': return t('moved to {project}', { project: project((to('project_id') as string | null) ?? null) })
    case 'dependencies': {
      const ids = (to('blocked_by') as string[] | null) ?? []
      if (!ids.length) return t('stopped waiting for other tasks')
      const titles = task ? ids.map((id) => task(id)).filter((x): x is string => !!x) : []
      return titles.length === ids.length ? t('now waits for {tasks}', { tasks: titles.map((x) => `“${x}”`).join(', ') }) : t('changed what this task waits for')
    }
    case 'archived': return t('archived the project')
    case 'unarchived': return t('unarchived the project')
    case 'commented': return t('commented')
    case 'comment_edited': return t('edited a comment')
    case 'comment_deleted': return t('deleted a comment')
    default: {
      const fields = ev.changes.filter((c) => canon(c.from) !== canon(c.to)).map((c) => FIELD_LABELS[c.field] ?? fieldValueLabel(c.field) ?? c.field)
      return fields.length ? t('changed {fields}', { fields: fields.join(', ') }) : t('edited')
    }
  }
}

const FIELD_LABELS = translatedMap<string>({
  title: msg('the title'), description: msg('the notes'), priority: msg('the priority'), labels: msg('the labels'), parent_id: msg('the parent task'),
  position: msg('the order'), estimate_minutes: msg('the estimate'), recurrence: msg('the repeat rule'), name: msg('the name'), color: msg('the colour'),
  series_id: msg('the series'), deadline: msg('the deadline'),
  start: msg('when it starts'), evening: msg('This Evening'), origin: msg('the origin'),
})

/** The event kinds a project activity view can filter by, with labels. */
type KindFilter = { value: string; label: string; kinds: ActivityKind[] }
export const KIND_FILTERS: KindFilter[] = translatedList<KindFilter, 'label'>([
  { value: 'created', label: msg('Created'), kinds: ['created'] },
  { value: 'completed', label: msg('Completed / reopened'), kinds: ['completed', 'reopened'] },
  { value: 'rescheduled', label: msg('Rescheduled'), kinds: ['rescheduled'] },
  { value: 'assigned', label: msg('Assigned'), kinds: ['assigned', 'unassigned'] },
  { value: 'moved', label: msg('Moved'), kinds: ['moved'] },
  { value: 'dependencies', label: msg('Waiting for'), kinds: ['dependencies'] },
  { value: 'comments', label: msg('Comments'), kinds: ['commented', 'comment_edited', 'comment_deleted'] },
  { value: 'deleted', label: msg('Deleted / restored'), kinds: ['deleted', 'restored'] },
  { value: 'edited', label: msg('Other edits'), kinds: ['edited', 'archived', 'unarchived'] },
], 'label')
