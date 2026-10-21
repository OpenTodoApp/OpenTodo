// Every local mutation becomes field-level ops that are applied to IndexedDB
// immediately (optimistic, offline-safe) and queued for the server.
import { db, entityTables, getMeta, localEpoch, setMeta, tableOf, type EntityRow } from './db'
import { dueToInstant, logicalToday, todayISO } from './dates'
import { resolveReminder, type ReminderPhrase } from './nlp/reminders'
import { CLOCK_OFFSET_META, hlcNow, hlcSeed, hlcSeedOffset, wins } from './hlc'
import { firstOccurrence, parseRule } from './recurrence'
import { deadlineFireAt, relativeFireAt } from './reminderTime'
import { planCompletion, planDetach, planSkip, seriesRule } from './recurring'
import { assignableIn, currentUserId, membershipMap, roleOf, scopeOf } from './sharing'
import { descendants, isDescendant } from './tree'
import { GAP } from './ordering'
import { ENTITIES, type Clock, type Attachment, type Comment, type Entity, type FieldDef, type Label, type Op, type Origin, type Place, type Project, type TaskLocation, type ProjectPrefs, type Reminder, type Review, type Section, type Task, type TimeEntry, type UserPrefs, type View } from './types'
import { recordActivity, type RecordInput } from './activity'
import { DocTooLargeError, isDocField, loadRichText, MAX_DOC_CHARS, MAX_DOC_CHARS_ENCRYPTED, MAX_TEXT_VALUE, NOTE_ENTITIES, type RichText } from './docfields'
import { byteLength, MAX_PLAINTEXT_BYTES } from './crypto'
import { encryptionSnapshot, isContentField } from './e2ee'
import type { RowEncryption } from './types'
import { t } from './i18n'
import { uuid } from './ids'

let devicePromise: Promise<string> | null = null
/** The local data epoch the memoised id was read in; a sign-out starts a new one. */
let deviceEpoch = -1

/**
 * Stable per-browser device id; memoized as a promise so concurrent first calls
 * agree. The memo is per local data epoch: after clearLocalData the id is read
 * (or created) again from the fresh database instead of reusing the old one.
 */
export function getDeviceId(): Promise<string> {
  if (!devicePromise || deviceEpoch !== localEpoch()) {
    deviceEpoch = localEpoch()
    devicePromise = (async () => {
      let id = await getMeta<string | null>('device', null)
      if (!id) {
        id = uuid()
        await setMeta('device', id)
      }
      hlcSeed(await getMeta<number>('hlc', 0))
      hlcSeedOffset(await getMeta<number>(CLOCK_OFFSET_META, 0))
      return id
    })()
    devicePromise.catch(() => (devicePromise = null))
  }
  return devicePromise
}

/** Test hook: forget the memoized device id (the database was swapped). */
export function resetDeviceId(): void {
  devicePromise = null
}

const PROJECT_DEFAULTS: Omit<Project, 'id' | '_clock'> = {
  name: '', color: '#64748b', position: 0, archived: false, parent_id: null, icon: null, created_at: 0, deleted_at: null, description: '', notes_doc: '',
}
const TASK_DEFAULTS: Omit<Task, 'id' | '_clock'> = {
  title: '', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
  position: 0, created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, deadline: null, start: null, evening: false, blocked_by: [], recurrence: null, series_id: null,
  assignee_id: null, section_id: null, ical_extra: null, notes_doc: '', habit: false, skipped: false, completed_by: null, fields: {}, origin: null, location: null,
}
const LABEL_DEFAULTS: Omit<Label, 'id' | '_clock'> = {
  name: '', color: '#64748b', position: 0, created_at: 0, deleted_at: null,
}
/** Defaults for a view row created from partial ops; also the read-time fallback for unknown option values. */
export const VIEW_DEFAULTS: Omit<View, 'id' | '_clock'> = {
  name: '', query: '', kind: 'list', group_by: 'project', sort_by: 'due', sort_dir: 'asc', pinned: false,
  position: 0, color: '#64748b', panels: [], on_drop: null, created_at: 0, deleted_at: null,
}
const REMINDER_DEFAULTS: Omit<Reminder, 'id' | '_clock'> = {
  task_id: '', kind: 'relative', offset_minutes: null, fire_at: null, delivered_at: null, dismissed_at: null,
  created_at: 0, deleted_at: null,
}
const SECTION_DEFAULTS: Omit<Section, 'id' | '_clock'> = {
  name: '', project_id: '', position: 0, created_at: 0, deleted_at: null, color: null, icon: null,
}
/** field (custom-fields D1): project_id and type are fixed at creation. */
const FIELD_DEFAULTS: Omit<FieldDef, 'id' | '_clock'> = {
  name: '', project_id: '', type: 'text', options: '', position: 0, created_at: 0, deleted_at: null,
}
const COMMENT_DEFAULTS: Omit<Comment, 'id' | '_clock'> = {
  task_id: '', parent_id: null, body: '', author_id: '', mentions: [], created_at: 0, edited_at: null, deleted_at: null,
  guest_name: null, page_id: null,
}
/** attachment (attachments D1): every field but name, uploaded_at and deleted_at is fixed at creation. */
export const ATTACHMENT_DEFAULTS: Omit<Attachment, 'id' | '_clock'> = {
  task_id: '', comment_id: null, name: '', mime: 'application/octet-stream', size: 0, sha256: '', url: null, encrypted: false,
  author_id: '', created_at: 0, uploaded_at: null, deleted_at: null,
}
/** project_prefs (activity-feed): 0 means "never marked"; the feed then uses the device's baseline. */
const PROJECT_PREFS_DEFAULTS: Omit<ProjectPrefs, 'id' | '_clock'> = { feed_seen_at: 0, reviewed_at: 0 }
/** user_prefs (date-time-preferences): every preference follows the browser until the user picks one. */
export const USER_PREFS_DEFAULTS: Omit<UserPrefs, 'id' | '_clock'> = { date_format: 'system', time_format: 'system', week_start: 'system', day_start: '', theme_mode: 'system', theme_accent: 'emerald', sidebar_destinations: '', density: '', row_detail: '', favourites: '', first_run: '', language: 'system', welcome: '', method_mode: '',
  focus_mode: '', focus_auto_start: '', focus_sound: '', focus_work_minutes: 0, focus_short_break_minutes: 0, focus_long_break_minutes: 0, focus_long_break_every: 0, focus_break_after_minutes: 0, maps: '' }
/** review (stats-and-review D4, open-loops-method D5): 0 means "never finished", an empty focus date no focus. */
export const REVIEW_DEFAULTS: Omit<Review, 'id' | '_clock'> = { completed_at: 0, daily_at: 0, monthly_at: 0, focus_date: '', focus: '', closed_at: 0, tomorrow_note: '', carry_over: '' }
/** A time entry row before its ops arrive (time-tracking D1); `ended_at` null reads as running. */
export const TIME_ENTRY_DEFAULTS: Omit<TimeEntry, 'id' | '_clock'> = { task_id: '', user_id: '', started_at: 0, ended_at: null, device_id: '', note: '', created_at: 0, deleted_at: null }
/** A place (task-locations D1): `geo` null until it has a position. */
export const PLACE_DEFAULTS: Omit<Place, 'id' | '_clock'> = { name: '', address: '', geo: null, position: 0, created_at: 0, deleted_at: null }
/** The row a field op creates when its entity is new; one key per op field (the schema contract in internal/sync/testdata/schema_fixture.json), `fields` holding the `fields.<id>` values. */
export const DEFAULTS: Record<Entity, Record<string, unknown>> = {
  project: PROJECT_DEFAULTS, task: TASK_DEFAULTS, label: LABEL_DEFAULTS, view: VIEW_DEFAULTS, reminder: REMINDER_DEFAULTS, section: SECTION_DEFAULTS,
  comment: COMMENT_DEFAULTS, project_prefs: PROJECT_PREFS_DEFAULTS, user_prefs: USER_PREFS_DEFAULTS, attachment: ATTACHMENT_DEFAULTS, field: FIELD_DEFAULTS,
  review: REVIEW_DEFAULTS, time_entry: TIME_ENTRY_DEFAULTS, place: PLACE_DEFAULTS,
}

/**
 * Fields the server may store with a different value than the device sent, keeping
 * the op's clock (comments-and-activity D2: mentions are filtered to members). When
 * the server's copy arrives with the clock the row already has, its value is adopted.
 */
const SERVER_REWRITTEN = new Set(['comment.mentions'])

/**
 * Apply ops to the local store using per-field last-writer-wins. Safe to call with
 * ops in any order and any number of times: the result depends only on the set of ops.
 * Ops for entities this build does not know (a newer server) are skipped, not fatal.
 *
 * Task, project and comment ops are also recorded for the activity log with their
 * author (`op.actor`, else `opts.actor` for local edits) and old value.
 */
export async function applyOps(
  ops: Op[], opts: { actor?: string; local?: boolean; wire?: Map<string, { kind: 'p' | 'c' | 'x'; raw?: string }> } = {},
): Promise<void> {
  if (ops.length === 0) return
  // Remote document ops are merged, not just replaced (collaborative-rich-text):
  // load the document code before the transaction, which must not await imports.
  const rt = !opts.local && ops.some((o) => isDocField(o.entity, o.field)) ? await loadRichText() : null
  const republish: Change[] = []
  const grouped = new Map<string, Op[]>()
  for (const op of ops) {
    if (!ENTITIES.includes(op.entity)) continue
    const key = `${op.entity}:${op.entityId}`
    const list = grouped.get(key)
    if (list) list.push(op)
    else grouped.set(key, [op])
  }
  if (grouped.size === 0) return
  await db.transaction('rw', entityTables(), async () => {
    const recorded: RecordInput[] = []
    const rows = new Map<string, Record<string, unknown>>()
    for (const [, list] of grouped) {
      const { entity, entityId } = list[0]
      const table = tableOf(entity)
      const existing = (await table.get(entityId)) as (Project | Task | Label | View | Reminder | Section | Comment | ProjectPrefs) | undefined
      const row: Record<string, unknown> = existing ? { ...existing } : { ...DEFAULTS[entity], id: entityId, _clock: {} }
      const clock: Clock = { ...(row._clock as Clock) }
      let changed = !existing
      // The union of every document value seen for this row in this batch.
      let merged: string | undefined
      let docTs = 0
      for (const op of list) {
        const c = clock[op.field]
        const won = wins(op.ts, op.device, c)
        // A custom field value `fields.<id>` lives in row.fields[id], its clock
        // under the op field name (custom-fields D2).
        const fid = entity === 'task' ? fieldValueId(op.field) : null
        const current = fid ? (row.fields as Record<string, unknown> | undefined)?.[fid] : row[op.field]
        // A losing op still happened: its old value is unknown here, the activity
        // rule takes it from the op before it in timestamp order.
        recorded.push({ op, actor: op.actor ?? opts.actor ?? '', from: won ? current ?? null : undefined, projectKey: '' })
        if (rt && isDocField(entity, op.field)) {
          // Winning or not, the received document is merged with the local one.
          merged = rt.mergeDocs(merged ?? String(row[op.field] ?? ''), String(op.value ?? ''))
          docTs = Math.max(docTs, op.ts, c?.ts ?? 0)
        }
        const rewritten = !won && c && c.ts === op.ts && c.device === op.device && SERVER_REWRITTEN.has(`${entity}.${op.field}`)
        if (!won && !rewritten) continue
        if (fid) row.fields = { ...(row.fields as Record<string, unknown> | undefined), [fid]: op.value }
        else row[op.field] = op.value
        clock[op.field] = { ts: op.ts, device: op.device }
        changed = true
        // End-to-end encryption bookkeeping (OpenSpec e2ee), local only: the form
        // the server holds for a remote value, and the envelope of a value this
        // device cannot decrypt. A local edit replaces an undecryptable value.
        const info = opts.wire?.get(op.id)
        const enc = row._e2ee as RowEncryption | undefined
        if (info || enc?.raw?.[op.field]) {
          const wire = { ...enc?.wire }
          const raw = { ...enc?.raw }
          if (info) wire[op.field] = info.kind
          if (info?.raw) raw[op.field] = info.raw
          else delete raw[op.field]
          row._e2ee = { wire, raw }
        }
      }
      rows.set(`${entity}:${entityId}`, row)
      if (changed) {
        row._clock = clock
        await table.put(row as EntityRow)
      }
      if (rt && merged !== undefined && NOTE_ENTITIES.has(entity)) {
        const patch = reconcileNote(rt, row as unknown as Task, merged)
        if (patch) {
          // The republished pair must beat the values it extends or folds in.
          hlcSeed(Math.max(docTs, clock.description?.ts ?? 0))
          republish.push({ entity, entityId, patch })
        }
      }
    }
    // Place each recorded op in its task and project once every row is written.
    for (const r of recorded) {
      if (r.op.entity === 'task') r.taskId = r.op.entityId
      else if (r.op.entity === 'comment') r.taskId = (rows.get(`comment:${r.op.entityId}`) as Comment | undefined)?.task_id || undefined
    }
    const missing = [...new Set(recorded.map((r) => r.taskId).filter((id): id is string => !!id && !rows.has(`task:${id}`)))]
    const loaded = missing.length ? await db.tasks.bulkGet(missing) : []
    for (const task of loaded) if (task) rows.set(`task:${task.id}`, task as unknown as Record<string, unknown>)
    for (const r of recorded) {
      if (r.op.entity === 'project') r.projectKey = r.op.entityId
      else r.projectKey = ((r.taskId && (rows.get(`task:${r.taskId}`) as Task | undefined)?.project_id) || 'inbox')
    }
    await recordActivity(recorded)
  })
  // Merge-and-republish (design D1): only when the merge grew the winning value.
  if (republish.length) await mutateMany(republish)
}

const sameClock = (a?: { ts: number; device: string }, b?: { ts: number; device: string }) => !!a && !!b && a.ts === b.ts && a.device === b.device

/**
 * The note rules of collaborative-rich-text (design D1/D2) for a task row whose
 * stored fields are already decided by last-writer-wins. `merged` is the union of
 * the local and received documents. Returns the pair to publish, or null:
 * - the merge holds something the stored winner lacks: publish the union;
 * - a newer plain-text `description` (no `notes_doc` with its clock: REST, an older
 *   client) is folded into the document first;
 * - an unpaired, older `description` that differs from the document is re-projected.
 * A note without a document, or with one this build cannot read, is left alone
 * (legacy notes are upgraded when opened, see foldNote).
 */
export function reconcileNote(rt: RichText, row: Pick<Task, 'notes_doc' | 'description' | '_clock'>, merged?: string): { notes_doc: string; description: string } | null {
  const winner = row.notes_doc ?? ''
  let doc = merged ?? winner
  // A stored value this device cannot read (another format, undecryptable) is
  // never overwritten automatically.
  if (!doc || !rt.isReadable(doc) || !rt.isReadable(winner)) return null
  const cd = row._clock?.description
  const cn = row._clock?.notes_doc
  let publish = merged !== undefined && rt.adds(winner, merged)
  if (cd && !sameClock(cd, cn) && wins(cd.ts, cd.device, cn)) {
    doc = rt.foldText(doc, row.description ?? '', cd.ts, cd.device)
    publish = true
  } else if (!publish && !sameClock(cd, cn) && rt.projectDoc(doc) !== (row.description ?? '')) publish = true
  if (!publish) return null
  return { notes_doc: doc, description: rt.projectDoc(doc) }
}

type Listener = () => void
const mutationListeners = new Set<Listener>()

/** Sync engine subscribes here to learn that the outbox has new work. */
export function onLocalMutation(fn: Listener): () => void {
  mutationListeners.add(fn)
  return () => mutationListeners.delete(fn)
}

/** One entity's field changes inside a batch. */
export interface Change {
  entity: Entity
  entityId: string
  patch: Record<string, unknown>
}

/** Where a batch comes from: the user's own edit, or an in-app assistant proposal they confirmed. */
export interface MutateOptions {
  /** 'assistant' stamps device assistant:<device-id> (in-app-assistant D1): history labels it "Assistant". */
  origin?: 'assistant'
}

/** The op device of a batch with this origin. */
export async function deviceFor(opts: MutateOptions = {}): Promise<string> {
  const id = await getDeviceId()
  return opts.origin === 'assistant' ? `assistant:${id}` : id
}

/**
 * Who completed a task (OpenSpec change completed-date-filters, design D5): a task
 * patch that writes `completed_at` without `completed_by` gets it in the same batch,
 * the signed-in account when completing and null when reopening. A creation that
 * leaves the task open needs nothing (null is the default). Every completion path
 * (cascades, bulk, recurring occurrence records, history restores) goes through here.
 */
export function withCompletedBy(changes: Change[], actor: string): Change[] {
  if (!changes.some((c) => c.entity === 'task' && 'completed_at' in c.patch && !('completed_by' in c.patch))) return changes
  return changes.map((c) => {
    if (c.entity !== 'task' || !('completed_at' in c.patch) || 'completed_by' in c.patch) return c
    const done = c.patch.completed_at !== null && c.patch.completed_at !== undefined
    if (!done && 'created_at' in c.patch) return c
    return { ...c, patch: { ...c.patch, completed_by: done ? actor || null : null } }
  })
}

/** The op field prefix of a task's custom field values (custom-fields D2). */
export const FIELD_VALUE_PREFIX = 'fields.'
const FIELD_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The definition id of a `fields.<id>` op field, or null for any other field. */
export function fieldValueId(field: string): string | null {
  if (!field.startsWith(FIELD_VALUE_PREFIX)) return null
  const id = field.slice(FIELD_VALUE_PREFIX.length)
  return FIELD_ID.test(id) ? id : null
}

/** A row's value of an op field: `fields.<id>` reads row.fields[id]. */
export function readField(row: Record<string, unknown>, field: string): unknown {
  const id = fieldValueId(field)
  return id ? (row.fields as Record<string, unknown> | undefined)?.[id] : row[field]
}

/**
 * A task patch's `fields` entry is a partial map of values: each key becomes its
 * own `fields.<id>` op, so writing one value never touches the others
 * (custom-fields D2). `mutate('task', id, { fields: { [costId]: 120 } })`.
 */
export function unfoldFieldPatches(changes: Change[]): Change[] {
  if (!changes.some((c) => c.entity === 'task' && c.patch.fields !== undefined)) return changes
  return changes.map((c) => {
    if (c.entity !== 'task' || c.patch.fields === undefined) return c
    const { fields, ...patch } = c.patch
    for (const [id, value] of Object.entries((fields ?? {}) as Record<string, unknown>)) {
      if (FIELD_ID.test(id)) patch[FIELD_VALUE_PREFIX + id] = value ?? null
    }
    return { ...c, patch }
  })
}

/** Tables a read-modify-write helper must lock to wrap mutate()/mutateMany() in one transaction. */
export function mutationTables() {
  return [...entityTables(), db.outbox, db.meta]
}

/**
 * Record field changes for several entities as one batch: applied locally, enqueued
 * and the clock persisted in a single transaction (one render, no intermediate state).
 * Each field is still its own op, so sync semantics are unchanged. Callers that must
 * read the current row first (e.g. the task label array) wrap the read and this call in
 * `db.transaction('rw', mutationTables(), …)` after awaiting getDeviceId() once.
 */
export async function mutateMany(changes: Change[], opts: MutateOptions = {}): Promise<void> {
  changes = unfoldFieldPatches(changes)
  checkEncryptedSize(changes)
  const device = await deviceFor(opts)
  changes = [...changes, ...(await reminderFollowUps(changes))]
  if (!changes.some((c) => Object.keys(c.patch).length > 0)) return
  const rt = await richTextFor(changes)
  const ts = hlcNow()
  await db.transaction('rw', mutationTables(), async () => {
    if (rt) {
      changes = await withNotePairs(rt, changes, ts, device)
      // The pair adds a projection and a merged document: check them too (e2ee).
      checkEncryptedSize(changes)
    }
    // The author of local edits, read inside the transaction (activity log).
    const actor = ((await db.meta.get('userId'))?.value as string | undefined) ?? ''
    changes = withCompletedBy(changes, actor)
    const ops: Op[] = []
    for (const { entity, entityId, patch } of changes) {
      for (const [field, value] of Object.entries(patch)) {
        ops.push({ id: uuid(), entity, entityId, field, value, ts, device })
      }
    }
    await applyOps(ops, { actor, local: true })
    // One pending document per field (design D3): a newer state supersedes the queued one.
    const docOps = ops.filter((o) => isDocField(o.entity, o.field))
    if (docOps.length) {
      const stale = await db.outbox
        .filter((o) => docOps.some((d) => d.entity === o.entity && d.entityId === o.entityId && d.field === o.field))
        .primaryKeys()
      if (stale.length) await db.outbox.bulkDelete(stale)
    }
    await db.outbox.bulkAdd(ops)
    await db.meta.put({ key: 'hlc', value: ts })
  })
  for (const fn of mutationListeners) fn()
}

/**
 * Load the document code when a batch writes a note document, or a plain-text
 * note of a task that already has a document (it must be folded in). Plain
 * notes of plain tasks never load it.
 */
async function richTextFor(changes: Change[]): Promise<RichText | null> {
  const notes = changes.filter((c) => NOTE_ENTITIES.has(c.entity) && ('notes_doc' in c.patch || 'description' in c.patch))
  if (notes.length === 0) return null
  if (notes.some((c) => 'notes_doc' in c.patch)) return loadRichText()
  for (const c of notes) {
    const row = (await tableOf(c.entity).get(c.entityId)) as { notes_doc?: string } | undefined
    if (row?.notes_doc) return loadRichText()
  }
  return null
}

/**
 * Keep notes_doc and description a pair in every local batch (design D2/D3):
 * a document write is merged with the stored document (so a remote change that
 * arrived while the editor held an older copy is never undone) and carries its
 * projection; a plain-text write to a task that has a document is folded into it
 * with this batch's clock. Refuses a document over the size cap.
 */
async function withNotePairs(rt: RichText, changes: Change[], ts: number, device: string): Promise<Change[]> {
  const out: Change[] = []
  for (const c of changes) {
    if (!NOTE_ENTITIES.has(c.entity) || !('notes_doc' in c.patch || 'description' in c.patch)) {
      out.push(c)
      continue
    }
    const row = (await tableOf(c.entity).get(c.entityId)) as { notes_doc?: string } | undefined
    const stored = row?.notes_doc ?? ''
    const patch = { ...c.patch }
    if ('notes_doc' in patch) {
      const doc = rt.mergeDocs(stored, String(patch.notes_doc ?? ''))
      patch.notes_doc = doc
      if (doc && rt.isReadable(doc)) patch.description = rt.projectDoc(doc)
    } else if (stored && rt.isReadable(stored)) {
      patch.notes_doc = rt.foldText(stored, String(patch.description ?? ''), ts, device)
      patch.description = rt.projectDoc(patch.notes_doc as string)
    }
    if (typeof patch.notes_doc === 'string' && patch.notes_doc.length > MAX_DOC_CHARS) throw new DocTooLargeError(patch.notes_doc.length)
    // The projection is an ordinary string field: it must fit the 64 KB value cap.
    if (typeof patch.description === 'string' && patch.notes_doc !== undefined && JSON.stringify(patch.description).length > MAX_TEXT_VALUE) {
      throw new DocTooLargeError(JSON.stringify(patch.description).length, MAX_TEXT_VALUE)
    }
    out.push({ ...c, patch })
  }
  return out
}

/**
 * Bring a note's document up to date when it is opened (design D2 and Migration
 * Plan): a legacy note (no document) becomes one built from description, a
 * newer plain-text write is folded in, an unpaired projection is refreshed. The
 * fold is deterministic, so devices doing this concurrently converge. Returns
 * true when something was written.
 */
export async function foldNote(entityOrTaskId: string, id?: string): Promise<boolean> {
  // foldNote(taskId) is the task form; foldNote(entity, id) works for any note entity (project-notes).
  const entity = (id === undefined ? 'task' : entityOrTaskId) as Entity
  const entityId = id ?? entityOrTaskId
  if (!NOTE_ENTITIES.has(entity)) return false
  const rt = await loadRichText()
  const row = (await tableOf(entity).get(entityId)) as Pick<Task, 'notes_doc' | 'description' | '_clock' | 'deleted_at'> | undefined
  if (!row || row.deleted_at) return false
  if (!row.notes_doc) {
    if (!row.description) return false
    const c = row._clock?.description ?? { ts: 0, device: '' }
    const doc = rt.foldText('', row.description, c.ts, c.device)
    if (doc.length > MAX_DOC_CHARS) return false
    hlcSeed(c.ts)
    await mutate(entity, entityId, { notes_doc: doc })
    return true
  }
  const patch = reconcileNote(rt, row)
  if (!patch) return false
  hlcSeed(Math.max(row._clock?.description?.ts ?? 0, row._clock?.notes_doc?.ts ?? 0))
  await mutate(entity, entityId, patch)
  return true
}


/**
 * Relative reminders follow their task's due time (OpenSpec change `reminders`,
 * design D2): every change that sets a task's `due` (an edit, a reschedule, a
 * recurring series rolling forward or skipping) carries a new `fire_at` for each
 * live relative reminder of that task. They join the same batch, so they share the
 * due op's HLC timestamp and device and last-writer-wins picks the due date and the
 * firing times from the same edit. `fire_at` is always written, even when unchanged,
 * for that reason; a firing that moved also clears delivered/dismissed state.
 * Deadline reminders (OpenSpec change `deadlines`, design D5) follow `deadline`
 * the same way and ignore `due`.
 */
async function reminderFollowUps(changes: Change[]): Promise<Change[]> {
  const out: Change[] = []
  for (const { entity, entityId, patch } of changes) {
    if (entity !== 'task' || !('due' in patch || 'deadline' in patch)) continue
    const reminders = await db.reminders.where('task_id').equals(entityId).toArray()
    for (const r of reminders) {
      if (r.deleted_at) continue
      let fireAt: number | null
      if (r.kind === 'relative' && 'due' in patch) fireAt = relativeFireAt((patch.due ?? null) as Task['due'], r.offset_minutes)
      else if (r.kind === 'deadline' && 'deadline' in patch) fireAt = deadlineFireAt((patch.deadline ?? null) as string | null, r.offset_minutes)
      else continue
      const p: Record<string, unknown> = { fire_at: fireAt }
      if (fireAt !== r.fire_at) {
        if (r.delivered_at !== null) p.delivered_at = null
        if (r.dismissed_at !== null) p.dismissed_at = null
      }
      out.push({ entity: 'reminder', entityId: r.id, patch: p })
    }
  }
  return out
}

/** A content value too long to fit the server's value limit once encrypted (OpenSpec e2ee, design D3). */
export class PlaintextTooLongError extends Error {
  constructor(public entity: Entity, public entityId: string, public field: string) {
    super(t('{field, select, title {This title} name {This name} other {This text}} is too long to encrypt (at most {max, number} bytes). Shorten it and try again.', { field, max: MAX_PLAINTEXT_BYTES }))
  }
}

/** Refuse, before any op exists, content an encrypted account could not upload. */
function checkEncryptedSize(changes: Change[]): void {
  if (!encryptionSnapshot().enabled) return
  for (const { entity, entityId, patch } of changes) {
    for (const [field, value] of Object.entries(patch)) {
      // A note document (ASCII envelope) has its own, larger cap: its ciphertext
      // must fit MaxDocBytes (collaborative-rich-text).
      if (typeof value === 'string' && isDocField(entity, field) && isContentField(entity, field)) {
        if (value.length > MAX_DOC_CHARS_ENCRYPTED) throw new DocTooLargeError(value.length, MAX_DOC_CHARS_ENCRYPTED)
        continue
      }
      if (typeof value === 'string' && value.length > MAX_PLAINTEXT_BYTES / 4 && isContentField(entity, field) && byteLength(value) > MAX_PLAINTEXT_BYTES) {
        throw new PlaintextTooLongError(entity, entityId, field)
      }
    }
  }
}

/** Record field changes for one entity: apply locally and enqueue for the server. */
export async function mutate(entity: Entity, entityId: string, patch: Record<string, unknown>): Promise<void> {
  await mutateMany([{ entity, entityId, patch }])
}

/** Every non-deleted project; the tree helpers take the whole set so cycles are handled. */
async function liveProjects(): Promise<Project[]> {
  return db.projects.filter((p) => !p.deleted_at).toArray()
}

/** A position after every live sibling under `parentId` (excluding `id` itself). */
function lastAmongProjectSiblings(all: Project[], id: string, parentId: string | null): number {
  let position = Date.now()
  for (const p of all) {
    if (p.id !== id && p.parent_id === parentId && p.position >= position) position = p.position + 1
  }
  return position
}

/** A new project goes last at the top level, or last under `parent_id` when given. */
export async function createProject(input: { name: string; color?: string; parent_id?: string | null }): Promise<string> {
  const id = uuid()
  const now = Date.now()
  const all = await liveProjects()
  const parent = input.parent_id ? all.find((p) => p.id === input.parent_id) : undefined
  const parentId = parent && !parent.archived ? parent.id : null
  await mutate('project', id, {
    name: input.name.trim(), color: input.color ?? pickColor(), position: lastAmongProjectSiblings(all, id, parentId),
    archived: false, parent_id: parentId, created_at: now, deleted_at: null,
  })
  return id
}

/**
 * Re-parent a project (null = top level). Refuses the project itself, any of its
 * descendants and an archived or deleted parent; the REST API enforces the cycle
 * rule too. The project is placed last among its new siblings. Two ops, so a
 * concurrent move on another device resolves field by field (design D2).
 */
export async function moveProject(id: string, parentId: string | null): Promise<void> {
  const project = await db.projects.get(id)
  if (!project || project.deleted_at) throw new Error('project not found')
  if (parentId === project.parent_id) return
  const all = await liveProjects()
  if (parentId !== null) {
    if (parentId === id) throw new Error(t('a project cannot be its own parent'))
    const parent = all.find((p) => p.id === parentId)
    if (!parent || parent.archived) throw new Error('parent project not found')
    if (isDescendant(parentId, id, all)) throw new Error(t('parent cannot be a descendant of the project'))
  }
  await mutate('project', id, { parent_id: parentId, position: lastAmongProjectSiblings(all, id, parentId) })
}

/** Archiving cascades to every descendant, one op each (design D3); unarchive does not cascade. */
export async function archiveProject(id: string): Promise<void> {
  const all = await liveProjects()
  const changes: Change[] = [{ entity: 'project', entityId: id, patch: { archived: true } }]
  for (const d of descendants(id, all)) {
    const p = all.find((x) => x.id === d)
    if (p && !p.archived) changes.push({ entity: 'project', entityId: d, patch: { archived: true } })
  }
  await mutateMany(changes)
}

export type NewTaskInput = {
  title: string; description?: string; project_id?: string | null; parent_id?: string | null; due?: Task['due']; priority?: Task['priority']; labels?: string[]
  estimate_minutes?: number | null
  /** Minutes already spent (quick add `30m/2h`): one closed time entry ending at creation (time-tracking D10). */
  spent_minutes?: number | null
  deadline?: string | null
  /** "someday" or a date (someday-and-evening); only sent when set. */
  start?: string | null
  evening?: boolean
  /** A recurrence rule (any spelling the grammar accepts; stored canonical). Throws when invalid. */
  recurrence?: string | null
  /** Assignee account id (task-assignment); only sent when set. */
  assignee_id?: string | null
  /** Section of `project_id` (board-view); only sent when set. */
  section_id?: string | null
  /** Where the task came from (task-origin); only sent when set. */
  origin?: Origin | null
  /** Where the task happens (task-locations); only sent when set. */
  location?: TaskLocation | null
  /**
   * Reminders typed in quick add (quick-add-recurrence D3), resolved against the
   * task's final due and written in the same batch as the task.
   */
  reminders?: ReminderPhrase[]
}

/** The ops of a new task without writing them, for a batch with other changes (a shared file's attachments). */
export async function planTask(input: NewTaskInput): Promise<{ id: string; change: Change }> {
  const id = uuid()
  const now = Date.now()
  let due = input.due ?? null
  const extra: Record<string, unknown> = {}
  if (input.recurrence) {
    // Only recurring tasks carry the field, so plain tasks keep their op footprint.
    const parsed = parseRule(input.recurrence)
    if (!parsed.ok) throw new Error(`invalid recurrence: ${parsed.error}`)
    extra.recurrence = parsed.canonical
    if (!due) due = { date: firstOccurrence(parsed.rule, logicalToday()) }
  }
  if (input.assignee_id) extra.assignee_id = input.assignee_id
  // Only tasks created in a section carry the field (board-view).
  if (input.section_id) extra.section_id = input.section_id
  // Only tasks created with a deadline carry the field (deadlines).
  if (input.deadline) extra.deadline = input.deadline
  // Only parked, deferred or evening tasks carry these (someday-and-evening).
  if (input.start) extra.start = input.start
  if (input.evening) extra.evening = true
  // Only captured, mailed or imported tasks carry the field (task-origin).
  if (input.origin) extra.origin = input.origin
  if (input.location) extra.location = input.location
  return { id, change: { entity: 'task', entityId: id, patch: {
    title: input.title.trim(), description: input.description ?? '', project_id: input.project_id ?? null, parent_id: input.parent_id ?? null,
    priority: input.priority ?? 4, due, labels: input.labels ?? [], position: await nextTaskPosition(now), created_at: now,
    completed_at: null, deleted_at: null, estimate_minutes: input.estimate_minutes ?? null, ...extra,
  } } }
}

/** The reminder ops for phrases typed in quick add, resolved against the task's due (quick-add-recurrence D3). */
export function planReminders(taskId: string, due: Task['due'], phrases: readonly ReminderPhrase[] | undefined, now = new Date()): Change[] {
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return (phrases ?? []).map((phrase) => {
    const r = resolveReminder(phrase, due, todayISO(now), hhmm)
    const relative = r.kind === 'relative'
    return { entity: 'reminder', entityId: uuid(), patch: {
      task_id: taskId, kind: r.kind, offset_minutes: relative ? r.offsetMinutes : null,
      fire_at: relative ? relativeFireAt(due, r.offsetMinutes) : dueToInstant({ date: r.date, time: r.time }),
      delivered_at: null, dismissed_at: null, created_at: now.getTime(), deleted_at: null,
    } } satisfies Change
  })
}

export async function createTask(input: NewTaskInput, now = new Date()): Promise<string> {
  const { id, change } = await planTask(input)
  const changes: Change[] = [change, ...planReminders(id, (change.patch as { due: Task['due'] }).due, input.reminders, now)]
  // Time already spent (quick add `30m/2h`, time-tracking D10): one closed entry ending now.
  const me = input.spent_minutes ? await currentUserId() : null
  if (me && input.spent_minutes) {
    const end = now.getTime()
    changes.push({ entity: 'time_entry', entityId: uuid(), patch: {
      task_id: id, user_id: me, started_at: end - input.spent_minutes * 60000, ended_at: end, device_id: await getDeviceId(), note: '', created_at: end, deleted_at: null,
    } })
  }
  // One batch: the task never syncs without its reminders and its time entry.
  await mutateMany(changes)
  return id
}

/**
 * New tasks are appended at the end of their list (manual-ordering): the creation
 * time, unless some task was moved past it (a move to the bottom writes last + GAP),
 * then just past the largest position anywhere. One indexed read.
 */
async function nextTaskPosition(now: number): Promise<number> {
  const last = await db.tasks.orderBy('position').last()
  return last && Number.isFinite(last.position) && last.position >= now ? last.position + GAP : now
}

/** A new subtask lives in its parent's project, with default priority and no due date. */
export async function createSubtask(parentId: string, title: string): Promise<string> {
  const parent = await db.tasks.get(parentId)
  if (!parent || parent.deleted_at) throw new Error('parent task not found')
  return createTask({ title, project_id: parent.project_id, parent_id: parentId })
}

/** Every non-deleted task; the tree helpers take the whole set so cycles are handled. */
async function liveTasks(): Promise<Task[]> {
  return db.tasks.filter((task) => !task.deleted_at).toArray()
}

/**
 * Re-parent a task. Refuses the task itself, any of its descendants and a parent in
 * another project; the REST API enforces the same rules. The task is placed last
 * among its new siblings. One op per changed field, so the move converges by LWW.
 */
export async function setTaskParent(id: string, parentId: string | null): Promise<void> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at) throw new Error('task not found')
  if (parentId === task.parent_id) return
  const all = await liveTasks()
  if (parentId !== null) {
    if (parentId === id) throw new Error(t('a task cannot be its own parent'))
    const parent = all.find((tk) => tk.id === parentId)
    if (!parent) throw new Error('parent task not found')
    if (parent.project_id !== task.project_id) throw new Error(t('parent must be in the same project'))
    if (isDescendant(parentId, id, all)) throw new Error(t('parent cannot be a descendant of the task'))
  }
  let position = Date.now()
  for (const item of all) {
    if (item.id !== id && item.parent_id === parentId && item.project_id === task.project_id && item.position >= position) position = item.position + 1
  }
  await mutate('task', id, { parent_id: parentId, position })
}

/**
 * Fields a cross-scope copy carries over (project-sharing); ids, tree links and
 * tombstones are new. `section_id` is deliberately absent: every copy lands in a
 * different project, and changing a task's project clears its section (board-view).
 */
// blocked_by stays behind: blockers live in one sharing scope (task-dependencies D5).
const COPY_FIELDS = ['title', 'description', 'notes_doc', 'priority', 'due', 'labels', 'estimate_minutes', 'deadline', 'start', 'evening', 'recurrence', 'series_id', 'assignee_id', 'completed_at', 'completed_by', 'position', 'created_at', 'origin'] as const

/**
 * Copy tasks into `projectId` under new ids, keeping parent links between copied
 * tasks (a parent that is not copied becomes null). Returns the changes and the
 * old → new id map. The originals are untouched; callers tombstone them.
 */
function copyTasks(
  tasks: Task[], projectId: string | null, assignable: Set<string>, overrides: Record<string, Partial<Task>> = {},
): { changes: Change[]; ids: Map<string, string> } {
  const ids = new Map(tasks.map((task) => [task.id, uuid()]))
  const changes: Change[] = []
  for (const tk of tasks) {
    const patch: Record<string, unknown> = {}
    for (const f of COPY_FIELDS) patch[f] = tk[f]
    Object.assign(patch, overrides[tk.id] ?? {})
    // task-assignment: the copy keeps its assignee only when that person may be
    // assigned in the destination; the server would refuse it otherwise.
    // An unassigned copy needs no op (null is the default; rows synced before the
    // field existed hold undefined, which must never be sent).
    // A copy carries the note's document only when there is one (collaborative-rich-text).
    if (typeof patch.notes_doc !== 'string' || !patch.notes_doc) delete patch.notes_doc
    // The copy keeps where the task came from (task-origin); none needs no op.
    if (!patch.origin || typeof patch.origin !== 'object') delete patch.origin
    // Custom field values travel with the copy (custom-fields), one op each.
    if (tk.fields && Object.keys(tk.fields).length) patch.fields = { ...tk.fields }
    // The copy keeps who completed it (completed-date-filters D5); unknown stays null.
    if (patch.completed_at === null || patch.completed_at === undefined) delete patch.completed_by
    else patch.completed_by = patch.completed_by ?? null
    if (typeof patch.assignee_id !== 'string') delete patch.assignee_id
    else if (!assignable.has(patch.assignee_id)) patch.assignee_id = null
    patch.project_id = projectId
    patch.parent_id = (tk.parent_id && ids.get(tk.parent_id)) ?? null
    patch.deleted_at = null
    changes.push({ entity: 'task', entityId: ids.get(tk.id) as string, patch })
  }
  return { changes, ids }
}

/**
 * Move a task (with its subtree) into a project of another sharing scope: who can
 * see an existing task never changes, so the server refuses that `project_id`
 * (reason `scope_change`). The move is a copy in the destination plus a tombstone
 * on every original, in one batch, so it works offline and converges by LWW.
 * Returns the id of the copy.
 */
export async function moveTaskAcrossScopes(id: string, patch: Partial<Omit<Task, 'id' | '_clock'>>): Promise<string> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at) throw new Error('task not found')
  const assignable = assignableIn(patch.project_id ?? null, await membershipMap(), await currentUserId())
  const plan = planProjectChange(task, await liveTasks(), patch, { assignable })
  await mutateMany(plan.changes)
  return plan.id
}

/**
 * The changes of a project change (bulk-edit D4, shared by updateTask and bulk
 * moves). Same scope: the subtree follows, the task leaves a parent that stays
 * behind, and sections are cleared unless the patch picked one. Another scope
 * (`cross` set): copies in the destination plus tombstones on the originals.
 * Returns the task's id afterwards (the copy's id across scopes).
 */
export function planProjectChange(task: Task, all: Task[], patch: Partial<Omit<Task, 'id' | '_clock'>>, cross?: { assignable: Set<string> }, now = Date.now()): { changes: Change[]; id: string } {
  const id = task.id
  if (cross) {
    const subtree = [task, ...[...descendants(id, all)].map((d) => all.find((tk) => tk.id === d)).filter((item): item is Task => !!item)]
    const { project_id: projectId = null, parent_id: _parent, ...rest } = patch
    const { changes, ids } = copyTasks(subtree, projectId, cross.assignable, { [id]: { ...rest, position: now } })
    for (const tVar of subtree) changes.push({ entity: 'task', entityId: tVar.id, patch: { deleted_at: now } })
    return { changes, id: ids.get(id) as string }
  }
  const next = { ...patch }
  if (task.parent_id) {
    const parent = all.find((tVar) => tVar.id === task.parent_id)
    if (!parent || parent.project_id !== patch.project_id) next.parent_id = null
  }
  // A section belongs to one project: a project change clears it in the same
  // batch (board-view), unless the caller picked a section of the new project.
  if (!('section_id' in patch) && task.section_id) next.section_id = null
  const changes: Change[] = [{ entity: 'task', entityId: id, patch: next }]
  for (const d of descendants(id, all)) {
    const tVar = all.find((x) => x.id === d)
    if (tVar && tVar.project_id !== patch.project_id) {
      changes.push({ entity: 'task', entityId: d, patch: tVar.section_id ? { project_id: patch.project_id, section_id: null } : { project_id: patch.project_id } })
    }
  }
  return { changes, id }
}

/**
 * Edit fields and return the task's id afterwards. Changing `project_id` moves the
 * whole subtree (one op per descendant) and detaches the task from a parent that
 * stays behind, so a subtask is always in its parent's project. A move into another
 * sharing scope becomes copy + tombstone and returns the copy's id.
 */
export async function updateTask(id: string, patch: Partial<Omit<Task, 'id' | '_clock'>>): Promise<string> {
  // Scheduling a parked task un-parks it in the same batch (someday-and-evening D3).
  if (!('start' in patch) && patch.due) {
    const task = await db.tasks.get(id)
    if (task?.start === 'someday') patch = { ...patch, start: null }
  }
  if (patch.due === null && !('recurrence' in patch)) {
    // A recurrence rule needs a due date; clearing the date ends the repetition.
    const task = await db.tasks.get(id)
    if (task?.recurrence) patch = { ...patch, recurrence: null }
  }
  if ('project_id' in patch) {
    const task = await db.tasks.get(id)
    if (task && patch.project_id !== task.project_id) {
      const memberships = await membershipMap()
      if (scopeOf(task.project_id, memberships) !== scopeOf(patch.project_id, memberships)) {
        return moveTaskAcrossScopes(id, patch)
      }
      await mutateMany(planProjectChange(task, await liveTasks(), patch).changes)
      return id
    }
  }
  await mutate('task', id, patch)
  return id
}

/**
 * Park a task in Someday (someday-and-evening D3): one batch that sets the start,
 * clears the due date (which ends a recurrence) and the evening flag.
 */
export async function parkTask(id: string): Promise<void> {
  const task = await db.tasks.get(id)
  const patch: Partial<Task> = { start: 'someday' }
  if (task?.due) patch.due = null
  if (task?.evening) patch.evening = false
  await updateTask(id, patch)
}

/** Return a parked task to the active list, without a date. */
export async function unparkTask(id: string): Promise<void> {
  await updateTask(id, { start: null })
}

/**
 * Completing a parent completes every open descendant in one batch; reopening touches
 * only the task. A task with a recurrence rule rolls forward instead (completeTask).
 */
export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  if (!completed) {
    // Reopening an occurrence record leaves series_id, so it becomes a standalone
    // open task; reopening an ended series keeps its rule (design D6).
    await mutate('task', id, { completed_at: null })
    return
  }
  await completeTask(id)
}

async function completePlain(id: string, now: number, stops: Change[]): Promise<void> {
  await mutateMany([...planCompletePlain(id, await liveTasks(), now), ...stops])
}

/**
 * Completing a task ends the user's running entry on it in the same batch
 * (time-tracking "Start and stop from the web app"). The server's completion
 * paths do not: they cannot know whether the person is still working.
 */
async function trackingStops(taskId: string, now: number): Promise<Change[]> {
  const me = await currentUserId()
  if (!me) return []
  const rows = await db.timeEntries.where('task_id').equals(taskId).toArray()
  return rows.filter((e) => e.user_id === me && !e.deleted_at && e.ended_at === null)
    .map((e) => ({ entity: 'time_entry', entityId: e.id, patch: { ended_at: Math.max(now, e.started_at) } }))
}

/** Completing a plain task completes its open descendants too (bulk-edit D4 shares it). */
export function planCompletePlain(id: string, all: Task[], now: number): Change[] {
  const changes: Change[] = [{ entity: 'task', entityId: id, patch: { completed_at: now } }]
  for (const d of descendants(id, all)) {
    const task = all.find((x) => x.id === d)
    if (task && !task.completed_at) changes.push({ entity: 'task', entityId: d, patch: { completed_at: now } })
  }
  return changes
}

/**
 * Complete a task. For a recurring series this records the occurrence (an entity
 * whose id is derived from the series id and occurrence date) and moves the series
 * to its next occurrence in one batch; once the end condition is reached it
 * completes like a plain task. `today` is the device's logical today (day-boundary D5; tests pass it).
 * Returns the id of the occurrence record when the series rolled, otherwise null.
 */
export async function completeTask(id: string, opts: { now?: number; today?: string } = {}): Promise<string | null> {
  const now = opts.now ?? Date.now()
  const today = opts.today ?? logicalToday()
  await getDeviceId()
  const stops = await trackingStops(id, now)
  let recordId: string | null = null
  let plain = false
  await db.transaction('rw', mutationTables(), async () => {
    const series = await db.tasks.get(id)
    const rule = seriesRule(series)
    if (!series || !rule) {
      plain = true
      return
    }
    const plan = planCompletion(series, rule, await db.tasks.toArray(), now, today)
    if (plan.kind === 'end') {
      plain = true
      return
    }
    recordId = plan.recordId
    await mutateMany([...plan.changes, ...stops])
  })
  if (plain) await completePlain(id, now, stops)
  return recordId
}

/**
 * Skip the current occurrence of a series: an ordinary due-date change, no record.
 * A habit also writes the occurrence record marked `skipped` (OpenSpec `habits`).
 * Returns false (and writes nothing) when the task is not an open series or the
 * current occurrence is the last one before `until`.
 */
export async function skipOccurrence(id: string, opts: { now?: number; today?: string } = {}): Promise<boolean> {
  const now = opts.now ?? Date.now()
  const today = opts.today ?? logicalToday()
  await getDeviceId()
  let ok = false
  await db.transaction('rw', mutationTables(), async () => {
    const series = await db.tasks.get(id)
    const rule = seriesRule(series)
    const changes = series && rule ? planSkip(series, rule, now, today) : null
    if (!changes) return
    await mutateMany(changes)
    ok = true
  })
  return ok
}

/**
 * "This occurrence only": create a standalone copy of the current occurrence (no
 * rule, series_id set, id derived from series and date) and move the series on.
 * Returns the copy's id, or null when there is no next occurrence.
 */
export async function detachOccurrence(id: string, opts: { now?: number; today?: string } = {}): Promise<string | null> {
  const now = opts.now ?? Date.now()
  const today = opts.today ?? logicalToday()
  await getDeviceId()
  let copyId: string | null = null
  await db.transaction('rw', mutationTables(), async () => {
    const series = await db.tasks.get(id)
    const rule = seriesRule(series)
    const plan = series && rule ? planDetach(series, rule, now, today) : null
    if (!plan) return
    await mutateMany(plan.changes)
    copyId = plan.copyId
  })
  return copyId
}

/**
 * Set or clear a task's recurrence rule. The rule is stored in canonical form; a
 * task that gets a rule without a due date is given its first occurrence from today.
 */
export async function setRecurrence(
  id: string, input: string | null, opts: { today?: string } = {},
): Promise<{ ok: true; rule: string | null } | { ok: false; error: string }> {
  const task = await db.tasks.get(id)
  if (!task) return { ok: false, error: 'task not found' }
  if (input === null || input.trim() === '') {
    if (task.recurrence !== null) await mutate('task', id, { recurrence: null })
    return { ok: true, rule: null }
  }
  const parsed = parseRule(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const patch: Record<string, unknown> = {}
  if (parsed.canonical !== task.recurrence) patch.recurrence = parsed.canonical
  if (!task.due) patch.due = { date: firstOccurrence(parsed.rule, opts.today ?? logicalToday()) }
  if (Object.keys(patch).length) await mutate('task', id, patch)
  return { ok: true, rule: parsed.canonical }
}

/** Deleting a task tombstones its whole subtree, one op per task, in one batch. */
export async function deleteTask(id: string): Promise<void> {
  const now = Date.now()
  const all = await liveTasks()
  const changes: Change[] = [{ entity: 'task', entityId: id, patch: { deleted_at: now } }]
  for (const d of descendants(id, all)) changes.push({ entity: 'task', entityId: d, patch: { deleted_at: now } })
  await mutateMany(changes)
}

export async function updateProject(id: string, patch: Partial<Omit<Project, 'id' | '_clock'>>): Promise<void> {
  await mutate('project', id, patch)
}

/**
 * Deleting a project writes only its tombstone and moves its direct sub-projects
 * to its own parent (design D4 of project-hierarchy). Its tasks keep their
 * `project_id` and are hidden while the project is in the Trash (trash-and-history
 * D2), so restoring the project is a single op. One batch.
 *
 * A shared project (project-sharing D8) can only be deleted by its owner: the
 * project and every task in it are tombstoned for all members, and the owner's
 * open tasks are copied into the owner's Inbox, since a task never leaves its scope.
 */
export async function deleteProject(id: string): Promise<void> {
  const project = await db.projects.get(id)
  const memberships = await membershipMap()
  const shared = memberships.has(id)
  if (shared && roleOf(id, memberships) !== 'owner') throw new Error(t('only the owner can delete a shared project'))
  const changes: Change[] = []
  const now = Date.now()
  if (shared) {
    const tasks = await db.tasks.where('project_id').equals(id).toArray()
    const live = tasks.filter((task) => !task.deleted_at)
    changes.push(...copyTasks(live.filter((tk) => !tk.completed_at), null, assignableIn(null, memberships, await currentUserId())).changes)
    for (const item of live) changes.push({ entity: 'task', entityId: item.id, patch: { deleted_at: now } })
  }
  const parentId = project?.parent_id ?? null
  for (const p of await liveProjects()) {
    // A sub-project never inherits itself as parent (only possible inside an unresolved cycle).
    if (p.parent_id === id && p.id !== id) changes.push({ entity: 'project', entityId: p.id, patch: { parent_id: parentId === p.id ? null : parentId } })
  }
  changes.push({ entity: 'project', entityId: id, patch: { deleted_at: now } })
  await mutateMany(changes)
}

/**
 * Restore a task from the Trash (trash-and-history): clears its tombstone and the
 * tombstones of descendants deleted with it (same deletion time), in one batch.
 * When its project is still deleted the task goes to the Inbox in the same batch;
 * for a task of a shared project that means a copy in the Inbox, because a task
 * never changes sharing scope. Returns the id of the visible task.
 */
export async function restoreTask(id: string): Promise<string> {
  const task = await db.tasks.get(id)
  if (!task) throw new Error('task not found')
  if (!task.deleted_at) return id
  const all = await db.tasks.toArray()
  const subtree = [task, ...[...descendants(id, all)].map((d) => all.find((tk) => tk.id === d)).filter((item): item is Task => !!item && item.deleted_at === task.deleted_at)]
  const project = task.project_id ? await db.projects.get(task.project_id) : undefined
  const projectGone = !!project?.deleted_at
  if (projectGone) {
    const memberships = await membershipMap()
    if (scopeOf(task.project_id, memberships) !== 'personal') {
      const { changes, ids } = copyTasks(subtree, null, assignableIn(null, memberships, await currentUserId()), { [id]: { position: Date.now() } })
      await mutateMany(changes)
      return ids.get(id) as string
    }
  }
  const changes: Change[] = subtree.map((tVar) => ({
    entity: 'task' as const, entityId: tVar.id, patch: projectGone ? { deleted_at: null, project_id: null } : { deleted_at: null },
  }))
  // A task whose parent stays in the Trash is restored at the top level.
  const parent = task.parent_id ? all.find((tVar) => tVar.id === task.parent_id) : undefined
  if (projectGone || (parent && parent.deleted_at)) changes[0].patch.parent_id = null
  await mutateMany(changes)
  return id
}

/**
 * Restore a project from the Trash: one op clearing its tombstone. Its tasks kept
 * their project reference and reappear without any task op (trash-and-history D2).
 */
export async function restoreProject(id: string): Promise<void> {
  const project = await db.projects.get(id)
  if (!project) throw new Error('project not found')
  if (!project.deleted_at) return
  const memberships = await membershipMap()
  if (memberships.has(id) && roleOf(id, memberships) !== 'owner') throw new Error(t('only the owner can restore a shared project'))
  await mutate('project', id, { deleted_at: null })
}

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']
function pickColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]
}
