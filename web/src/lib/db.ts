import Dexie, { type Table } from 'dexie'
import type { Attachment, CalendarEvent, CalendarSubscription, ActivityEntry, AppNotification, Comment, Label, Membership, Op, Project, ProjectPrefs, Reminder, Review, Section, Task, UserPrefs, View } from './types'

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
    // v18 (stats-and-review): the synced personal `review` row (when the last
    // weekly review was finished). Additive; every store is redeclared.
    this.version(18).stores({
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
      review: 'id',
    })
  }
}

export let db = new OpenTodoDB()

/** Replace the database instance (tests use this to get an isolated store). */
export function useDatabase(name: string): OpenTodoDB {
  db = new OpenTodoDB(name)
  return db
}

/**
 * Every table that holds synced entities, plus the activity log that applyOps
 * folds ops into (comments-and-activity); applyOps and mutateMany lock all of them.
 */
export function entityTables() {
  return [db.projects, db.tasks, db.labels, db.views, db.reminders, db.sections, db.comments, db.prefs, db.userPrefs, db.attachments, db.review, db.activity]
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
  await db.transaction('rw', [...entityTables(), db.outbox, db.meta, db.memberships, db.notifications, db.assistantThreads, db.assistantUndo, db.pickHistory, db.attachmentBlobs, db.calendarEvents, db.calendarSubscriptions], async () => {
    await Promise.all([
      ...entityTables().map((t) => t.clear()), db.outbox.clear(), db.meta.clear(), db.memberships.clear(), db.attachmentBlobs.clear(),
      db.calendarEvents.clear(), db.calendarSubscriptions.clear(),
      db.notifications.clear(), db.assistantThreads.clear(), db.assistantUndo.clear(), db.pickHistory.clear(),
    ])
  })
}
