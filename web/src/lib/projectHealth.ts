// Project health for the All projects table (OpenSpec change projects-table, design
// D1 to D3): one word per project from explicit rules, worked out on the device from
// the rows it already holds. Pure: no request, no write, no cache, so two synced
// devices show the same table. A folded project's figures include its live,
// unarchived sub-projects, an expanded one's only its own tasks, the way the
// sidebar's open counts work (project-organization "Open task counts").
import { compareDue, localDate } from './dates'
import type { Due, Project, Task } from './types'
import { openCount } from './views'

/** The health words, most urgent first (design D2): the first rule that holds decides. */
export type HealthWord = 'late' | 'slipping' | 'quiet' | 'on-track'

/** Without any change for this many days, a project with open tasks is quiet. */
export const QUIET_DAYS = 7

const DAY_MS = 86_400_000

export interface ProjectHealth {
  /** Null when nothing is open: there is nothing to be on track with. */
  word: HealthWord | null
  /** Open tasks whose deadline has passed. */
  pastDeadline: number
  /** The open task with the earliest passed deadline, named after "Late" when it is the only one. */
  firstPastDeadline: Pick<Task, 'id' | 'title'> | null
  /** Open tasks due before today. */
  late: number
  /** Whole days since the last change, when the project is quiet. */
  quietDays: number | null
}

export interface ProjectSummary {
  /** Open tasks that are active today (deferred and someday tasks wait), as the sidebar counts them. */
  open: number
  /** Completed tasks; a recurring series counts once, through its open task. */
  done: number
  /** done / (done + every open task, deferred ones included), or null when the project holds no task. */
  progress: number | null
  /** The earliest due date among open tasks. */
  nextDue: Due | null
  /** Whether that due date is before today. */
  nextDueLate: boolean
  /** The newest change to the project or one of its tasks (Unix ms), or null. */
  updated: number | null
  health: ProjectHealth
}

type HealthTask = Pick<Task, 'id' | 'title' | 'project_id' | 'completed_at' | 'deleted_at' | 'due' | 'series_id' | '_clock'>
  & Partial<Pick<Task, 'deadline' | 'skipped' | 'sample' | 'start'>>
type HealthProject = Pick<Project, 'id' | 'parent_id' | 'archived' | 'deleted_at' | '_clock'>

export interface HealthInput {
  projects: readonly HealthProject[]
  tasks: readonly HealthTask[]
  /** The viewer's logical day, YYYY-MM-DD. */
  today: string
  /** Now, Unix ms. */
  now: number
  /** The viewer's zone, for zoned due times; the device's by default. */
  zone?: string
  /** Whether a project's figures include its sub-projects (a folded row); every project by default. */
  rollUp?: (id: string) => boolean
}

/** The newest field timestamp of a row's clock, or 0. */
function clockTime(clock: Task['_clock'] | undefined): number {
  let max = 0
  for (const key in clock) if (clock[key].ts > max) max = clock[key].ts
  return max
}

/** A task counts when it is live, not a skipped habit occurrence and not a start guide sample (statistics "Excluded rows"). */
function counts(task: HealthTask): boolean {
  return !task.deleted_at && !task.skipped && !task.sample
}

/** The health word for a project's figures (design D2). */
export function healthOf(f: { pending: number; pastDeadline: number; late: number; updated: number | null }, now: number): HealthWord | null {
  if (f.pending === 0) return null
  if (f.pastDeadline > 0) return 'late'
  if (f.late > 0) return 'slipping'
  if (f.updated !== null && now - f.updated >= QUIET_DAYS * DAY_MS) return 'quiet'
  return 'on-track'
}

/**
 * The summary of every live, unarchived project (design D1), its sub-projects included
 * where `rollUp` says so. Projects that are archived or in the Trash get no summary and
 * add nothing to their parent.
 */
export function summarizeProjects(input: HealthInput): Map<string, ProjectSummary> {
  const live = input.projects.filter((p) => !p.deleted_at && !p.archived)
  const ids = new Set(live.map((p) => p.id))
  const children = new Map<string, string[]>()
  for (const p of live) {
    if (!p.parent_id || !ids.has(p.parent_id)) continue
    const list = children.get(p.parent_id) ?? []
    list.push(p.id)
    children.set(p.parent_id, list)
  }
  const byProject = new Map<string, HealthTask[]>()
  for (const task of input.tasks) {
    if (!task.project_id || !ids.has(task.project_id) || !counts(task)) continue
    const list = byProject.get(task.project_id) ?? []
    list.push(task)
    byProject.set(task.project_id, list)
  }
  const own = new Map(live.map((p) => [p.id, ownFigures(p, byProject.get(p.id) ?? [], input)]))
  const out = new Map<string, ProjectSummary>()
  const subtree = (id: string, seen: Set<string>): Figures => {
    const f = { ...own.get(id)! }
    for (const child of children.get(id) ?? []) {
      if (seen.has(child)) continue // a cycle from concurrent moves is shown, never followed (project-organization "Cycle prevention")
      seen.add(child)
      merge(f, subtree(child, seen), input.zone)
    }
    return f
  }
  const rollUp = input.rollUp ?? (() => true)
  for (const p of live) {
    const f = rollUp(p.id) ? subtree(p.id, new Set([p.id])) : own.get(p.id)!
    const total = f.pending + f.done
    const word = healthOf(f, input.now)
    out.set(p.id, {
      open: f.open,
      done: f.done,
      progress: total ? f.done / total : null,
      nextDue: f.nextDue,
      nextDueLate: !!f.nextDue && (localDate(f.nextDue, input.zone) ?? '') < input.today,
      updated: f.updated,
      health: {
        word,
        pastDeadline: f.pastDeadline,
        firstPastDeadline: f.firstPastDeadline?.task ?? null,
        late: f.late,
        quietDays: word === 'quiet' && f.updated !== null ? Math.floor((input.now - f.updated) / DAY_MS) : null,
      },
    })
  }
  return out
}

interface Figures {
  open: number
  /** Every open task, deferred ones included. */
  pending: number
  done: number
  late: number
  pastDeadline: number
  firstPastDeadline: { deadline: string; task: Pick<Task, 'id' | 'title'> } | null
  nextDue: Due | null
  updated: number | null
}

function ownFigures(project: HealthProject, tasks: readonly HealthTask[], input: HealthInput): Figures {
  const f: Figures = { open: 0, pending: 0, done: 0, late: 0, pastDeadline: 0, firstPastDeadline: null, nextDue: null, updated: clockTime(project._clock) || null }
  for (const task of tasks) {
    const changed = clockTime(task._clock)
    if (changed && (f.updated === null || changed > f.updated)) f.updated = changed
    if (task.completed_at !== null) {
      // A completed occurrence record is a past turn of a series, not a task of its own.
      if (!task.series_id) f.done++
      continue
    }
    f.pending++
    if (openCount(task, input.today)) f.open++
    const day = localDate(task.due, input.zone)
    if (day !== null && day < input.today) f.late++
    if (task.due && (!f.nextDue || compareDue(task.due, f.nextDue, input.zone) < 0)) f.nextDue = task.due
    const deadline = task.deadline ?? null
    if (deadline !== null && deadline < input.today) {
      f.pastDeadline++
      if (!f.firstPastDeadline || deadline < f.firstPastDeadline.deadline || (deadline === f.firstPastDeadline.deadline && task.id < f.firstPastDeadline.task.id)) {
        f.firstPastDeadline = { deadline, task: { id: task.id, title: task.title } }
      }
    }
  }
  return f
}

function merge(into: Figures, from: Figures, zone?: string): void {
  into.open += from.open
  into.pending += from.pending
  into.done += from.done
  into.late += from.late
  into.pastDeadline += from.pastDeadline
  const a = into.firstPastDeadline
  const b = from.firstPastDeadline
  if (b && (!a || b.deadline < a.deadline || (b.deadline === a.deadline && b.task.id < a.task.id))) into.firstPastDeadline = b
  if (from.nextDue && (!into.nextDue || compareDue(from.nextDue, into.nextDue, zone) < 0)) into.nextDue = from.nextDue
  if (from.updated !== null && (into.updated === null || from.updated > into.updated)) into.updated = from.updated
}

/** The table's sortable columns (design D4). */
export type ProjectSortKey = 'name' | 'health' | 'progress' | 'open' | 'next-due' | 'updated'

const HEALTH_RANK: Record<HealthWord, number> = { late: 0, slipping: 1, quiet: 2, 'on-track': 3 }

/** The direction a column sorts in on its first click: newest changes first, everything else ascending. */
export function firstDirection(key: ProjectSortKey): 1 | -1 {
  return key === 'updated' ? -1 : 1
}

type Sortable = { name: string; summary?: ProjectSummary }

/**
 * Compares two projects by a column in a direction (1 ascending, -1 descending); a
 * missing value (no health, no task, no due date) sorts last either way, and ties keep
 * the name order. Health ascends from the most urgent, so the first click shows what
 * needs attention.
 */
export function compareProjects(key: ProjectSortKey, dir: 1 | -1, a: Sortable, b: Sortable, zone?: string): number {
  const va = valueOf(key, a)
  const vb = valueOf(key, b)
  const absent = (v: unknown) => v === null || v === undefined
  let c: number
  if (absent(va) || absent(vb)) c = absent(va) === absent(vb) ? 0 : absent(va) ? 1 : -1
  else if (key === 'next-due') c = dir * compareDue(va as Due, vb as Due, zone)
  else if (key === 'name') c = dir * (va as string).localeCompare(vb as string)
  else c = dir * ((va as number) - (vb as number))
  return c || (key === 'name' ? 0 : a.name.localeCompare(b.name))
}

function valueOf(key: ProjectSortKey, row: Sortable): string | number | Due | null {
  const s = row.summary
  switch (key) {
    case 'name': return row.name
    case 'health': return s?.health.word ? HEALTH_RANK[s.health.word] : null
    case 'progress': return s?.progress ?? null
    case 'open': return s?.open ?? 0
    case 'next-due': return s?.nextDue ?? null
    case 'updated': return s?.updated ?? null
  }
}
