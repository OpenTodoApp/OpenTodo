// The data steps of routines (OpenSpec change routines-engine, design D4,
// "Notes and text" and "Lists and logic") as pure functions, the same as
// internal/ruleval/steps_data.go. Both run the "data" vectors of
// steps.vectors.json, so the editor's offline preview and the server agree.
import type { RoutineStepType } from '../types'
import { addDays } from './match'
import { MAX_LIST_ITEMS, MAX_TEXT_BYTES } from './steps'

const enc = new TextEncoder()

/** A text cut to `max` UTF-8 bytes on a character boundary, and whether it was cut. */
export function cutText(s: string, max = MAX_TEXT_BYTES): { text: string; truncated: boolean } {
  if (enc.encode(s).length <= max) return { text: s, truncated: false }
  let bytes = 0
  let out = ''
  for (const ch of s) {
    const n = enc.encode(ch).length
    if (bytes + n > max) break
    bytes += n
    out += ch
  }
  return { text: out, truncated: true }
}

const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])(?:\s+|$)/
const CHECKBOX = /^\[[ xX]\](?:\s+|$)/

/** Non-empty trimmed lines with list markers and checkboxes removed, at most 500. */
export function splitLines(text: string, openCheckboxesOnly = false): { lines: string[]; truncated: boolean } {
  const lines: string[] = []
  for (let line of text.split('\n')) {
    line = line.replace(/\r$/, '').trim()
    line = line.replace(LIST_MARKER, '').trim()
    // Only open checkboxes ("- [ ] book room"), for meeting notes (routines-dynamic-data D5).
    if (openCheckboxesOnly && !line.startsWith('[ ]')) continue
    line = line.replace(CHECKBOX, '').trim()
    if (!line) continue
    if (lines.length === MAX_LIST_ITEMS) return { lines, truncated: true }
    lines.push(line)
  }
  return { lines, truncated: false }
}

export const joinLines = (lines: readonly string[], sep: string): string => lines.join(sep || '\n')

/** Each {id} placeholder vals holds replaced by its text; anything else stays as written. */
export function formatTemplate(template: string, vals: Record<string, string>): string {
  return template.replace(/\{([a-z0-9]{1,8})\}/g, (m, id: string) => (Object.prototype.hasOwnProperty.call(vals, id) ? vals[id] : m))
}

/** Plain-text replace of every occurrence; matchCase false ignores letter case. */
export function replaceText(text: string, find: string, withText: string, matchCase: boolean): string {
  if (!find) return text
  if (matchCase) return text.split(find).join(withText)
  const src = Array.from(text)
  const pat = Array.from(find.toLowerCase())
  let low = Array.from(text.toLowerCase())
  if (low.length !== src.length) low = src.map((c) => Array.from(c.toLowerCase())[0])
  let out = ''
  for (let i = 0; i < src.length;) {
    if (i + pat.length <= src.length && pat.every((c, j) => low[i + j] === c)) {
      out += withText
      i += pat.length
      continue
    }
    out += src[i]
    i++
  }
  return out
}

const containsFold = (s: string, sub: string) => s.toLowerCase().includes(sub.toLowerCase())

export const filterLines = (lines: readonly string[], text: string, not: boolean): string[] => lines.filter((l) => containsFold(l, text) !== not)

/** Code point order, as Go's strings.Compare on UTF-8. */
function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a)
  const y = Array.from(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!
    if (d) return d < 0 ? -1 : 1
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1
}

export function sortLines(lines: readonly string[], desc: boolean): string[] {
  return [...lines].sort((a, b) => (desc ? -1 : 1) * compareCodePoints(a.toLowerCase(), b.toLowerCase()))
}

export interface SortTask {
  id: string
  title?: string
  due?: string
  deadline?: string
  priority?: number
  created_at?: number
}

/** Tasks ordered by due, deadline, priority, created or title; undated last either way, ties kept. */
export function sortTasks(tasks: readonly SortTask[], by: string, desc: boolean): SortTask[] {
  const dir = desc ? -1 : 1
  const date = (a = '', b = '') => (a === b ? 0 : !a ? 1 : !b ? -1 : dir * (a < b ? -1 : 1))
  const num = (a: number, b: number) => dir * (a === b ? 0 : a < b ? -1 : 1)
  return [...tasks].sort((a, b) => {
    switch (by) {
      case 'due': return date(a.due, b.due)
      case 'deadline': return date(a.deadline, b.deadline)
      case 'priority': return num(a.priority || 4, b.priority || 4)
      case 'created': return num(a.created_at ?? 0, b.created_at ?? 0)
      case 'title': return dir * compareCodePoints((a.title ?? '').toLowerCase(), (b.title ?? '').toLowerCase())
    }
    return 0
  })
}

export function take<T>(list: readonly T[], n: number, fromEnd: boolean): T[] {
  if (n >= list.length) return [...list]
  const k = Math.max(0, n)
  return fromEnd ? list.slice(list.length - k) : list.slice(0, k)
}

/** A number in decimal (no exponent for the step ranges, no trailing zeros). */
export const renderNumber = (n: number): string => String(n)

/** A step's output while a routine is planned. */
export interface StepValue {
  type: RoutineStepType
  text?: string
  lines?: string[]
  ids?: string[]
  id?: string
  date?: string
  number?: number
}

export function valueLen(v: StepValue): number {
  switch (v.type) {
    case 'tasks': return v.ids?.length ?? 0
    case 'lines': return v.lines?.length ?? 0
    case 'task':
    case 'project': return v.id ? 1 : 0
    case 'text': return (v.text ?? '').trim() ? 1 : 0
    case 'none': return 0
  }
  return 1
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** An If step's test on a value, as ruleval.Holds. */
export function holds(v: StepValue, is: Record<string, unknown>): boolean {
  const [op, x] = Object.entries(is)[0] ?? ['', undefined]
  if (op === 'empty') return v.type !== 'number' && v.type !== 'date' && valueLen(v) === 0
  if (op === 'not_empty') return v.type === 'number' || v.type === 'date' || valueLen(v) > 0
  if (op === 'contains') {
    if (v.type === 'text') return containsFold(v.text ?? '', String(x))
    if (v.type === 'lines') return (v.lines ?? []).some((l) => containsFold(l, String(x)))
    return false
  }
  const cmp = (a: number | string, b: number | string) => (a === b ? 0 : a < b ? -1 : 1)
  let order: number
  if (v.type === 'number' && typeof x === 'number') order = cmp(v.number ?? 0, x)
  else if ((v.type === 'tasks' || v.type === 'lines') && typeof x === 'number') order = cmp(valueLen(v), x)
  else if (v.type === 'date' && typeof x === 'string' && DATE.test(x)) order = compareCodePoints(v.date ?? '', x)
  else if (v.type === 'text' && typeof x === 'string' && (op === '=' || op === '!=')) order = compareCodePoints(v.text ?? '', x)
  else return false
  switch (op) {
    case '>': return order > 0
    case '>=': return order >= 0
    case '=': return order === 0
    case '!=': return order !== 0
    case '<=': return order <= 0
    case '<': return order < 0
  }
  return false
}

/** A date literal resolved against today. */
export function resolveDate(lit: { date?: string; word?: string; inDays?: number }, today: string): string {
  if (lit.word === 'today') return today
  if (lit.word === 'tomorrow') return addDays(today, 1)
  if (lit.word === 'in_days') return addDays(today, lit.inDays ?? 0)
  return lit.date ?? today
}

/** A period's dates [from, to] given today and the first day of the week (0 Sunday … 6 Saturday). */
export function periodRange(p: string | { from: string; to: string }, today: string, weekStart: number): [string, string] {
  if (typeof p !== 'string') return [p.from, p.to]
  if (p === 'today') return [today, today]
  if (p === 'this_month') return [today.slice(0, 8) + '01', today]
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay()
  let start = addDays(today, -((wd - weekStart + 7) % 7))
  if (p === 'last_week') {
    start = addDays(start, -7)
    return [start, addDays(start, 6)]
  }
  return [start, today]
}

/** Each live project's archived flag, by id: what inFindScope reads. */
export type ProjectScope = ReadonlyMap<string, boolean>

/** The scope map of a project list: live projects only (those in the Trash are left out). */
export function projectScope(projects: readonly { id: string; archived?: boolean; deleted_at?: number | null }[]): ProjectScope {
  return new Map(projects.filter((p) => !p.deleted_at).map((p) => [p.id, !!p.archived]))
}

/**
 * Whether a routine may gather a task (OpenSpec change routines-find-scope, D1), as
 * ruleval.InFindScope: not in the Trash, and no project or a live project that is
 * not archived unless `archived` is asked for. Only the task's own project counts.
 */
export function inFindScope(task: { deleted_at?: number | null; project_id?: string | null }, projects: ProjectScope, archived = false): boolean {
  if (task.deleted_at) return false
  if (!task.project_id) return true
  const isArchived = projects.get(task.project_id)
  return isArchived !== undefined && (archived || !isArchived)
}
