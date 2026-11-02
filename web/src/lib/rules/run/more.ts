// Steps backed by other parts of the app (internal/rules routine_more.go and
// routine_comms.go): quick add for Create tasks, Clear note, Set today's
// focus, the project of a task, Get the date, Create a project from a
// template, Tracked time, and the side effects Notify me, Send a webhook and
// Email me (queued as data; they run only after a commit or on apply).
import { parse as quickAdd } from '../../nlp/parse'
import { planSetFocus } from '../../focusSet'
import { minutesOf, type EntryLike } from '../../time'
import type { RoutineStep, Task, UserPrefs } from '../../types'
import { logicalDate } from '../match'
import { dateLiteral } from '../steps'
import { periodRange, resolveDate } from '../stepData'
import { isNull } from './actions'
import { ids2 } from './kinds'
import { PER_CALL } from './tools'
import { fail, none, str, tasksVal, type ExecResult, type Inputs, type RunState } from './state'
import type { LibraryTask, LibraryTemplate, Row } from './types'

const MAX_NOTIFY_TEXT = 300
const MAX_SUBJECT = 120
const MAX_EMAIL_TEXT = 20000
export const EMAILS_PER_ROUTINE = 10

const runes = (s: string, n: number) => { const r = Array.from(s); return r.length > n ? r.slice(0, n).join('') : s }

/** The account's interface language for library text ("en" by default). */
export function langOf(st: RunState): string {
  const l = str(st.prefs, 'language')
  return !l || l === 'system' ? 'en' : l
}

/** A line with quick-add syntax read into a create_tasks item (routine_more.go quickAddLine). */
export function quickAddLine(st: RunState, line: string, item: Record<string, unknown>): void {
  item.title = line
  const now = new Date(st.w.now + st.w.offset * 60_000).toISOString().slice(11, 16)
  const projects = [...st.projects.values()].map((p) => ({ id: str(p, 'id'), name: str(p, 'name'), parent_id: str(p, 'parent_id') || null, deleted_at: isNull(p.deleted_at) ? null : 1 }))
  const res = quickAdd(line, {
    today: st.w.today, now, languages: [langOf(st)], weekStart: st.w.weekStart, energy: st.w.env?.energy ?? true,
    dayParts: str(st.prefs, 'day_parts') === 'on', projects,
  })
  if (!res.title.trim()) return
  item.title = res.title
  if (res.due) item.due = res.due.time ? { date: res.due.date, time: res.due.time } : { date: res.due.date }
  if (res.projectId) {
    item.project_id = res.projectId
    delete item.section_id
  }
  if (res.priority) item.priority = res.priority
  const labels = Array.isArray(item.labels) ? [...(item.labels as string[])] : []
  for (const name of res.labels) if (st.labelExists(name)) labels.push(name)
  if (labels.length) item.labels = labels
  if (res.deadline) item.deadline = res.deadline
  if (res.start === 'someday') {
    item.start = 'someday'
    delete item.due
  }
  if (res.evening) item.evening = true
  if (res.dayPart) item.day_part = res.dayPart
  if (res.energy) item.energy = res.energy
  if (res.estimateMinutes) item.estimate_minutes = res.estimateMinutes
  if (res.recurrence) item.recurrence = res.recurrence
}

/** Empties a task's or project's note: the Markdown, the document and pending appends. */
export function clearNote(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const of = st.entityIn(s, inputs, 'of')
  const entity = of?.type === 'project' ? 'project' : 'task'
  const row = entity === 'project' ? st.liveProject(of?.id ?? '') : st.liveTask(of?.id ?? '')
  if (!row) throw fail('not_found', `${entity} ${of?.id ?? ''} not found`)
  const patch: Record<string, unknown> = {}
  if (str(row, 'description') || str(row, 'notes_doc')) { patch.description = ''; patch.notes_doc = '' }
  for (const [f, v] of Object.entries(row)) if (f.startsWith('appends.') && v !== '') patch[f] = ''
  if (!Object.keys(patch).length) return [none(), 'skipped']
  st.lay({ entity, entityId: of!.id!, patch })
  return [none(), '']
}

/** Sets today's focus to the tasks by the Daily check's rules (focusSet.ts). */
export function setFocus(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const list = st.entityIn(s, inputs, 'tasks')
  const ids = list?.type === 'task' ? [list.id ?? ''] : list?.ids ?? []
  const tasks = ids.map((id) => st.tasks.get(id)).filter((t): t is Row => !!t) as unknown as Task[]
  const fp = planSetFocus(ids, tasks, st.prefs as Partial<UserPrefs>, st.w.today)
  const patch: Record<string, unknown> = { focus_date: fp.focus_date, focus: fp.focus }
  if (fp.focus_slots !== undefined) patch.focus_slots = fp.focus_slots
  st.lay({ entity: 'review', entityId: 'me', patch })
  const placed = fp.focus ? fp.focus.split(',') : []
  return [tasksVal(placed), placed.length < ids.length ? 'truncated' : '']
}

/** The project of a task; the Inbox (an empty id) for a task without one. */
export function projectOf(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const v = st.entityIn(s, inputs, 'task')
  const t = st.liveTask(v?.id ?? '')
  if (!t) throw fail('not_found', `task ${v?.id ?? ''} not found`)
  return [{ type: 'project', id: str(t, 'project_id') }, '']
}

/** Get the date: today by default. */
export function dateStep(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const v = inputs.get('date')
  if (v) return [v, '']
  let day = st.w.today
  const a = s.in?.date
  if (a && 'literal' in a) { const d = dateLiteral(a.literal); if (d) day = resolveDate(d, st.w.today) }
  return [{ type: 'date', date: day }, '']
}

const PALETTE = ['#059669', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2']
const pick = (l: Record<string, string> | undefined, lang: string) => (l ? (lang in l ? l[lang] : l.en ?? '') : '')

/** templatelib.ResolveOffset: +0d, +1w, +1m (the same day next month, or its last day). */
export function resolveOffset(offset: string, start: string): string | null {
  const m = /^\+(\d+)([dwm])$/.exec(offset)
  const d = new Date(`${start}T00:00:00Z`)
  if (!m || Number.isNaN(d.getTime())) return null
  const n = Number(m[1])
  if (m[2] === 'd' || m[2] === 'w') {
    d.setUTCDate(d.getUTCDate() + (m[2] === 'w' ? 7 * n : n))
    return d.toISOString().slice(0, 10)
  }
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d.getUTCDate(), last))).toISOString().slice(0, 10)
}

interface Pending { task: LibraryTask; section: string; parent: string; path: string }

/** Starts a library template on a start day: missing labels, projects, sections and tasks. */
export function projectFromTemplate(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  const slug = st.litStr(s, 'template') ?? ''
  const tpl = (st.w.templates ?? []).find((x) => x.slug === slug)
  if (!tpl) throw fail('not_found', `no template "${slug}" in the library`)
  let start = st.w.today
  const sv = inputs.get('start')
  if (sv?.date) start = sv.date
  else if (s.in?.start && 'literal' in s.in.start) { const d = dateLiteral(s.in.start.literal); if (d) start = resolveDate(d, st.w.today) }
  const lang = langOf(st)
  const seed = st.clientId(at)
  const id = (...parts: string[]) => ids2('routine-template', seed, ...parts)
  ;(tpl.labels ?? []).forEach((l, i) => {
    const name = pick(l.name, lang)
    if (st.labelExists(name)) return
    const args: Record<string, unknown> = { name, client_request_id: `${seed}:l${i}` }
    if (l.color) args.color = l.color
    st.tool('create_label', args)
  })
  let first = ''
  ;(tpl.projects ?? []).forEach((p, i) => {
    let name = pick(p.name, lang)
    if (i === 0) { const v = st.textIn(s, inputs, 'name'); if (v !== null && v.trim()) name = v }
    const args: Record<string, unknown> = { name, id: id('p', String(i)), color: p.color || PALETTE[i % PALETTE.length] }
    if (p.icon) args.icon = p.icon
    else if (i === 0 && tpl.icon) args.icon = tpl.icon
    const pid = st.tool('create_project', args).filter((c) => c.entity === 'project' && c.create)[0].entityId
    if (!first) first = pid
    const sections = (p.sections ?? []).map((sec, j) => ({ name: pick(sec.name, lang), id: id('s', String(i), String(j)) }))
    if (sections.length) st.tool('create_sections', { project_id: pid, items: sections })
    let next: Pending[] = (p.tasks ?? []).map((tk, j) => ({ task: tk, section: '', parent: '', path: `t${i}.${j}` }))
    ;(p.sections ?? []).forEach((sec, j) => (sec.tasks ?? []).forEach((tk, k) => next.push({ task: tk, section: sections[j].id, parent: '', path: `t${i}.${j}.${k}` })))
    while (next.length) {
      const [level, more] = templateLevel(tpl, next, pid, start, lang, id)
      next = more
      for (let c = 0; c < level.length; c += PER_CALL) st.tool('create_tasks', { items: level.slice(c, c + PER_CALL) })
    }
  })
  if (!first) throw fail('invalid_argument', `the template "${slug}" holds no project`)
  return [{ type: 'project', id: first }, '']
}

function templateLevel(tpl: LibraryTemplate, list: Pending[], pid: string, start: string, lang: string, id: (...p: string[]) => string): [Record<string, unknown>[], Pending[]] {
  const items: Record<string, unknown>[] = []
  const next: Pending[] = []
  for (const pt of list) {
    const tk = pt.task
    const tid = id(pt.path)
    const item: Record<string, unknown> = { id: tid, title: pick(tk.title, lang), project_id: pid }
    const d = pick(tk.description, lang)
    if (d) item.description = d
    if (tk.priority && tk.priority > 0) item.priority = tk.priority
    if (tk.due) {
      const date = resolveOffset(tk.due, start)
      if (date) item.due = tk.time ? { date, time: tk.time } : { date }
    }
    const labels = (tk.labels ?? []).filter((i) => i >= 0 && i < (tpl.labels ?? []).length).map((i) => pick(tpl.labels![i].name, lang))
    if (labels.length) item.labels = labels
    if (tk.estimate && tk.estimate > 0) item.estimate_minutes = tk.estimate
    if (tk.recurrence) item.recurrence = tk.recurrence
    if (pt.section) item.section_id = pt.section
    if (pt.parent) item.parent_id = pt.parent
    items.push(item)
    ;(tk.subtasks ?? []).forEach((sub, k) => next.push({ task: sub, section: pt.section, parent: tid, path: `${pt.path}.${k}` }))
  }
  return [items, next]
}

function inProject(st: RunState, id: string, pid: string): boolean {
  for (let i = 0; id && i < 64; i++) {
    if (id === pid) return true
    id = st.parent.get(id) ?? ''
  }
  return false
}

export function trackedTime(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const p = st.lit(s, 'period') as string | { from: string; to: string }
  if (!p) throw fail('invalid_argument', 'period must be a word or {from, to}')
  const [from, to] = periodRange(p, st.w.today, st.w.weekStart)
  const project = st.entityIn(s, inputs, 'project')?.id ?? ''
  let minutes = 0
  for (const e of st.w.timeEntries as unknown as (EntryLike & Row)[]) {
    if (!isNull(e.deleted_at) || e.user_id !== st.w.userId) continue
    const day = logicalDate(e.started_at, st.w.offset, st.w.dayStart)
    if (day < from || day > to) continue
    if (project && !inProject(st, str(st.tasks.get(e.task_id), 'project_id'), project)) continue
    minutes += minutesOf(e, st.w.now)
  }
  return [{ type: 'number', number: minutes }, '']
}

export function notifyStep(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const text = runes(st.textIn(s, inputs, 'text') ?? '', MAX_NOTIFY_TEXT)
  const task = st.entityIn(s, inputs, 'task')?.id ?? ''
  const notice = { ruleId: st.r.id, ruleName: st.r.name, runId: st.runId, stepId: s.id, text, ...(task ? { taskId: task } : {}), at: st.w.now }
  st.sides.push({ kind: 'notify', notice })
  return [none(), '']
}

/** A Change tasks step's notify action: the rule_fired notice. */
export function ruleFiredNotice(st: RunState, taskId: string) {
  const title = str(st.tasks.get(taskId), 'title')
  return { kind: 'fired' as const, fired: { ruleId: st.r.id, ruleName: st.r.name, ...(taskId ? { taskId } : {}), ...(title ? { taskTitle: title } : {}), at: st.w.now } }
}

export function webhookStep(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const hook = st.litStr(s, 'webhook_id') ?? ''
  const text = st.textIn(s, inputs, 'text')
  const tasks = inputs.get('tasks')
  const ids = tasks ? (tasks.type === 'tasks' ? tasks.ids ?? [] : tasks.id ? [tasks.id] : []) : []
  st.sides.push({ kind: 'webhook', hook, delivery: { RuleID: st.r.id, RuleName: st.r.name, RunID: st.runId, StepID: s.id, Text: text, TaskIDs: [...ids] } })
  return [none(), '']
}

export function emailStep(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const subject = runes(st.textIn(s, inputs, 'subject') ?? '', MAX_SUBJECT)
  const text = runes(st.textIn(s, inputs, 'text') ?? '', MAX_EMAIL_TEXT)
  st.emails++
  if (st.emails > EMAILS_PER_ROUTINE) throw fail('rate_limited', 'at most 10 emails per routine and 20 per account a day')
  const day = new Date(st.w.now).toISOString().slice(0, 10)
  st.sides.push({ kind: 'email', mail: { RuleID: st.r.id, RuleName: st.r.name, RunID: st.runId, Subject: subject, Text: text }, day })
  return [none(), '']
}
