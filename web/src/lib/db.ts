import Dexie, { type Table } from 'dexie'
import type { FocusState } from './focus/timer'
import { ENTITIES, type Attachment, type Clock, type Entity, type FieldDef, type CalendarEvent, type CalendarSubscription, type ActivityEntry, type AppNotification, type Comment, type Label, type Membership, type Op, type Project, type ProjectPrefs, type Reminder, type Review, type RowEncryption, type Section, type Task, type TimeEntry, type UserPrefs, type View } from './types'

export interface OutboxOp extends Op {
  /** Local insertion order; used to acknowledge sent ops. */
  local?: number
}

/**
 * In-app assistant conversations (in-app-assistant D8): on this device only,
 * never synced, never in the outbox, exports or backups; cleared at sign-out.
 */
export interface AssistantThread {
  id: string
  title: string
  messages: AssistantMessage[]
  created_at: number
  updated_at: number
  provider: string
  usage: { input: number; output: number }
}

/** One message as shown: text, status lines and change-set summaries, never raw tool results. */
export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
  /** Status lines shown while the answer was written ("Looking at Today…"). */
  status?: string[]
  /** "4 of 5 changes applied", "Proposal discarded", "Undone". */
  note?: string
  /** The answer ended with this stop reason (refusal and max_tokens are shown). */
  stop?: string
  error?: string
  usage?: { input: number; output: number; month_total?: number; cap?: number; own_key?: boolean }
  /** The skill this question ran (assistant-skills), by name. */
  skill?: string
  /** Lines of pasted material sent with this question. */
  pastedLines?: number
  at: number
}

/** The inverse of one applied change set (in-app-assistant D2): kept for the last 20. */
export interface AssistantUndo {
  id: string
  created_at: number
  /** How many changes were applied, for the summary. */
  count: number
  /** Field values to restore, per entity. */
  inverse: { entity: string; entityId: string; patch: Record<string, unknown>; created?: boolean }[]
  /** The clock each applied field got, to skip fields changed again since. */
  clocks: { entity: string; entityId: string; field: string; ts: number; device: string }[]
  undone_at?: number
  /** Who applied it (bulk-edit D5; `action` is one task's own action, ux-overhaul); rows without it come from the assistant. */
  source?: 'assistant' | 'bulk' | 'action'
  /** What the toast says ("3 tasks completed"). */
  label?: string
}

interface Meta {
  key: string
  value: unknown
}

/** One pick in a picker context on this device (ui-primitives D7). */
export interface PickHistory {
  /** `${context}\u0000${key}`: a plain string key (WebKit's IndexedDB is fragile with compound keys). */
  id: string
  context: string
  key: string
  count: number
  lastAt: number
}

/** A file waiting for upload (attachments D3). `blob` is the stored form (the envelope when encrypted). */
export interface AttachmentBlob {
  id: string
  blob: Blob
  name: string
  size: number
  /** Why the server refused it last time (too large, over the total, rate limited); absent while it is simply waiting. */
  reason?: string
}

class OpenTodoDB extends Dexie {
  projects!: Table<Project, string>
  tasks!: Table<Task, string>
  labels!: Table<Label, string>
  views!: Table<View, string>
  reminders!: Table<Reminder, string>
  /** Sections of projects (board-view). */
  sections!: Table<Section, string>
  /** Custom field definitions (OpenSpec custom-fields), a child of the project like sections. */
  fields!: Table<FieldDef, string>
  /** Cached project memberships (project-sharing): server data adopted on every sync, never written as ops. */
  memberships!: Table<Membership, string>
  /** Cached in-app notifications (task-assignment): server data, refreshed after sync, never ops. */
  notifications!: Table<AppNotification, string>
  /** Comments (comments-and-activity): a synced entity like tasks. */
  comments!: Table<Comment, string>
  /**
   * The ops activity is derived from (comments-and-activity D4/D5), recorded as
   * they are applied with their author and old value; bounded per project and
   * never synced. Events are derived from these rows at read time (lib/activity).
   */
  activity!: Table<ActivityEntry, string>
  /** Personal per-project preferences (activity-feed): the synced `project_prefs` entity, keyed by project id. */
  prefs!: Table<ProjectPrefs, string>
  /** The user's date and time preferences (date-time-preferences): the synced `user_prefs` entity, one row "me". */
  userPrefs!: Table<UserPrefs, string>
  /** When the user last finished a weekly review (stats-and-review D4): the synced `review` entity, one row "me". */
  review!: Table<Review, string>
  outbox!: Table<OutboxOp, number>
  meta!: Table<Meta, string>
  /** In-app assistant conversations and undo batches: device-local, never ops. */
  assistantThreads!: Table<AssistantThread, string>
  assistantUndo!: Table<AssistantUndo, string>
  /** Device-local pick history for picker ranking (ui-primitives D7): never synced or exported. */
  pickHistory!: Table<PickHistory, string>
  /** Attachments (OpenSpec attachments): a synced entity, indexed by task and comment. */
  attachments!: Table<Attachment, string>
  /** Bytes of files this device added and has not uploaded yet: device-local, never ops (attachments D3). */
  attachmentBlobs!: Table<AttachmentBlob, string>
  /** Events of subscribed calendars and the subscriptions (calendar-feeds): server data, never ops. */
  calendarEvents!: Table<CalendarEvent, string>
  calendarSubscriptions!: Table<CalendarSubscription, string>
  /** Time entries (OpenSpec time-tracking): a synced entity, indexed by task, author and start. */
  timeEntries!: Table<TimeEntry, string>
  /** The focus timer's state (focus-mode D2): one row "current" on this device, never synced, cleared at sign-out. */
  focus!: Table<FocusState, string>

  constructor(name = 'opentodo') {
    super(name)
    this.version(1).stores({
      projects: 'id, position',
      tasks: 'id, project_id, completed_at, position',
      outbox: '++local, id',
      meta: 'key',
    })
    // v2 (subtask-trees): index tasks by parent so subtree lookups stay cheap.
    this.version(2).stores({
      tasks: 'id, project_id, parent_id, completed_at, position',
    })
    // v3 (labels): add the labels table. Additive; every store is redeclared for clarity.
    this.version(3).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position',
      labels: 'id, position',
      outbox: '++local, id',
      meta: 'key',
    })
    // v4 (custom-views): add the views table. Additive; every store is redeclared.
    this.version(4).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position',
      labels: 'id, position',
      views: 'id, position',
      outbox: '++local, id',
      meta: 'key',
    })
    // v5 (project-sharing): cache of the caller's shared-project memberships. Additive.
    this.version(5).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position',
      labels: 'id, position',
      views: 'id, position',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
    })
    // v6 (reminders): add the reminders table, indexed by task and firing time.
    // Additive; every store is redeclared.
    this.version(6).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
    })
    // v7 (task-assignment): index tasks by assignee for "Assigned to me" and cache
    // in-app notifications. Additive.
    this.version(7).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
    })
    // v9 (board-view): sections of projects, and tasks indexed by section. Additive;
    // every store is redeclared. (v8 was reserved by a parallel change; Dexie only
    // needs versions to increase, so a database that skips 8 upgrades fine.)
    this.version(9).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
    })
    // v10 (comments-and-activity): comments (synced entity, indexed by task) and the
    // local activity log derived from ops, bounded per project. Additive; every
    // store is redeclared.
    this.version(10).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
      comments: 'id, task_id',
      activity: 'id, [projectKey+ts], taskId, entityId',
    })
    // v12 (activity-feed): personal per-project preferences (`project_prefs` ops),
    // keyed by project id. Additive; every store is redeclared. (v11 is reserved
    // by a parallel change; a database that skips a version upgrades fine.)
    this.version(12).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
      comments: 'id, task_id',
      activity: 'id, [projectKey+ts], taskId, entityId',
      prefs: 'id',
    })
    // v13 (in-app-assistant): device-local conversations and undo batches.
    // Additive; every store is redeclared. Never synced and never in the outbox.
    this.version(13).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
      comments: 'id, task_id',
      activity: 'id, [projectKey+ts], taskId, entityId',
      prefs: 'id',
      assistantThreads: 'id, updated_at',
      assistantUndo: 'id, created_at',
    })
    // v14 (ui-primitives): device-local pick history for picker ranking.
    // Additive; every store is redeclared. Never synced and never in the outbox.
    this.version(14).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
      comments: 'id, task_id',
      activity: 'id, [projectKey+ts], taskId, entityId',
      prefs: 'id',
      assistantThreads: 'id, updated_at',
      assistantUndo: 'id, created_at',
      pickHistory: 'id, context',
    })
    // v15 (date-time-preferences): the synced personal `user_prefs` row.
    // Additive; every store is redeclared.
    this.version(15).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
      comments: 'id, task_id',
      activity: 'id, [projectKey+ts], taskId, entityId',
      prefs: 'id',
      assistantThreads: 'id, updated_at',
      assistantUndo: 'id, created_at',
      pickHistory: 'id, context',
      userPrefs: 'id',
    })
    // v16 (attachments): the synced `attachment` entity and the device-local bytes
    // waiting for upload. Additive; every store is redeclared.
    this.version(16).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
      comments: 'id, task_id',
      activity: 'id, [projectKey+ts], taskId, entityId',
      prefs: 'id',
      assistantThreads: 'id, updated_at',
      assistantUndo: 'id, created_at',
      pickHistory: 'id, context',
      userPrefs: 'id',
      attachments: 'id, task_id, comment_id',
      attachmentBlobs: 'id',
    })
    // v17 (calendar-feeds): cached events of subscribed calendars and the
    // subscriptions. Server data adopted on refresh; every store is redeclared.
    this.version(17).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
      comments: 'id, task_id',
      activity: 'id, [projectKey+ts], taskId, entityId',
      prefs: 'id',
      assistantThreads: 'id, updated_at',
      assistantUndo: 'id, created_at',
      pickHistory: 'id, context',
      userPrefs: 'id',
      attachments: 'id, task_id, comment_id',
      attachmentBlobs: 'id',
      calendarEvents: 'id, subscriptionId, start.date',
      calendarSubscriptions: 'id',
    })
    // v18 (custom-fields): the synced `field` definitions, a child of the project
    // like sections. Task values live on the task row. Additive; every store is
    // redeclared.
    this.version(18).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      fields: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
      comments: 'id, task_id',
      activity: 'id, [projectKey+ts], taskId, entityId',
      prefs: 'id',
      assistantThreads: 'id, updated_at',
      assistantUndo: 'id, created_at',
      pickHistory: 'id, context',
      userPrefs: 'id',
      attachments: 'id, task_id, comment_id',
      attachmentBlobs: 'id',
      calendarEvents: 'id, subscriptionId, start.date',
      calendarSubscriptions: 'id',
    })
    // v19 (stats-and-review): the synced personal `review` row (when the last
    // weekly review was finished). Additive; every store is redeclared.
    this.version(19).stores({
      projects: 'id, position',
      tasks: 'id, project_id, parent_id, completed_at, position, assignee_id, section_id',
      labels: 'id, position',
      views: 'id, position',
      reminders: 'id, task_id, fire_at',
      sections: 'id, [project_id+position], project_id',
      fields: 'id, [project_id+position], project_id',
      outbox: '++local, id',
      meta: 'key',
      memberships: 'projectId',
      notifications: 'id, createdAt',
      comments: 'id, task_id',
      activity: 'id, [projectKey+ts], taskId, entityId',
      prefs: 'id',
      assistantThreads: 'id, updated_at',
      assistantUndo: 'id, created_at',
      pickHistory: 'id, context',
      userPrefs: 'id',
      attachments: 'id, task_id, comment_id',
      attachmentBlobs: 'id',
      calendarEvents: 'id, subscriptionId, start.date',
      calendarSubscriptions: 'id',
      review: 'id',
    })
    // v20 (time-tracking): the synced `time_entry` entity. Dexie keeps every
    // store of v19, so only the new one is declared. No index on ended_at:
    // IndexedDB does not index null, the running entry is found by user_id.
    this.version(20).stores({ timeEntries: 'id, task_id, user_id, started_at' })
    // v21 (focus-mode D2): the focus timer's one device-local row; never an op, never exported.
    this.version(21).stores({ focus: 'id' })
  }
}

export let db = watchVersionChange(new OpenTodoDB())

/** Replace the database instance (tests use this to get an isolated store). */
export function useDatabase(name: string): OpenTodoDB {
  db = watchVersionChange(new OpenTodoDB(name))
  return db
}

// ---- a newer release in another tab (client-sync-robustness) ----

let outdated = false
const outdatedListeners = new Set<() => void>()

/**
 * Another tab opened the database with a newer schema: this tab closes its
 * connection (so the upgrade is not blocked) and asks to be reloaded. Its
 * writes would fail from here on, so the banner is the only way forward.
 */
function watchVersionChange(d: OpenTodoDB): OpenTodoDB {
  d.on('versionchange', () => {
    d.close()
    outdated = true
    for (const fn of outdatedListeners) fn()
    return false
  })
  return d
}

/** True once a newer version of the app took over the local database in another tab. */
export function databaseOutdated(): boolean {
  return outdated
}

/** Subscribes to {@link databaseOutdated}; returns an unsubscribe function. */
export function onDatabaseOutdated(fn: () => void): () => void {
  outdatedListeners.add(fn)
  return () => outdatedListeners.delete(fn)
}

/**
 * Asks the browser to keep this site's storage under pressure (Safari evicts
 * unpersisted data after weeks without a visit). Called after sign-in; the
 * answer is the browser's, and a refusal changes nothing.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!storage?.persist) return false
    if (await storage.persisted?.()) return true
    return await storage.persist()
  } catch {
    return false
  }
}

// ---- local data epoch (client-sync-robustness) ----

/**
 * Bumped whenever the local data stops belonging to the running session: on
 * sign-out (clearLocalData) and when sync stops. Work that started under an
 * older epoch (a sync exchange, the memoised device id) must not write again.
 */
let epoch = 0

export function localEpoch(): number {
  return epoch
}

/** Starts a new epoch: everything started before it stops at its next step. */
export function bumpLocalEpoch(): number {
  return ++epoch
}

/** A row of any synced entity, for code that treats every kind alike. */
export type EntityRow = Record<string, unknown> & { id: string; _clock?: Clock; _e2ee?: RowEncryption }

function tableMap(d: OpenTodoDB) {
  // `satisfies` keeps this exhaustive: a new entity kind does not compile until
  // it has its table here, and there is no fallback table (client-data-safety).
  return {
    project: d.projects, task: d.tasks, label: d.labels, view: d.views, reminder: d.reminders, section: d.sections,
    field: d.fields, comment: d.comments, project_prefs: d.prefs, user_prefs: d.userPrefs, attachment: d.attachments, review: d.review,
    time_entry: d.timeEntries,
  } satisfies Record<Entity, Table<unknown, string>>
}

let tables: { of: OpenTodoDB; map: Record<Entity, Table<EntityRow, string>> } | null = null

/** The one registry of the Dexie table of each synced entity kind. */
export function tableOf(entity: Entity): Table<EntityRow, string> {
  if (tables?.of !== db) tables = { of: db, map: tableMap(db) as unknown as Record<Entity, Table<EntityRow, string>> }
  const table = tables.map[entity]
  if (!table) throw new Error(`unknown entity kind: ${String(entity)}`)
  return table
}

/** The tables of every synced entity kind, in ENTITIES order. */
export function syncedTables(): Table<EntityRow, string>[] {
  return ENTITIES.map(tableOf)
}

/**
 * Every table that holds synced entities, plus the activity log that applyOps
 * folds ops into (comments-and-activity); applyOps and mutateMany lock all of them.
 */
export function entityTables(): Table[] {
  return [...syncedTables(), db.activity]
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/** Wipe every local table; used on logout so the next account starts clean. */
export async function clearLocalData(): Promise<void> {
  bumpLocalEpoch()
  await db.transaction('rw', [...entityTables(), db.outbox, db.meta, db.memberships, db.notifications, db.assistantThreads, db.assistantUndo, db.pickHistory, db.attachmentBlobs, db.calendarEvents, db.calendarSubscriptions, db.focus], async () => {
    await Promise.all([
      ...entityTables().map((t) => t.clear()), db.outbox.clear(), db.meta.clear(), db.memberships.clear(), db.attachmentBlobs.clear(),
      db.calendarEvents.clear(), db.calendarSubscriptions.clear(),
      db.notifications.clear(), db.assistantThreads.clear(), db.assistantUndo.clear(), db.pickHistory.clear(), db.focus.clear(),
    ])
  })
}
