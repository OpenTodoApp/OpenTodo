import Dexie, { type Table } from 'dexie'
import type { ActivityEntry, AppNotification, Comment, Label, Membership, Op, Project, ProjectPrefs, Reminder, Section, Task, View } from './types'

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
  usage?: { input: number; output: number; month_total?: number; cap?: number }
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
}

interface Meta {
  key: string
  value: unknown
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
  outbox!: Table<OutboxOp, number>
  meta!: Table<Meta, string>
  /** In-app assistant conversations and undo batches: device-local, never ops. */
  assistantThreads!: Table<AssistantThread, string>
  assistantUndo!: Table<AssistantUndo, string>

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
  return [db.projects, db.tasks, db.labels, db.views, db.reminders, db.sections, db.comments, db.prefs, db.activity]
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
  await db.transaction('rw', [...entityTables(), db.outbox, db.meta, db.memberships, db.notifications, db.assistantThreads, db.assistantUndo], async () => {
    await Promise.all([
      ...entityTables().map((t) => t.clear()), db.outbox.clear(), db.meta.clear(), db.memberships.clear(),
      db.notifications.clear(), db.assistantThreads.clear(), db.assistantUndo.clear(),
    ])
  })
}
