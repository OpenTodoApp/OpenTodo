import Dexie, { type Table } from 'dexie'
import type { Op, Project, Task } from './types'

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
  }
}

export let db = new OpenTodoDB()

/** Replace the database instance (tests use this to get an isolated store). */
export function useDatabase(name: string): OpenTodoDB {
  db = new OpenTodoDB(name)
  return db
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
  await db.transaction('rw', [db.projects, db.tasks, db.outbox, db.meta], async () => {
    await Promise.all([db.projects.clear(), db.tasks.clear(), db.outbox.clear(), db.meta.clear()])
  })
}
