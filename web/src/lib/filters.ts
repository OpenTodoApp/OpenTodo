// Duration filter (OpenSpec `time-blocking`, design D6): one predicate per kind, shared
// by the list views' filter chips and reusable by the filter query language.
import type { Task } from './types'

export type DurationFilter = 'quick' | 'under30' | 'over60' | 'unestimated'

export const DURATION_FILTERS: readonly { kind: DurationFilter; label: string; title: string }[] = [
  { kind: 'quick', label: 'Quick wins', title: 'Estimated at 15 minutes or less' },
  { kind: 'under30', label: 'Under 30 min', title: 'Estimated at less than 30 minutes' },
  { kind: 'over60', label: 'Over 1 h', title: 'Estimated at more than one hour' },
  { kind: 'unestimated', label: 'Unestimated', title: 'No estimate yet' },
]

/** The minute bound behind each kind; `filter-query-language` maps `estimate <= 15` and friends onto these. */
export function durationPredicate(kind: DurationFilter): (task: Pick<Task, 'estimate_minutes'>) => boolean {
  switch (kind) {
    case 'quick':
      return (t) => t.estimate_minutes !== null && t.estimate_minutes <= 15
    case 'under30':
      return (t) => t.estimate_minutes !== null && t.estimate_minutes < 30
    case 'over60':
      return (t) => t.estimate_minutes !== null && t.estimate_minutes > 60
    case 'unestimated':
      return (t) => t.estimate_minutes === null
  }
}

export function isDurationFilter(v: unknown): v is DurationFilter {
  return v === 'quick' || v === 'under30' || v === 'over60' || v === 'unestimated'
}

const KEY = 'opentodo.durationFilter'

/** Read a view's active filter; per device (localStorage), never synced. Unknown values read as none. */
export function loadDurationFilter(viewKey: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): DurationFilter | null {
  try {
    const raw = storage?.getItem(KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const v = map[viewKey]
    return isDurationFilter(v) ? v : null
  } catch {
    return null
  }
}

/** Set or clear (null) a view's filter. Storage failures are ignored: it is a convenience. */
export function saveDurationFilter(viewKey: string, kind: DurationFilter | null, storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): void {
  try {
    if (!storage) return
    const raw = storage.getItem(KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    if (kind) map[viewKey] = kind
    else delete map[viewKey]
    storage.setItem(KEY, JSON.stringify(map))
  } catch {
    // Private mode or quota: the filter simply does not persist.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
