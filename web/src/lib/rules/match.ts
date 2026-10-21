// The condition matcher of automation rules (OpenSpec change automation-rules,
// design D3): predicates over ids and plaintext scheduling fields, evaluated the
// same way as internal/ruleval/match.go on the server. Both run
// web/src/lib/rules/match.vectors.json, so the editor's live count and the
// engine never disagree. Pure: no reads, no writes.
import type { RuleCondition } from '../types'

/** The part of a task a condition reads. */
export interface MatchTask {
  id: string
  project_id: string | null
  section_id: string | null
  labels: readonly string[]
  priority: number
  /** The due's date in the user's zone, or null. */
  dueDate: string | null
  deadline: string | null
  start: string | null
  evening: boolean
  blocked_by: readonly string[]
  assignee_id: string | null
  /** The stored origin: null, an object with a kind, or a ciphertext string. */
  origin: unknown
  habit: boolean
  estimate_minutes: number | null
}

export interface MatchContext {
  userId: string
  /** The user's logical today (zone and day start applied, see logicalDate). */
  today: string
  /** A live project's parent id (null at the top). */
  parent: (projectId: string) => string | null | undefined
  /** Whether a task id is a live, open task (for `blocked`). */
  open: (taskId: string) => boolean
  /** Minutes tracked on a task (every member's live entries). */
  tracked: (taskId: string) => number
}

function dayStartMinutes(s: string): number {
  const m = /^(\d\d):(\d\d)$/.exec(s)
  if (!m) return 0
  const v = Number(m[1]) * 60 + Number(m[2])
  return Number(m[2]) > 59 || v > 360 ? 0 : v
}

/**
 * The user's calendar date at `nowMs` in a fixed offset (minutes east of UTC),
 * a day starting at `dayStart` ("HH:MM" up to 06:00, else midnight): the
 * day-boundary rule, as internal/ruleval.LogicalDate computes it.
 */
export function logicalDate(nowMs: number, offsetMinutes: number, dayStart: string): string {
  const d = new Date(nowMs + (offsetMinutes - dayStartMinutes(dayStart)) * 60_000)
  return d.toISOString().slice(0, 10)
}

/** A YYYY-MM-DD date plus n days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The kind of a stored origin: '' without one, '?' for a ciphertext (matches nothing but not "none"). */
export function originKindOf(origin: unknown): string {
  if (origin === null || origin === undefined) return ''
  if (typeof origin === 'object' && typeof (origin as { kind?: unknown }).kind === 'string' && (origin as { kind: string }).kind) return (origin as { kind: string }).kind
  return '?'
}

function matchDate(p: RuleCondition['due'], date: string | null, today: string): boolean {
  if (p === 'none') return !date
  if (!date) return false
  if (p === 'set') return true
  if (p === 'today') return date === today
  if (p === 'overdue') return date < today
  if (p && typeof p === 'object') return date >= today && date <= addDays(today, p.within_days)
  return false
}

function matchProject(p: NonNullable<RuleCondition['project']>, t: MatchTask, ctx: MatchContext): boolean {
  if (p === 'none') return !t.project_id
  if (!t.project_id) return false
  if (p.in.includes(t.project_id)) return true
  if (!p.descendants) return false
  let cur: string = t.project_id
  for (let i = 0; i < 64; i++) {
    const parent = ctx.parent(cur)
    if (!parent) return false
    if (p.in.includes(parent)) return true
    cur = parent
  }
  return false
}

function matchMinutes(p: NonNullable<RuleCondition['estimate']>, v: number | null): boolean {
  if (p === 'none') return !v
  if (v === null || v === undefined) return false
  if ('min_minutes' in p && v < p.min_minutes) return false
  if ('max_minutes' in p && v > p.max_minutes) return false
  return true
}

/** Whether `t` satisfies every predicate of `c` (no condition matches every task). */
export function matchesCondition(c: RuleCondition | null | undefined, t: MatchTask, ctx: MatchContext): boolean {
  if (!c) return true
  if (c.project !== undefined && !matchProject(c.project, t, ctx)) return false
  if (c.section !== undefined) {
    if (c.section === 'none' ? !!t.section_id : !t.section_id || !c.section.in.includes(t.section_id)) return false
  }
  if (c.labels) {
    const has = (id: string) => t.labels.includes(id)
    if (c.labels.any?.length && !c.labels.any.some(has)) return false
    if (c.labels.all && !c.labels.all.every(has)) return false
    if (c.labels.none && c.labels.none.some(has)) return false
  }
  if (c.priority && !c.priority.in.includes(t.priority)) return false
  if (c.due !== undefined && !matchDate(c.due, t.dueDate, ctx.today)) return false
  if (c.deadline !== undefined && !matchDate(c.deadline, t.deadline, ctx.today)) return false
  if (c.start !== undefined) {
    const s = t.start
    const ok = c.start === 'someday' ? s === 'someday' : c.start === 'none' ? !s : !!s && s !== 'someday' && s > ctx.today
    if (!ok) return false
  }
  if (c.evening !== undefined && c.evening !== t.evening) return false
  if (c.blocked !== undefined && c.blocked !== t.blocked_by.some((id) => ctx.open(id))) return false
  if (c.assignee !== undefined) {
    const a = t.assignee_id
    const ok = c.assignee === 'me' ? !!a && a === ctx.userId : c.assignee === 'none' ? !a : !!a
    if (!ok) return false
  }
  if (c.origin !== undefined) {
    const kind = originKindOf(t.origin)
    if (c.origin === 'none' ? kind !== '' : kind !== c.origin.kind) return false
  }
  if (c.habit !== undefined && c.habit !== t.habit) return false
  if (c.estimate !== undefined && !matchMinutes(c.estimate, t.estimate_minutes)) return false
  if (c.tracked !== undefined) {
    const m = ctx.tracked(t.id)
    if (c.tracked === 'none' ? m !== 0 : m < c.tracked.min_minutes) return false
  }
  return true
}
