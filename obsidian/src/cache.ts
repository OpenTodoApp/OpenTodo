// Projects and labels for the sheet and for label matching (obsidian-plugin D5):
// read from the server at most every five minutes (or on demand), names opened
// for an encrypted account, kept in per-device storage so the sheet works
// offline with the last known lists. A project the user may not add tasks to (a
// viewer's, an archived or deleted one) is never offered.
import type { Client, LabelRow, ProjectRow } from './api'
import type { Keyring } from './crypt'
import { K, type DeviceStorage } from './storage'

export const REFRESH_MS = 5 * 60 * 1000

export interface CachedProject {
  id: string
  name: string
  parent_id: string | null
  position: number
  /** A project shared with others: its tasks are never encrypted. */
  shared: boolean
}

export interface CachedLabel {
  id: string
  name: string
  position: number
  created_at: number
}

export class Lists {
  constructor(private store: DeviceStorage) {}

  projects(): CachedProject[] {
    return this.store.get<CachedProject[]>(K.projects) ?? []
  }

  labels(): CachedLabel[] {
    return this.store.get<CachedLabel[]>(K.labels) ?? []
  }

  fresh(now = Date.now()): boolean {
    return now - (this.store.get<number>(K.listsAt) ?? 0) < REFRESH_MS
  }

  /** Reads both lists unless they are fresh (or `force`); keeps the cached ones when the server cannot be reached. */
  async refresh(client: Client, keys: Keyring | null, opts: { force?: boolean; now?: number } = {}): Promise<boolean> {
    const now = opts.now ?? Date.now()
    if (!opts.force && this.fresh(now)) return false
    const [projects, labels] = await Promise.all([client.projects(), client.labels()])
    this.store.set(K.projects, await openProjects(projects, keys))
    this.store.set(K.labels, await openLabels(labels, keys))
    this.store.set(K.listsAt, now)
    return true
  }

  shared(projectId: string | null): boolean {
    return projectId !== null && this.projects().some((p) => p.id === projectId && p.shared)
  }
}

/** A role that may add tasks; personal projects carry none. */
const WRITES = new Set(['owner', 'admin', 'editor'])

async function openProjects(rows: ProjectRow[], keys: Keyring | null): Promise<CachedProject[]> {
  const out: CachedProject[] = []
  for (const p of rows) {
    if (p.deleted_at || p.archived) continue
    if (p.role !== undefined && !WRITES.has(p.role)) continue
    const shared = p.role !== undefined
    const name = !shared && keys?.unlocked ? await keys.open('project', p.id, 'name', p.name) : p.name
    if (typeof name !== 'string') continue
    out.push({ id: p.id, name, parent_id: p.parent_id ?? null, position: p.position ?? 0, shared })
  }
  return out.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
}

async function openLabels(rows: LabelRow[], keys: Keyring | null): Promise<CachedLabel[]> {
  const out: CachedLabel[] = []
  for (const l of rows) {
    if (l.deleted_at) continue
    const name = keys?.unlocked ? await keys.open('label', l.id, 'name', l.name) : l.name
    if (typeof name !== 'string') continue
    out.push({ id: l.id, name, position: l.position ?? 0, created_at: l.created_at ?? 0 })
  }
  return out
}
