// The slots of a list's property column (OpenSpec change sidebar-brand-and-row-grid,
// design D2; task-list-presentation "One row anatomy"). From 40 rem of row width every
// row of a list stands its properties in the same tracks: project, labels, estimate,
// date, assignee. A slot that is empty on a row keeps its width, so the columns never
// drift; a slot that no row of the list uses takes none. Which slots are unused is one
// fact of the whole list, decided here from its rows (never from the rows in view, so
// scrolling never moves a column), the same way the time column is. The answer errs
// towards keeping a slot: a hole is better than a value cut away.
import { useMemo } from 'react'
import { useAnyTracked } from './timeEntries'
import type { RowProperty, Task } from './types'

export type RowSlot = 'project' | 'labels' | 'estimate' | 'date' | 'assignee'

type SlotFields = Pick<Task, 'id' | 'project_id' | 'labels' | 'estimate_minutes' | 'due' | 'sector' | 'start' | 'evening' | 'day_part' | 'assignee_id'>

export interface SlotOptions {
  /** The label whose view is open: its chip is left out of every row. */
  omitLabel?: string
  /** The properties the view's display options hide. */
  hidden?: readonly RowProperty[]
  /** Whether a dated task's row shows date words: false where its group heading names the day (Upcoming). */
  dateShown?: (task: SlotFields) => boolean
}

/** The slots a task's row fills, by its own fields (tracked time aside: see `useUnusedSlots`). */
function filled(task: SlotFields, omitLabel: string | undefined, dateShown?: (task: SlotFields) => boolean): RowSlot[] {
  const out: RowSlot[] = []
  if (task.project_id) out.push('project')
  if (task.labels?.some((l) => l !== omitLabel)) out.push('labels')
  if (task.estimate_minutes) out.push('estimate')
  if ((task.due || task.sector || task.start || task.evening || task.day_part) && (!dateShown || dateShown(task))) out.push('date')
  if (task.assignee_id) out.push('assignee')
  return out
}

const ALL: readonly RowSlot[] = ['project', 'labels', 'estimate', 'date', 'assignee']

/**
 * The list's unused slots as the row's `slotsOff` value, space separated ("" when every
 * slot is used). `tracked` says whether some row shows tracked time in its estimate slot.
 */
export function unusedSlots(tasks: Iterable<SlotFields>, opts: SlotOptions & { tracked?: boolean } = {}): string {
  const used = new Set<RowSlot>()
  if (opts.tracked) used.add('estimate')
  for (const task of tasks) {
    for (const slot of filled(task, opts.omitLabel, opts.dateShown)) used.add(slot)
    if (used.size === ALL.length) break
  }
  return ALL.filter((s) => !used.has(s) || opts.hidden?.includes(s)).join(' ')
}

/** `unusedSlots` for a smaller list that does not follow tracked time: its estimate slot always stays. */
export function listSlotsOff(tasks: Iterable<SlotFields>, omitLabel?: string): string {
  return unusedSlots(tasks, { omitLabel, tracked: true })
}

/** `unusedSlots` for a list, live: it changes only when a slot's use changes, so the rows (memoized) keep their props. */
export function useUnusedSlots(tasks: readonly SlotFields[] | undefined, opts: SlotOptions = {}): string {
  const { omitLabel, hidden, dateShown } = opts
  const base = useMemo(() => unusedSlots(tasks ?? [], { omitLabel, hidden, dateShown }), [tasks, omitLabel, hidden, dateShown])
  // Only while no estimate is set does tracked time decide the estimate slot.
  const ids = useMemo(() => (tasks && base.split(' ').includes('estimate') && !hidden?.includes('estimate') ? tasks.map((t) => t.id) : null), [tasks, base, hidden])
  const tracked = useAnyTracked(ids)
  return tracked ? base.split(' ').filter((s) => s !== 'estimate').join(' ') : base
}
