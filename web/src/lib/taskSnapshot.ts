// The shared snapshot of the visible tasks, patched instead of re-read (OpenSpec
// change list-rendering-at-scale, design D2). One write used to make the shared
// live query read every stored task again (10,000 of them), and every task row
// got a new object, so lists re-derived and re-rendered everything. Here the
// snapshot keeps every stored row and, after each committed transaction, reads
// only the tasks it changed (Dexie names their keys in its storagemutated event)
// and swaps them in; a change it cannot name key by key (a cleared table, a
// range, a new database, very many keys) reads the table again. Unchanged rows
// keep their objects, so memoised rows and derived lists see that nothing
// changed. The projects and the workspace state (small tables) stay one live
// query, as before.
//
// The sets are patched the same way while the projects and workspaces stay as they
// were, and each new list notes the rows it changed (lib/taskDelta), so what is
// derived from it follows those rows too (OpenSpec change incremental-list-updates, D1).
import Dexie, { liveQuery, type IndexableType, type ObservabilitySet, type Subscription } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from './db'
import { HELD_REFRESH_MAX_MS, HELD_REFRESH_MS, isHeld, onHold, type LiveSnapshot } from './liveSnapshot'
import { deletedProjectIds, isTaskVisible } from './trash'
import type { Project, Task } from './types'
import { readWorkspaceState, tasksIn, type WorkspaceState } from './workspaces'
import { locateById, noteChanges, patchSorted, type TaskChange } from './taskDelta'
import { isKept, keptIds } from './subtasks'

export interface TaskSets { every: Task[]; here: Task[] }

/** More changed keys than this in one transaction: the table is read again. */
export const PATCH_LIMIT = 1_000

/** A node of Dexie's range tree: a range, the ranges below it (l) and above it (r). */
interface RangeNode { from?: IndexableType; to?: IndexableType; l?: RangeNode | null; r?: RangeNode | null }

/**
 * The changed task keys of a transaction, or 'all' when they cannot be named one
 * by one (a range, a cleared table, very many keys); null when no task changed.
 * The set is Dexie's range tree, a RangeSet or the plain copy a transaction keeps.
 */
export function changedTaskKeys(parts: ObservabilitySet, dbName: string): string[] | 'all' | null {
  const set = parts[`idb://${dbName}/tasks/`] as unknown as RangeNode | undefined
  if (!set) return null
  const keys: string[] = []
  const stack: RangeNode[] = [set]
  while (stack.length) {
    const node = stack.pop()!
    if (!('from' in node)) continue
    if (typeof node.from !== 'string' || node.from !== node.to) return 'all'
    keys.push(node.from)
    if (keys.length > PATCH_LIMIT) return 'all'
    if (node.l) stack.push(node.l)
    if (node.r) stack.push(node.r)
  }
  return keys
}

/** `rows` (sorted by id) with the read rows of `keys` swapped in, added, or removed when gone. */
export function patchRows(rows: readonly Task[], keys: readonly string[], read: readonly (Task | undefined)[]): Task[] {
  return patchRowsWith(rows, keys, read).rows
}

/** patchRows, with the changes it made (each key once: the row before and the row read). */
export function patchRowsWith(rows: readonly Task[], keys: readonly string[], read: readonly (Task | undefined)[]): { rows: Task[]; changes: TaskChange[] } {
  const out = rows.slice()
  const changes: TaskChange[] = []
  keys.forEach((id, i) => {
    const [at, found] = locateById(out, id)
    const row = read[i]
    const before = found ? out[at] : undefined
    if (row && found) out[at] = row
    else if (row) out.splice(at, 0, row)
    else if (found) out.splice(at, 1)
    if (before !== row) changes.push({ id, before, after: row })
  })
  return { rows: out, changes }
}

/** A task of `rows` (sorted by id) by its id. */
const finder = (rows: readonly Task[]) => (id: string): Task | undefined => {
  const [at, found] = locateById(rows, id)
  return found ? rows[at] : undefined
}

/** The visible tasks of every workspace and of the current one; kept subtasks are left out (keep-open-subtasks D3). */
export function deriveSets(rows: readonly Task[], projects: readonly Project[], state: WorkspaceState): TaskSets {
  const gone = deletedProjectIds(projects)
  const kept = keptIds(rows, finder(rows))
  const every = rows.filter((task) => isTaskVisible(task, gone) && !kept.has(task.id))
  return { every, here: tasksIn(state, projects, every) }
}

/** Whether a change can change whether other rows are kept: a parent's completion, deletion or parent changed (keep-open-subtasks D3). */
function movesKept(c: TaskChange, isParent: (id: string) => boolean): boolean {
  const a = c.before
  const b = c.after
  if (a && b && !a.completed_at === !b.completed_at && !a.deleted_at === !b.deleted_at && (a.parent_id ?? null) === (b.parent_id ?? null)) return false
  return isParent(c.id)
}

/**
 * The sets after `changes` to the stored rows, worked out from those rows: the same as
 * deriveSets of the new rows when the projects and workspaces are as for `prev`. Null
 * when the account has more than one workspace (a task's workspace can follow its
 * parent's, so a change can move others), and the sets are derived in full.
 */
export function patchSets(prev: TaskSets, changes: readonly TaskChange[], projects: readonly Project[], state: WorkspaceState, rows: readonly Task[]): TaskSets | null {
  if (prev.here !== prev.every || state.list.length > 1) return null
  // A changed parent can change its subtasks' state without a change of their own: derived in full.
  let parents: Set<string> | null = null
  const isParent = (id: string) => {
    if (!parents) {
      parents = new Set()
      for (const r of rows) if (r.parent_id) parents.add(r.parent_id)
    }
    return parents.has(id)
  }
  if (changes.some((c) => movesKept(c, isParent))) return null
  const gone = deletedProjectIds(projects)
  const get = finder(rows)
  const every = patchSorted(prev.every, changes, (task) => isTaskVisible(task, gone) && !isKept(task, get))
  if (every.list === prev.every) return prev
  noteChanges(prev.every, every.list, every.changes)
  return { every: every.list, here: every.list }
}

/** What deriveSets reads of the context: the workspace state, and each project's place and Trash state. */
export const contextKey = (c: { state: WorkspaceState; projects: readonly Project[] }): string =>
  JSON.stringify([c.state.current, c.state.defaultId, c.state.list.map((w) => w.id), c.projects.map((p) => [p.id, p.deleted_at ?? null, p.workspace_id ?? null, p.parent_id ?? null])])

/**
 * Resolves in a new task of the event loop, so what follows runs apart from the task
 * before it. A message, not a timer: timers wait 4 ms once nested, and a test's fake
 * timers would hold the snapshot.
 */
function nextTask(): Promise<void> {
  if (typeof MessageChannel !== 'function') return Promise.resolve()
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  }
  return value
}

export function taskSnapshot(): LiveSnapshot<TaskSets> {
  let source: unknown = null
  let rows: Task[] | null = null
  let context: { state: WorkspaceState; projects: Project[] } | null = null
  let snapshot: TaskSets | undefined
  const listeners = new Set<() => void>()
  let contextSub: Subscription | null = null
  let lastKey = ''
  let chain: Promise<void> = Promise.resolve()
  /** Changes noted while held: their keys, or 'all'. */
  let noted: Set<string> | 'all' | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false

  /** The context the snapshot was derived with: a change of rows alone patches it. */
  let derivedWith: { state: WorkspaceState; projects: Project[] } | null = null

  function publish(changes?: readonly TaskChange[]) {
    if (!rows || !context) return
    const patched = changes && snapshot && derivedWith === context ? patchSets(snapshot, changes, context.projects, context.state, rows) : null
    if (patched === snapshot) return
    const value = patched ?? deriveSets(rows, context.projects, context.state)
    derivedWith = context
    snapshot = import.meta.env.MODE === 'test' ? deepFreeze(value) : value
    for (const l of listeners) l()
  }

  const failed = (err: unknown) => console.warn('live tasks:', err)

  /** Applies a change after every earlier one, then shows it. */
  function apply(change: string[] | 'all') {
    const from = db
    chain = chain.then(async () => {
      if (!running || from !== db) return
      // A full read is derived in full; a patch passes the rows it changed on.
      let changes: TaskChange[] | undefined = []
      if (change === 'all' || !rows) {
        const read = (await from.tasks.toArray()) as Task[]
        // Decoding every row and the render it starts (useSyncExternalStore renders at
        // once) were one main-thread task of 200 ms or more on a first sync to the Inbox.
        // The rows are taken in the next task, so nothing publishes them before it.
        await nextTask()
        rows = read
        changes = undefined
      } else if (change.length) ({ rows, changes } = patchRowsWith(rows, change, (await from.tasks.bulkGet(change)) as (Task | undefined)[]))
      if (running && from === db) publish(changes)
    }).catch(failed)
  }

  function note(change: string[] | 'all') {
    if (noted === 'all' || change === 'all') noted = 'all'
    else {
      const keys: Set<string> = noted ?? new Set()
      for (const k of change) keys.add(k)
      noted = keys
    }
  }

  function flushNoted() {
    if (!noted) return
    const change = noted === 'all' ? 'all' : [...noted]
    noted = null
    apply(change)
  }

  function onMutated(parts: ObservabilitySet) {
    if (!running || source !== db) return
    const change = changedTaskKeys(parts, db.name)
    if (!change) return
    if (isHeld()) note(change)
    else apply(change)
  }

  function start() {
    stop()
    if (source !== db) snapshot = undefined
    source = db
    running = true
    rows = null
    Dexie.on('storagemutated', onMutated)
    apply('all')
    if (isHeld()) holdTimer()
    contextSub = liveQuery(async () => ({ state: await readWorkspaceState(), projects: await db.projects.toArray() }))
      .subscribe({ next: (v) => {
        // A project renamed or recoloured, or the workspace directory stored again,
        // changes nothing the sets depend on: deriving them again re-read 10,000 tasks.
        const key = contextKey(v)
        if (context && key === lastKey) return
        lastKey = key
        context = v
        publish()
      }, error: failed })
  }

  function stop() {
    running = false
    Dexie.on('storagemutated').unsubscribe(onMutated)
    contextSub?.unsubscribe()
    contextSub = null
    if (timer) clearTimeout(timer)
    timer = null
    noted = null
  }

  /** While held, the noted changes are shown after 2, 4, 8… seconds (as liveSnapshot). */
  function holdTimer() {
    const later = (wait: number) => {
      timer = setTimeout(() => {
        flushNoted()
        later(Math.min(wait * 2, HELD_REFRESH_MAX_MS))
      }, wait)
    }
    if (running && !timer) later(HELD_REFRESH_MS)
  }

  onHold({
    hold: holdTimer,
    release() {
      if (timer) clearTimeout(timer)
      timer = null
      flushNoted()
    },
  })

  function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    if (!running || source !== db) start()
    return () => {
      listeners.delete(fn)
      if (listeners.size === 0) {
        stop()
        snapshot = undefined
        rows = null
        context = null
      }
    }
  }

  const read = () => (source === db ? snapshot : undefined)
  return { use: () => useSyncExternalStore(subscribe, read, read), subscribe, read }
}
