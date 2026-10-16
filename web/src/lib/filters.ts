// Duration filter (OpenSpec `time-blocking`, design D6): one predicate per kind, shared
// by the list views' filter chips and reusable by the filter query language.
import type { Task } from './types'
import { msg, translatedList } from './i18n'

export type DurationFilter = 'quick' | 'under30' | 'over60' | 'unestimated'

type DurationOption = { kind: DurationFilter; label: string; title: string }
export const DURATION_FILTERS: readonly DurationOption[] = translatedList<DurationOption, 'label' | 'title'>([
  { kind: 'quick', label: msg('Quick wins'), title: msg('Estimated at 15 minutes or less') },
  { kind: 'under30', label: msg('Under 30 min'), title: msg('Estimated at less than 30 minutes') },
  { kind: 'over60', label: msg('Over 1 h'), title: msg('Estimated at more than one hour') },
  { kind: 'unestimated', label: msg('Unestimated'), title: msg('No estimate yet') },
], 'label', 'title')

/** The minute bound behind each kind; `filter-query-language` maps `estimate <= 15` and friends onto these. */
export function durationPredicate(kind: DurationFilter): (task: Pick<Task, 'estimate_minutes'>) => boolean {
  switch (kind) {
    case 'quick':
      return (tk) => tk.estimate_minutes !== null && tk.estimate_minutes <= 15
    case 'under30':
      return (item) => item.estimate_minutes !== null && item.estimate_minutes < 30
    case 'over60':
      return (task) => task.estimate_minutes !== null && task.estimate_minutes > 60
    case 'unestimated':
      return (task) => task.estimate_minutes === null
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
