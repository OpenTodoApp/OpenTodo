// Which occurrence the panel shows a series on (OpenSpec change series-exceptions,
// design D5): the date it was opened from (a projection, or This occurrence chosen
// on the series), or null on All occurrences. Kept apart from the lazy scope control
// so the panel knows at once whether the series' values are read-only there.
import { seriesRule } from '../../lib/recurring'
import type { Task } from '../../lib/types'
import { usePanelProjection } from '../panel'

/** The date of the occurrence the panel shows a series on (This occurrence), or null (All occurrences). */
export function useOccurrenceView(task: Task | null | undefined): string | null {
  const projected = usePanelProjection(task?.id)
  return task && seriesRule(task) ? projected : null
}
