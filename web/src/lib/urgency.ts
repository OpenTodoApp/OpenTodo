// The urgency score (OpenSpec change urgency-sort, design D2): one number per open
// task from its due day, deadline, priority, the tasks it blocks, its age, a running
// timer and the blocked, deferred and Someday terms. Derived, never stored; it reads
// no content, so it is the same on an encrypted account. The Go twin is
// internal/urgency; both run urgency.vectors.json.
import { addDaysISO, daysBetweenISO, instantToLocalDue, localDate } from './dates'
import type { Task } from './types'

export type UrgencyKey = 'due' | 'deadline' | 'priority' | 'blocks' | 'age' | 'timer' | 'blocked' | 'deferred' | 'someday'

/** One component: its key, its rounded value and the number its label names (days, tasks or the priority). */
export interface UrgencyPart { key: UrgencyKey; value: number; n: number }

export interface Urgency { score: number; parts: UrgencyPart[] }

/** What a task's score needs besides the task: the viewer's logical today and zone, and the derived facts. */
export interface UrgencyInput {
  today: string
  zone: string
  dayStart: number
  /** Open, live tasks waiting for this one. */
  blocks: number
  /** The task waits for an open, live task (task-dependencies). */
  blocked: boolean
  /** The viewer's running time entry is on this task. */
  timer: boolean
}

export type UrgencyTask = Pick<Task, 'priority' | 'due' | 'created_at' | 'completed_at' | 'deleted_at' | 'deadline' | 'start'>

const PRIORITY = [0, 6, 3.9, 1.8, 0]

/** Two decimals, a half away from zero. */
const round2 = (x: number): number => Math.sign(x) * Math.round(Math.abs(x) * 100) / 100

/** The proximity ramp: 1 a week or more late, 0.2 two weeks or more ahead, linear between. */
export function ramp(d: number): number {
  if (d <= -7) return 1
  if (d >= 14) return 0.2
  return 0.2 + 0.8 * (14 - d) / 21
}

/** The logical day of an instant in `zone` (date-time-preferences "Logical today"): the day before while the wall clock is before the day start. */
export function logicalDayIn(ms: number, zone: string, dayStart: number): string {
  const { date, time } = instantToLocalDue(ms, zone)
  const [h, m] = time.split(':').map(Number)
  return dayStart > 0 && h * 60 + m < dayStart ? addDaysISO(date, -1) : date
}

/** The score of an open task, or null for a completed or deleted one. */
export function urgency(task: UrgencyTask, x: UrgencyInput): Urgency | null {
  if (task.completed_at || task.deleted_at) return null
  const parts: UrgencyPart[] = []
  const add = (key: UrgencyKey, raw: number, n: number) => { const value = round2(raw); if (value && Number.isFinite(value)) parts.push({ key, value, n }) }
  const due = localDate(task.due, x.zone)
  if (due) { const d = daysBetweenISO(x.today, due); add('due', 12 * ramp(d), d) }
  if (task.deadline) { const d = daysBetweenISO(x.today, task.deadline); add('deadline', 8 * ramp(d), d) }
  add('priority', PRIORITY[task.priority] ?? 0, task.priority)
  if (x.blocks > 0) add('blocks', 8, x.blocks)
  const age = Math.max(0, daysBetweenISO(logicalDayIn(task.created_at, x.zone, x.dayStart), x.today))
  add('age', 2 * Math.min(age, 365) / 365, age)
  if (x.timer) add('timer', 4, 0)
  if (x.blocked) add('blocked', -5, 0)
  const start = task.start ?? null
  if (start === 'someday') add('someday', -6, 0)
  else if (start && start > x.today) add('deferred', -3, daysBetweenISO(x.today, start))
  let sum = 0
  for (const p of parts) sum += p.value
  return { score: round2(sum), parts }
}

/** Open, live tasks waiting for each task, by id (a task blocking only closed or deleted ones blocks nothing). */
export function blocksCount(tasks: readonly Pick<Task, 'id' | 'blocked_by' | 'completed_at' | 'deleted_at'>[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of tasks) {
    if (t.completed_at || t.deleted_at || !t.blocked_by?.length) continue
    for (const id of new Set(t.blocked_by)) if (id !== t.id) out.set(id, (out.get(id) ?? 0) + 1)
  }
  return out
}
