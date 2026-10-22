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
import type { Label, Project, Task, View, Workspace, WorkspaceEntry, WorkspaceGroup, WorkspaceMember } from './types'

/** The meta key of this device's current workspace. */
export const CURRENT_WORKSPACE_KEY = 'currentWorkspace'

/** Parent chains longer than this are cut, so a cycle cannot loop (the server uses the same bound). */
const MAX_DEPTH = 64

export type ProjectLike = Pick<Project, 'id'> & { workspace_id?: string | null; parent_id?: string | null }
export type TaskLike = Pick<Task, 'id'> & { workspace_id?: string | null; project_id?: string | null; parent_id?: string | null }

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

// ---- the partition of what the device shows ----

/** The device's workspace state: the current workspace, the default and every cached one. */
export interface WorkspaceState {
  current: string
  defaultId: string
  list: Workspace[]
}

/** Reads the workspace state; inside a live query it re-runs when either changes. */
export async function readWorkspaceState(): Promise<WorkspaceState> {
  const [stored, list] = await Promise.all([getMeta<string>(CURRENT_WORKSPACE_KEY, ''), db.workspaces.toArray()])
  return { current: resolveCurrent(stored, list), defaultId: defaultWorkspaceId(list), list: sortWorkspaces(list) }
}

/** Whether the partition can change anything: an account with one workspace sees everything. */
function partitioned(state: WorkspaceState): boolean {
  return state.list.length > 1
}

/** The projects of the current workspace (rows of every state). */
export function projectsIn<T extends ProjectLike>(state: WorkspaceState, projects: readonly T[]): T[] {
  if (!partitioned(state)) return projects as T[]
  const p = new Partition(state.defaultId, state.list.map((w) => w.id), projects)
  const here = p.own(state.current)
  return projects.filter((x) => p.project(x.id) === here)
}

/** The tasks of the current workspace; `projects` must be every project row. */
export function tasksIn<T extends TaskLike>(state: WorkspaceState, projects: readonly ProjectLike[], tasks: readonly T[]): T[] {
  if (!partitioned(state)) return tasks as T[]
  const p = new Partition(state.defaultId, state.list.map((w) => w.id), projects, tasks)
  const here = p.own(state.current)
  return tasks.filter((x) => p.taskRow(x) === here)
}

/** Labels or views of the current workspace: their own workspace_id decides. */
export function ownIn<T extends Label | View>(state: WorkspaceState, rows: readonly T[]): T[] {
  if (!partitioned(state)) return rows as T[]
  const p = new Partition(state.defaultId, state.list.map((w) => w.id))
  const here = p.own(state.current)
  return rows.filter((x) => p.own(x.workspace_id) === here)
}

/** The workspace_id a new project, label, view or project-less task gets here: null in the default workspace. */
export async function newWorkspaceId(): Promise<string | null> {
  const state = await readWorkspaceState()
  return workspaceIdFor(state.current, state.list)
}

/** The fields a new entity carries for the current workspace: none in the default one, so the op footprint stays. */
export async function workspaceFields(): Promise<{ workspace_id?: string }> {
  const id = await newWorkspaceId()
  return id ? { workspace_id: id } : {}
}

// ---- the directory from the sync response ----

const goneListeners = new Set<(names: string[]) => void>()

/** Subscribes to "the current workspace is no longer available" (the shell shows a toast); returns the unsubscribe. */
export function onCurrentWorkspaceGone(fn: (names: string[]) => void): () => void {
  goneListeners.add(fn)
  return () => goneListeners.delete(fn)
}

/**
 * Stores a sync response's directory. When the device's current workspace is
 * gone from it (left, removed or deleted), the device falls back to the
 * default workspace and the listeners are told its name.
 */
export async function storeWorkspacesFromSync(entries: readonly WorkspaceEntry[]): Promise<void> {
  const before = await db.workspaces.toArray()
  const stored = await getMeta<string>(CURRENT_WORKSPACE_KEY, '')
  const gone = await storeWorkspaces(entries)
  if (stored && gone.includes(stored)) {
    await setMeta(CURRENT_WORKSPACE_KEY, '')
    const name = before.find((w) => w.id === stored)?.name ?? ''
    for (const fn of goneListeners) fn([name])
  }
}

/** The workspace an entity belongs to, from the local data. */
export async function workspaceOfEntity(kind: PartitionedKind, id: string): Promise<string | null> {
  const [state, projects, tasks] = await Promise.all([readWorkspaceState(), db.projects.toArray(), kind === 'task' ? db.tasks.toArray() : Promise.resolve([])])
  if (state.list.length <= 1) return null
  const p = new Partition(state.defaultId, state.list.map((w) => w.id), projects, tasks)
  let ws: string
  if (kind === 'project') ws = p.project(id)
  else if (kind === 'task') ws = p.task(id)
  else {
    const row = kind === 'label' ? await db.labels.get(id) : await db.views.get(id)
    ws = p.own(row?.workspace_id)
  }
  return ws
}

