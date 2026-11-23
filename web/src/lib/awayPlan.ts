// The skips of an away period (OpenSpec change away-periods, design D1, D2):
// pure planning over local rows, loaded with the Away dialog. Each covered
// series with a calendar rule has every occurrence dated in the period, from its
// current one on, skipped as "Skip this occurrence" skips it (planActOn: the
// current one moves the series, a later one gets a skipped record with its
// derived id). A completion-relative series due in the period moves to the day
// after it, and a habit also gets the skipped record of that date. The
// server's port is internal/sync/away_plan.go.
import { addDaysISO } from './dates'
import { occurrenceId } from './ids'
import type { Change } from './ops'
import { currentOccurrence, isOccurrenceRecord, moveDates, occurrenceFields, recordsOf, seriesRule } from './recurring'
import { isActionable, planActOn } from './seriesPlan'
import type { Task } from './types'

/** What an away period covers (D2): every series, or those in the projects or with the labels chosen. */
export type AwayScope = { all: true } | { all: false; projects: readonly string[]; labels: readonly string[] }

/** Whether `task` is an open series an away period may cover. */
export function isOpenSeries(task: Task): boolean {
  return !task.deleted_at && !task.completed_at && !isOccurrenceRecord(task) && !!seriesRule(task)
}

/** Whose work a period may move: the person's own id and which projects are shared. */
export interface AwayWhose {
  me: string | null
  shared: (projectId: string) => boolean
}

/**
 * Whether the scope covers the series. A person's time away never moves a
 * teammate's work: a series assigned to someone else is never covered, and one in
 * a shared project only when that project is chosen. The server's is AwayScope.covers.
 */
export function covers(scope: AwayScope, task: Task, whose: AwayWhose = { me: null, shared: () => false }): boolean {
  if (task.assignee_id && task.assignee_id !== whose.me) return false
  if (task.project_id && whose.shared(task.project_id)) return !scope.all && scope.projects.includes(task.project_id)
  if (scope.all) return true
  return (!!task.project_id && scope.projects.includes(task.project_id)) || task.labels.some((l) => scope.labels.includes(l))
}

export interface SeriesSkips {
  changes: Change[]
  /** How many occurrences are skipped. */
  skipped: number
  /** The series' due date once the skips are written (the preview's details, #1901). */
  next?: string | null
}

/** Folds a change into `rows` (the working copy the next step plans from). */
function fold(rows: Map<string, Task>, c: Change): void {
  if (c.entity !== 'task') return
  const prev = rows.get(c.entityId)
  rows.set(c.entityId, { ...(prev ?? ({} as Task)), ...(c.patch as Partial<Task>), id: c.entityId })
}

/** One change per entity, later fields winning, in first-seen order. */
function merged(changes: readonly Change[]): Change[] {
  const out = new Map<string, Change>()
  for (const c of changes) {
    const key = `${c.entity}:${c.entityId}`
    const prev = out.get(key)
    out.set(key, prev ? { ...prev, patch: { ...prev.patch, ...c.patch } } : { ...c, patch: { ...c.patch } })
  }
  return [...out.values()]
}

/**
 * The skips for one series over `from`..`to` (inclusive). `rows` are the series'
 * lineage rows (lineageRows). Applying the result twice writes nothing new: a date
 * that already has a record is left as it is.
 */
export function planSeriesAway(series: Task, from: string, to: string, rows: readonly Task[], now: number, today: string): SeriesSkips {
  const rule = seriesRule(series)
  if (!rule) return { changes: [], skipped: 0 }
  const work = new Map(rows.map((r) => [r.id, r]))
  work.set(series.id, series)
  const changes: Change[] = []
  if (rule.afterCompletion) {
    const due = series.due?.date
    if (!due || due < from || due > to) return { changes: [], skipped: 0 }
    const after = addDaysISO(to, 1)
    changes.push({ entity: 'task', entityId: series.id, patch: moveDates(series, after, today) })
    const recordId = occurrenceId(series.id, due)
    if (series.habit && !work.has(recordId)) {
      changes.unshift({ entity: 'task', entityId: recordId, patch: { ...occurrenceFields(series, due, now, today), completed_at: now, skipped: true } })
    }
    return { changes, skipped: 1, next: after }
  }
  let skipped = 0
  // `on`: the day the plan reads as today. A later date before today is planned from
  // the current occurrence, since projections start at today (after the fact, D1).
  const skip = (date: string, on = today): boolean => {
    const plan = planActOn(work.get(series.id) as Task, date, { kind: 'skip' }, [...work.values()], now, on)
    if (!plan || plan.changes.length === 0) return false
    for (const c of plan.changes) fold(work, c)
    changes.push(...plan.changes)
    skipped++
    return true
  }
  // The later dates first, as records, so that skipping the current one (which,
  // when overdue, moves the series from today on) jumps over them all.
  for (let round = 0; round < 3; round++) {
    const cur = work.get(series.id) as Task
    const list = [...work.values()]
    const current = currentOccurrence(cur, rule, list, today)
    if (current === null || current > to) break
    const own = new Set(recordsOf(series.id, list).map((r) => r.date))
    const on = current < today ? current : today
    const later: string[] = []
    for (let d = current < from ? from : addDaysISO(current, 1); d <= to; d = addDaysISO(d, 1)) {
      if (d > current && !own.has(d) && isActionable(cur, rule, d, list, on)) later.push(d)
    }
    for (const d of later) skip(d, on)
    if (current < from || own.has(current) || !skip(current, on)) break
  }
  return { changes: merged(changes), skipped, next: (work.get(series.id) as Task).due?.date ?? null }
}

export interface AwayPlan {
  changes: Change[]
  /** Occurrences skipped, and of how many series (the preview, D2). */
  occurrences: number
  series: number
  /** Each series with skips, in title order: what the preview's details list (#1901). */
  rows: AwaySeriesRow[]
}

export interface AwaySeriesRow {
  id: string
  title: string
  skipped: number
  /** Its due date once the skips are written. */
  next: string | null
}

/**
 * The skips of the period over every covered series. `rowsOf` gives a series'
 * lineage rows; `canEdit` excludes a series the user may not edit (a viewer);
 * `whose` keeps other people's work out (covers).
 */
export function planAway(
  tasks: readonly Task[], scope: AwayScope, from: string, to: string, rowsOf: (seriesId: string) => readonly Task[],
  canEdit: (task: Task) => boolean, now: number, today: string, whose?: AwayWhose,
): AwayPlan {
  const changes: Change[] = []
  let occurrences = 0
  let series = 0
  const rows: AwaySeriesRow[] = []
  for (const task of tasks) {
    if (!isOpenSeries(task) || !covers(scope, task, whose) || !canEdit(task)) continue
    const s = planSeriesAway(task, from, to, rowsOf(task.id), now, today)
    if (s.skipped === 0) continue
    changes.push(...s.changes)
    occurrences += s.skipped
    series++
    rows.push({ id: task.id, title: task.title, skipped: s.skipped, next: s.next ?? null })
  }
  rows.sort((a, b) => a.title.localeCompare(b.title))
  return { changes, occurrences, series, rows }
}
