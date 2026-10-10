import Dexie, { type Table } from 'dexie'
import type { Label, Op, Project, Task } from './types'

export interface OutboxOp extends Op {
  /** Local insertion order; used to acknowledge sent ops. */
  local?: number
}

interface Meta {
  key: string
  value: unknown
}

class OpenTodoDB extends Dexie {
  projects!: Table<Project, string>
  tasks!: Table<Task, string>
  labels!: Table<Label, string>
  outbox!: Table<OutboxOp, number>
  meta!: Table<Meta, string>

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
  }
}

export let db = new OpenTodoDB()

/** Replace the database instance (tests use this to get an isolated store). */
export function useDatabase(name: string): OpenTodoDB {
  db = new OpenTodoDB(name)
  return db
}

/** Every table that holds synced entities; applyOps and mutateMany lock all of them. */
export function entityTables() {
  return [db.projects, db.tasks, db.labels]
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
  await db.transaction('rw', [db.projects, db.tasks, db.labels, db.outbox, db.meta], async () => {
    await Promise.all([db.projects.clear(), db.tasks.clear(), db.labels.clear(), db.outbox.clear(), db.meta.clear()])
  })
}
