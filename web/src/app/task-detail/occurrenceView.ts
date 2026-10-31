// Which occurrence the panel shows a series on (OpenSpec change series-exceptions,
// design D5): the date it was opened from (a projection, or This occurrence chosen
// on the series), or null on All occurrences. Kept apart from the lazy scope control
// so the panel knows at once whether the series' values are read-only there. With
// This and following chosen (series-split D6) the values are editable and the
// first edit splits the series from that date.
import { useSyncExternalStore } from 'react'
import { resettable } from '../../lib/moduleState'
import { seriesRule } from '../../lib/recurring'
import type { Task } from '../../lib/types'
import { usePanelProjection } from '../panel'

let following: { id: string; date: string } | null = null
const listeners = new Set<() => void>()
resettable('occurrenceView', () => { following = null })

/** Choose This and following for the series `id` on its occurrence of `date` (null: leave it). */
export function setFollowing(next: { id: string; date: string } | null): void {
  following = next
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The date This and following is chosen from on the series the panel shows on that date, or null. */
export function useFollowing(task: Task | null | undefined): string | null {
  const projected = usePanelProjection(task?.id)
  const chosen = useSyncExternalStore(subscribe, () => (task && following?.id === task.id ? following.date : null), () => null)
  return chosen && chosen === projected ? chosen : null
}

/** The date of the occurrence the panel shows a series on (This occurrence), or null (All occurrences, This and following). */
export function useOccurrenceView(task: Task | null | undefined): string | null {
  const projected = usePanelProjection(task?.id)
  const chosen = useFollowing(task)
  return task && seriesRule(task) && !chosen ? projected : null
}
