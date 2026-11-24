// Collapsed tree rows, per device: a project's list, the Inbox, Today and Upcoming
// with Nest subtasks, and a saved view with Nest subtasks share one set of ids.
import { useCallback, useState } from 'react'
import { readJSON, removeItem, writeJSON } from '../../lib/deviceStorage'
import { subProjectsFoldedKey } from '../../lib/listGroups'

const COLLAPSE_KEY = 'opentodo.collapsed'
/** The folded Sub-projects groups' own list before subproject-inline (D1): read into the set once. */
const OLD_SUB_PROJECTS_KEY = 'ot.subprojects.collapsed'

const ids = (key: string) => readJSON<string[]>(key, [], (v) => (Array.isArray(v) ? v as string[] : null))

function loadCollapsed(): Set<string> {
  const set = new Set(ids(COLLAPSE_KEY))
  const old = ids(OLD_SUB_PROJECTS_KEY)
  if (!old.length) return set
  for (const id of old) set.add(subProjectsFoldedKey(id))
  saveCollapsed(set)
  removeItem(OLD_SUB_PROJECTS_KEY)
  return set
}

function saveCollapsed(set: Set<string>) {
  writeJSON(COLLAPSE_KEY, [...set]) // per-device convenience only; losing it is harmless
}

/** Collapsed tree rows (and the open Blocked group), per device. */
export function useCollapsedRows() {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const toggleCollapsed = useCallback((id: string, force?: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      const want = force ?? !next.has(id)
      if (want) next.add(id)
      else next.delete(id)
      saveCollapsed(next)
      return next
    })
  }, [])
  return { collapsed, toggleCollapsed }
}
