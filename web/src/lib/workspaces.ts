// Workspaces on the device (OpenSpec change `workspaces`, design D2, D4, D5, D15).
//
// A workspace is not a sync scope: projects, labels, views and project-less
// tasks carry `workspace_id`, and the device partitions what it shows. The
// rules live in one place, the `Partition` below, pinned against the server by
// internal/sync/testdata/workspaces_fixture.json:
// - absent or null `workspace_id` means the default workspace;
// - a task with a known project follows the project, else its parent task, else its own value;
// - a sub-project follows its root ancestor; a missing parent ends the chain;
// - a workspace this account is not in (not received yet, or a project shared
//   from another account's workspace) reads as the default workspace.
// The current workspace is device state in the `meta` table, never synced.
import { db, getMeta, setMeta } from './db'
import type { Project, Task, Workspace, WorkspaceEntry, WorkspaceGroup, WorkspaceMember } from './types'

/** The meta key of this device's current workspace. */
export const CURRENT_WORKSPACE_KEY = 'currentWorkspace'

/** Parent chains longer than this are cut, so a cycle cannot loop (the server uses the same bound). */
const MAX_DEPTH = 64

type ProjectLike = Pick<Project, 'id'> & { workspace_id?: string | null; parent_id?: string | null }
type TaskLike = Pick<Task, 'id'> & { workspace_id?: string | null; project_id?: string | null; parent_id?: string | null }

/** Places entities in one account's workspaces. */
export class Partition {
  readonly defaultId: string
  private readonly known: Set<string>
  private readonly projects: Map<string, ProjectLike>
  private readonly tasks: Map<string, TaskLike>

  constructor(defaultId: string, known: Iterable<string>, projects: Iterable<ProjectLike> = [], tasks: Iterable<TaskLike> = []) {
    this.defaultId = defaultId
    this.known = new Set(known)
    this.projects = new Map([...projects].map((p) => [p.id, p]))
    this.tasks = new Map([...tasks].map((t) => [t.id, t]))
  }

  /** An empty, unknown or foreign workspace id reads as the default. */
  own(workspaceId: string | null | undefined): string {
    return workspaceId && this.known.has(workspaceId) ? workspaceId : this.defaultId
  }

  /** The workspace of a project: its root ancestor's own value. */
  project(id: string): string {
    let cur = this.projects.get(id)
    if (!cur) return this.defaultId
    for (let i = 0; i < MAX_DEPTH && cur.parent_id; i++) {
      const parent: ProjectLike | undefined = this.projects.get(cur.parent_id)
      if (!parent) break
      cur = parent
    }
    return this.own(cur.workspace_id)
  }

  /** The workspace of a task: its project's when known, else its parent task's, else its own. */
  task(id: string): string {
    const cur = this.tasks.get(id)
    return cur ? this.taskRow(cur) : this.defaultId
  }

  /** Like task(), for a row that may not be in the partition's task list. */
  taskRow(row: TaskLike): string {
    let cur = row
    for (let i = 0; i < MAX_DEPTH; i++) {
      if (cur.project_id && this.projects.has(cur.project_id)) return this.project(cur.project_id)
      const parent = cur.parent_id ? this.tasks.get(cur.parent_id) : undefined
      if (!parent) break
      cur = parent
    }
    return this.own(cur.workspace_id)
  }
}

/** The entity kinds that belong to a workspace. */
export type PartitionedKind = 'project' | 'task' | 'label' | 'view'

/** The workspace an entity belongs to under the partition. */
export function workspaceOf(kind: PartitionedKind, entity: { id: string; workspace_id?: string | null } & Partial<TaskLike>, partition: Partition): string {
  if (kind === 'project') return partition.project(entity.id)
  if (kind === 'task') return partition.taskRow(entity)
  return partition.own(entity.workspace_id)
}

/** Whether an entity belongs to the workspace `current` (the default when '' or unknown). */
export function inWorkspace(kind: PartitionedKind, entity: { id: string; workspace_id?: string | null } & Partial<TaskLike>, partition: Partition, current: string): boolean {
  return workspaceOf(kind, entity, partition) === partition.own(current)
}

/**
 * The id to write as `workspace_id` for a new entity in `current`: null for the
 * default workspace, so devices from before the change and the default by
 * absence agree.
 */
export function workspaceIdFor(current: string, workspaces: readonly Workspace[]): string | null {
  const w = workspaces.find((x) => x.id === current)
  return w && !w.default ? w.id : null
}

/** The default workspace's id among the cached ones, '' before the first sync with a server that knows workspaces. */
export function defaultWorkspaceId(workspaces: readonly Workspace[]): string {
  return workspaces.find((w) => w.default)?.id ?? ''
}

/** The current workspace among `workspaces`: the stored choice when it still exists, else the default. */
export function resolveCurrent(stored: string | null | undefined, workspaces: readonly Workspace[]): string {
  return stored && workspaces.some((w) => w.id === stored) ? stored : defaultWorkspaceId(workspaces)
}

/** This device's current workspace id, resolved against the cache. */
export async function currentWorkspaceId(): Promise<string> {
  const [stored, all] = await Promise.all([getMeta<string>(CURRENT_WORKSPACE_KEY, ''), db.workspaces.toArray()])
  return resolveCurrent(stored, all)
}

/** Makes `id` this device's current workspace. */
export async function switchTo(id: string): Promise<void> {
  await setMeta(CURRENT_WORKSPACE_KEY, id)
}

/** The partition of everything cached on this device. */
export async function loadPartition(): Promise<Partition> {
  const [all, projects, tasks] = await Promise.all([db.workspaces.toArray(), db.projects.toArray(), db.tasks.toArray()])
  return new Partition(defaultWorkspaceId(all), all.map((w) => w.id), projects, tasks)
}

/** Sorts workspaces the way the switcher lists them: the default first, then by name. */
export function sortWorkspaces(list: readonly Workspace[]): Workspace[] {
  return list.slice().sort((a, b) => Number(b.default) - Number(a.default) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/**
 * Replaces the cached directory with a sync response's `workspaces` (design D8)
 * and returns the ids of the workspaces that are gone from it.
 */
export async function storeWorkspaces(entries: readonly WorkspaceEntry[]): Promise<string[]> {
  const workspaces: Workspace[] = entries.map(({ id, name, icon, color, default: isDefault, role, ownerId }) => ({ id, name, icon: icon ?? '', color: color ?? '', default: !!isDefault, role, ownerId }))
  const members: WorkspaceMember[] = entries.flatMap((w) => (w.members ?? []).map((m) => ({ id: `${w.id}\u0000${m.userId}`, workspaceId: w.id, userId: m.userId, name: m.name, role: m.role })))
  const groups: WorkspaceGroup[] = entries.flatMap((w) => (w.groups ?? []).map((g) => ({ id: g.id, workspaceId: w.id, name: g.name, members: g.members ?? [] })))
  let gone: string[] = []
  await db.transaction('rw', db.workspaces, db.workspaceMembers, db.groups, async () => {
    const before = await db.workspaces.toCollection().primaryKeys()
    const now = new Set(workspaces.map((w) => w.id))
    gone = before.filter((id) => !now.has(id))
    await Promise.all([db.workspaces.clear(), db.workspaceMembers.clear(), db.groups.clear()])
    await Promise.all([db.workspaces.bulkPut(workspaces), db.workspaceMembers.bulkPut(members), db.groups.bulkPut(groups)])
  })
  return gone
}
