// The path from a task up to its project (GitHub issue 862): parents in root order,
// stopping when a parent is missing, deleted or already seen.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Task } from './types'

/** Parents from the furthest to the nearest. A deleted or missing parent ends the chain. */
export function parentChain(selfId: string, startParentId: string | null | undefined, get: (id: string) => Task | undefined): Task[] {
  const chain: Task[] = []
  const seen = new Set<string>([selfId])
  let cur = startParentId ?? null
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const parent = get(cur)
    if (!parent || parent.deleted_at) break
    chain.push(parent)
    cur = parent.parent_id
  }
  chain.reverse()
  return chain
}

/**
 * What the header shows of a parent chain. One parent stays a crumb. Two or more
 * keep only the nearest crumb and fold the rest into one menu, so the line stays
 * `Project › … › nearest › this task`.
 */
export function splitParents<T>(parents: readonly T[]): { hidden: T[]; shown: T[] } {
  if (parents.length <= 1) return { hidden: [], shown: [...parents] }
  return { hidden: parents.slice(0, -1), shown: parents.slice(-1) }
}

const NONE: Task[] = []

/** Live parents of a task, furthest first. Empty until the read lands, and when there is no parent. */
export function useParentChain(task: { id: string; parent_id: string | null } | null | undefined): Task[] {
  const id = task?.id
  const parentId = task?.parent_id ?? null
  const read = useLiveQuery(async () => {
    if (!id || !parentId) return { id: id ?? '', chain: NONE }
    const byId = new Map<string, Task>()
    const seen = new Set<string>([id])
    let cur: string | null = parentId
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const row: Task | undefined = await db.tasks.get(cur)
      if (!row) break
      byId.set(cur, row)
      cur = row.parent_id
    }
    return { id, chain: parentChain(id, parentId, (pid) => byId.get(pid)) }
  }, [id, parentId])
  return id && read?.id === id ? read.chain : NONE
}
