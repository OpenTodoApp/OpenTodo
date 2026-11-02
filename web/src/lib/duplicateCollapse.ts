// Duplicate collapse (OpenSpec reusable-lists, design D4): while the app runs,
// a change to a reusable list's open items (a sync pull or a local write)
// schedules one collapse 2 s later. Every device picks the same survivor, so
// devices converge on one item without coordinating.
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { isReusable } from './reusable'

export const COLLAPSE_DELAY_MS = 2_000

/** A key that changes whenever an open top-level item of a reusable list changes. */
async function reusableOpenKey(): Promise<string> {
  const ids = (await db.projects.toArray()).filter((p) => !p.deleted_at && isReusable(p)).map((p) => p.id)
  if (!ids.length) return ''
  const tasks = await db.tasks.where('project_id').anyOf(ids).toArray()
  return tasks.filter((x) => !x.deleted_at && x.completed_at == null && !x.parent_id).map((x) => `${x.id}:${x.title}`).sort().join('\n')
}

export function useDuplicateCollapse(): void {
  const key = useLiveQuery(reusableOpenKey, [], '')
  useEffect(() => {
    if (!key) return
    // The collapse itself loads lazily, only once a reusable list exists.
    const timer = setTimeout(() => { void import('./reuseAdd').then((m) => m.collapseDuplicates()).catch(() => {}) }, COLLAPSE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [key])
}
