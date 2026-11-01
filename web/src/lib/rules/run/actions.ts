// A rule's actions planned on one task row: the port of internal/rules/plan.go
// Plan (labels removed then added, priority, due, start, deadline, assignee,
// state, project and section; changes the task already has left out), pinned
// by plan.fixture.json. Change tasks steps read their `set` through it.
import { addDays } from '../match'
import type { Row } from './types'

export interface DueAction { word: string; inDays: number }

export interface Actions {
  add_labels?: string[]
  remove_labels?: string[]
  priority?: number
  due?: DueAction
  start?: string
  deadline?: DueAction
  assignee?: string
  state?: string
  section?: { project_id: string; section_id: string | null }
  comment?: string
  notify?: boolean
  webhook?: string
}

export interface StepActions {
  actions: Actions
  hasActions: boolean
  energy?: string
  trash: boolean
}

export interface PlanContext {
  today: string
  nowMs: number
  userId: string
  weekStart: number
  labelLive?: (id: string) => boolean
  sectionProject?: (id: string) => string
  projectShared?: (id: string) => boolean
  projectLive?: (id: string) => boolean
}

export interface Planned {
  patch: Record<string, unknown>
  skipped: string[]
  completing: boolean
}

function dueAction(v: unknown): DueAction | undefined {
  if (typeof v === 'string') return { word: v, inDays: 0 }
  if (v && typeof v === 'object' && typeof (v as { in_days?: unknown }).in_days === 'number') return { word: 'in_days', inDays: (v as { in_days: number }).in_days }
  return undefined
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** An actions value as ruleval.ParseActions reads it (the server checked its shape at save). */
export function parseActions(v: unknown): Actions {
  const m = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const a: Actions = {}
  if ('add_labels' in m) a.add_labels = strList(m.add_labels)
  if ('remove_labels' in m) a.remove_labels = strList(m.remove_labels)
  if (typeof m.priority === 'number') a.priority = m.priority
  if ('due' in m) a.due = dueAction(m.due)
  if ('deadline' in m) a.deadline = dueAction(m.deadline)
  if (typeof m.start === 'string') a.start = m.start
  if (typeof m.state === 'string') a.state = m.state
  if (typeof m.assignee === 'string') a.assignee = m.assignee
  const sec = m.section as { project_id?: unknown; section_id?: unknown } | undefined
  if (sec && typeof sec === 'object' && typeof sec.project_id === 'string') a.section = { project_id: sec.project_id, section_id: typeof sec.section_id === 'string' ? sec.section_id : null }
  const c = m.comment as { text?: unknown } | undefined
  if (c && typeof c === 'object' && typeof c.text === 'string') a.comment = c.text
  if (m.notify === true) a.notify = true
  const w = m.webhook as { webhook_id?: unknown } | undefined
  if (w && typeof w === 'object' && typeof w.webhook_id === 'string') a.webhook = w.webhook_id
  return a
}

/** A Change tasks step's `set` (ruleval.ParseStepActions): energy and trash, and the rule actions. */
export function parseStepActions(v: unknown): StepActions {
  const m = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out: StepActions = { actions: {}, hasActions: false, trash: m.trash === true }
  if (typeof m.energy === 'string') out.energy = m.energy
  const rest = Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'energy' && k !== 'trash'))
  if (Object.keys(rest).length) {
    out.actions = parseActions(rest)
    out.hasActions = true
  }
  return out
}

export const isNull = (v: unknown): boolean => v === null || v === undefined
const strOf = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Two values as JSON, key order ignored. */
export function sameJSON(a: unknown, b: unknown): boolean {
  if (isNull(a) && isNull(b)) return true
  return canonical(a) === canonical(b)
}

function canonical(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  const o = v as Record<string, unknown>
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'
}

function weekStartOf(date: string, start: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  const back = (d.getUTCDay() - start + 7) % 7
  return addDays(date, -back)
}

function dateOf(a: DueAction, ctx: PlanContext): string {
  switch (a.word) {
    case 'today': return ctx.today
    case 'tomorrow': return addDays(ctx.today, 1)
    case 'next-week': return weekStartOf(addDays(ctx.today, 7), ctx.weekStart)
  }
  return addDays(ctx.today, a.inDays)
}

interface DueValue { date: string; time?: string | null; tz?: string | null }

function dueOf(v: unknown): DueValue | null {
  if (!v || typeof v !== 'object') return null
  const d = v as DueValue
  return typeof d.date === 'string' && d.date ? d : null
}

/** Plans a rule's actions on one task row (internal/rules Plan). */
export function planActions(a: Actions, task: Row, ctx: PlanContext): Planned {
  const cur: Row = { ...task }
  const patch: Record<string, unknown> = {}
  const set = (f: string, v: unknown) => { patch[f] = v; cur[f] = v }
  const out: Planned = { patch: {}, skipped: [], completing: false }
  planLabels(a, cur, ctx, set)
  if (a.priority !== undefined) set('priority', a.priority)
  planDue(a, cur, ctx, set)
  if (a.start !== undefined) {
    if (a.start === 'someday') {
      if (strOf(cur.start) !== 'someday' || !isNull(cur.due) || cur.evening === true) {
        set('start', 'someday')
        set('due', null)
        set('evening', false)
      }
    } else if (!isNull(cur.start)) set('start', null)
  }
  if (a.deadline) set('deadline', a.deadline.word === 'clear' ? null : dateOf(a.deadline, ctx))
  if (a.assignee !== undefined) set('assignee_id', a.assignee === 'me' ? ctx.userId : null)
  if (a.state !== undefined) {
    if (a.state === 'complete' && isNull(cur.completed_at)) {
      set('completed_at', ctx.nowMs)
      out.completing = true
    } else if (a.state === 'reopen' && !isNull(cur.completed_at)) set('completed_at', null)
  }
  if (a.section) out.skipped.push(...planSection(a.section, cur, ctx, set))
  for (const [f, v] of Object.entries(patch)) if (!sameJSON(v, task[f])) out.patch[f] = v
  if (!('completed_at' in out.patch)) out.completing = false
  return out
}

function planLabels(a: Actions, cur: Row, ctx: PlanContext, set: (f: string, v: unknown) => void): void {
  if (!a.add_labels?.length && !a.remove_labels?.length) return
  let labels = strList(cur.labels)
  let changed = false
  for (const id of a.remove_labels ?? []) {
    if (ctx.labelLive && !ctx.labelLive(id)) continue
    const i = labels.indexOf(id)
    if (i >= 0) {
      labels = [...labels.slice(0, i), ...labels.slice(i + 1)]
      changed = true
    }
  }
  for (const id of a.add_labels ?? []) {
    if (ctx.labelLive && !ctx.labelLive(id)) continue
    if (!labels.includes(id)) {
      labels = [...labels, id]
      changed = true
    }
  }
  if (changed) set('labels', labels)
}

function planDue(a: Actions, cur: Row, ctx: PlanContext, set: (f: string, v: unknown) => void): void {
  if (!a.due) return
  if (a.due.word === 'clear') {
    if (!isNull(cur.due)) {
      set('due', null)
      if (!isNull(cur.recurrence)) set('recurrence', null)
    }
    return
  }
  const d: DueValue = { date: dateOf(a.due, ctx) }
  const old = dueOf(cur.due)
  if (old && old.time) {
    d.time = old.time
    if (old.tz) d.tz = old.tz
  }
  set('due', d)
  if (strOf(cur.start) === 'someday') set('start', null)
}

function planSection(s: NonNullable<Actions['section']>, cur: Row, ctx: PlanContext, set: (f: string, v: unknown) => void): string[] {
  if (ctx.projectLive && !ctx.projectLive(s.project_id)) return ['project gone']
  const project = strOf(cur.project_id)
  if (s.project_id !== project) {
    if (ctx.projectShared && (ctx.projectShared(s.project_id) || (project !== '' && ctx.projectShared(project)))) return ['shared project']
    set('project_id', s.project_id)
  }
  let section: string | null = null
  if (s.section_id !== null && (!ctx.sectionProject || ctx.sectionProject(s.section_id) === s.project_id)) section = s.section_id
  set('section_id', section)
  return []
}
