// Collapsed tree rows, per device: a project's list, the Inbox, Today and Upcoming
// with Nest subtasks, and a saved view with Nest subtasks share one set of ids.
import { useCallback, useState } from 'react'
import { readJSON, writeJSON } from '../../lib/deviceStorage'

const COLLAPSE_KEY = 'opentodo.collapsed'

function loadCollapsed(): Set<string> {
  return new Set(readJSON<string[]>(COLLAPSE_KEY, [], (v) => (Array.isArray(v) ? v as string[] : null)))
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
