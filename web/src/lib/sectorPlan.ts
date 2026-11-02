// The planning list's Time sectors source (OpenSpec change time-sectors, design
// D5): open tasks without a do-on date, grouped by their sector in a fixed order
// (Carried over, This week … Next quarter, Later), each task once by its own
// sector. A group lists only the tasks that can be worked on now, by the one
// availability rule (flow.ts, shared with Next and Today's limit); the others are
// counted as waiting. Derived from local rows on each render; nothing is written.
import { availability, type FlowInput } from './flow'
import { compareByPosition } from './ordering'
import { compareSectors, SECTOR_GROUPS, sectorGroup, type SectorGroup } from './sectors'
import type { Task } from './types'

export interface SectorPlanGroup {
  group: SectorGroup
  /** The available tasks, by sector then position. */
  tasks: Task[]
  /** The tasks of the group that cannot be worked on now (blocked, deferred, waiting in sequence). */
  waiting: Task[]
  /** The sum of the known estimates of the listed tasks, in minutes. */
  minutes: number
}

export interface SectorPlanInput extends Omit<FlowInput, 'tasks'> {
  tasks: readonly Task[]
  /** The viewer's first day of the week, 0 Sunday … 6 Saturday. */
  weekStart: number
}

/** The groups in order, empty ones left out (design D5). */
export function sectorPlan(input: SectorPlanInput): SectorPlanGroup[] {
  const flow = availability(input)
  const by = new Map<SectorGroup, { tasks: Task[]; waiting: Task[] }>()
  for (const task of input.tasks) {
    if (task.completed_at || task.deleted_at || task.due || !task.sector) continue
    const group = sectorGroup(task.sector, input.today, input.weekStart)
    if (!group) continue
    const entry = by.get(group) ?? { tasks: [], waiting: [] }
    ;(flow.available(task.id) ? entry.tasks : entry.waiting).push(task)
    by.set(group, entry)
  }
  const order = (a: Task, b: Task) => compareSectors(a.sector!, b.sector!) || compareByPosition(a, b)
  return SECTOR_GROUPS.flatMap((group): SectorPlanGroup[] => {
    const entry = by.get(group)
    if (!entry) return []
    entry.tasks.sort(order)
    entry.waiting.sort(order)
    return [{ group, ...entry, minutes: entry.tasks.reduce((sum, t) => sum + (t.estimate_minutes ?? 0), 0) }]
  })
}
