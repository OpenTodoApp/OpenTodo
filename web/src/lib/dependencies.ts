// Task dependencies (OpenSpec change task-dependencies, design D2, D3). A task's
// `blocked_by` lists the tasks it waits for; "blocked" is derived from local rows:
// a blocker counts while it is live and open. Completed, deleted and unknown ids
// never block, so nothing is ever repaired. A cycle that exists for a moment on a
// device (an edge arrived while choosing) is broken identically everywhere: in
// each cycle the member with the newest `blocked_by` clock stops blocking.
import { db } from './db'
import { getDeviceId, mutate, mutationTables } from './ops'
import { membershipMap, scopeOf } from './sharing'
import type { Membership, Task } from './types'

/** The server's limit on blockers per task. */
export const MAX_BLOCKED_BY = 50

type Clocked = Pick<Task, 'id' | 'blocked_by' | '_clock'>

export function blockersOf(t: Pick<Task, 'blocked_by'>): string[] {
  return t.blocked_by ?? []
}

const isOpen = (t: Task | undefined): t is Task => !!t && !t.deleted_at && !t.completed_at
const edgeKey = (from: string, to: string) => `${from}\u0000${to}`

function newer(a: Clocked, b: Clocked): boolean {
  const ca = a._clock?.blocked_by
  const cb = b._clock?.blocked_by
  const at = ca?.ts ?? 0
  const bt = cb?.ts ?? 0
  if (at !== bt) return at > bt
  const ad = ca?.device ?? ''
  const bd = cb?.device ?? ''
  if (ad !== bd) return ad > bd
  return a.id > b.id
}

/**
 * The edges a local cycle breaks: within every cycle, the outgoing edges of the
 * member whose blocked_by clock is newest, repeated until no cycle is left. The
 * result does not depend on the order of `tasks`.
 */
export function brokenEdges(tasks: readonly Clocked[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const broken = new Set<string>()
  const out = (id: string) => blockersOf(byId.get(id) ?? {}).filter((b) => byId.has(b) && !broken.has(edgeKey(id, b)))
  for (;;) {
    const sccs = stronglyConnected([...byId.keys()].sort(), out).filter((c) => c.length > 1)
    if (sccs.length === 0) return broken
    for (const scc of sccs) {
      const members = new Set(scc)
      let loser = byId.get(scc[0])!
      for (const id of scc.slice(1)) if (newer(byId.get(id)!, loser)) loser = byId.get(id)!
      for (const b of out(loser.id)) if (members.has(b)) broken.add(edgeKey(loser.id, b))
    }
  }
}

/** Tarjan's strongly connected components over ids and an edge function. */
function stronglyConnected(ids: string[], edges: (id: string) => string[]): string[][] {
  let index = 0
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const on = new Set<string>()
  const out: string[][] = []
  const visit = (v: string) => {
    idx.set(v, index)
    low.set(v, index++)
    stack.push(v)
    on.add(v)
    for (const w of edges(v)) {
      if (!idx.has(w)) {
        visit(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (on.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!))
      }
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = []
      let w: string
      do {
        w = stack.pop()!
        on.delete(w)
        scc.push(w)
      } while (w !== v)
      out.push(scc)
    }
  }
  for (const id of ids) if (!idx.has(id)) visit(id)
  return out
}

/** The task's blockers that are live and open (unknown ids, completed and deleted ones never block). */
export function openBlockers(task: Pick<Task, 'id' | 'blocked_by'>, byId: ReadonlyMap<string, Task>, broken: ReadonlySet<string> = new Set()): Task[] {
  const out: Task[] = []
  for (const id of blockersOf(task)) {
    const b = byId.get(id)
    if (isOpen(b) && !broken.has(edgeKey(task.id, id))) out.push(b)
  }
  return out
}

export function isBlocked(task: Pick<Task, 'id' | 'blocked_by'>, byId: ReadonlyMap<string, Task>, broken?: ReadonlySet<string>): boolean {
  return openBlockers(task, byId, broken).length > 0
}

/** Open blockers per task, for the rows of a view (tasks without any are left out). */
export function blockedMap(tasks: readonly Task[]): Map<string, number> {
  const out = new Map<string, number>()
  if (!tasks.some((t) => blockersOf(t).length)) return out
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const broken = brokenEdges(tasks)
  for (const t of tasks) {
    if (!blockersOf(t).length || t.completed_at || t.deleted_at) continue
    const n = openBlockers(t, byId, broken).length
    if (n) out.set(t.id, n)
  }
  return out
}

/** Live tasks that wait for `taskId` (the "Blocks" list). */
export function dependents(taskId: string, tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => !t.deleted_at && blockersOf(t).includes(taskId))
}

/** True when `to` is reachable from `from` along blocked_by edges (structural: completed and deleted tasks count). */
export function reaches(from: string, to: string, byId: ReadonlyMap<string, Pick<Task, 'blocked_by'>>): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const id = stack.pop()!
    if (id === to) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...blockersOf(byId.get(id) ?? {}))
  }
  return false
}

/**
 * Tasks the picker offers as blockers: open and live, in the task's sharing scope,
 * not the task itself, not already a blocker, and not waiting for the task
 * (directly or through others), which would close a cycle.
 */
export function blockerCandidates(task: Task, tasks: readonly Task[], memberships: Map<string, Membership>): Task[] {
  const scope = scopeOf(task.project_id, memberships)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const current = new Set(blockersOf(task))
  return tasks.filter((c) => isOpen(c) && c.id !== task.id && !current.has(c.id)
    && scopeOf(c.project_id, memberships) === scope && !reaches(c.id, task.id, byId))
}

/**
 * Write a task's blockers as one op, checked against a fresh read in one
 * transaction (like setPanels), so sequential edits never lose an entry. Refuses
 * the task itself, a task of another sharing scope and a list that closes a
 * cycle, with a message ready to show.
 */
export async function setBlockedBy(taskId: string, ids: string[]): Promise<void> {
  await getDeviceId()
  const memberships = await membershipMap()
  await db.transaction('rw', mutationTables(), async () => {
    const task = await db.tasks.get(taskId)
    if (!task || task.deleted_at) throw new Error('Task not found')
    const list = [...new Set(ids)]
    if (list.length > MAX_BLOCKED_BY) throw new Error(`A task can wait for at most ${MAX_BLOCKED_BY} tasks`)
    const current = blockersOf(task)
    const added = list.filter((id) => !current.includes(id))
    if (added.length) {
      const all = await db.tasks.toArray()
      const byId = new Map(all.map((t) => [t.id, t]))
      const scope = scopeOf(task.project_id, memberships)
      byId.set(taskId, { ...task, blocked_by: list })
      for (const id of added) {
        if (id === taskId) throw new Error('A task cannot wait for itself')
        const other = byId.get(id)
        if (other && scopeOf(other.project_id, memberships) !== scope) {
          throw new Error(`“${other.title || 'Untitled'}” is in a project shared differently; a task can only wait for tasks shared the same way`)
        }
        if (reaches(id, taskId, byId)) {
          throw new Error(`“${other?.title || 'That task'}” already waits for this task, so it cannot block it`)
        }
      }
    }
    if (list.length === current.length && list.every((id, i) => id === current[i])) return
    await mutate('task', taskId, { blocked_by: list })
  })
}

/** Add one blocker. */
export async function addBlocker(taskId: string, blockerId: string): Promise<void> {
  const task = await db.tasks.get(taskId)
  await setBlockedBy(taskId, [...blockersOf(task ?? {}), blockerId])
}

/** Remove one blocker. */
export async function removeBlocker(taskId: string, blockerId: string): Promise<void> {
  const task = await db.tasks.get(taskId)
  await setBlockedBy(taskId, blockersOf(task ?? {}).filter((id) => id !== blockerId))
}
