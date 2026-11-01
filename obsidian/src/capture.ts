// Reading note lines into tasks (obsidian-plugin D6): a checkbox line speaks the
// Obsidian Tasks grammar of the vault (src/vault/line.ts), any other line the
// quick-add grammar of the app (web/src/lib/nlp). The result is a draft the
// confirmation sheet shows and the op builder turns into a task.
import { parse } from '../../web/src/lib/nlp/parse'
import type { ProjectRef } from '../../web/src/lib/nlp/attributes'
import type { Span } from '../../web/src/lib/nlp/tokenize'
import type { Due, Priority } from '../../web/src/lib/types'
import { tr } from './strings'
import { lineFields, parseTaskLine } from './vault/line'

/** The most lines one command sends (spec "Send a line or a selection to OpenTodo"). */
export const MAX_LINES = 50

export interface Fields {
  due?: Due
  priority?: Priority
  /** Label names as written; the op builder resolves them to ids. */
  labels: string[]
  /** A project named in the line (quick add `#project`). */
  projectId?: string
  start?: string
  deadline?: string
  estimate?: number
  spent?: number
  evening?: boolean
  dayPart?: 'morning' | 'afternoon'
  energy?: 'deep' | 'medium' | 'low'
  recurrence?: string
}

export interface Chip {
  id: string
  text: string
}

export interface Draft {
  /** Line number in the note. */
  index: number
  /** The line as it was before sending. */
  line: string
  title: string
  grammar: 'tasks' | 'quickadd'
  fields: Fields
  /** Values a Tasks line holds that did not parse, as the vault reports them. */
  problems: string[]
  include: boolean
  /** Quick add: the text read and the spans the user took out of it (chips removed). */
  source?: string
  dismissed?: Span[]
}

export type Read =
  | { kind: 'draft'; draft: Draft }
  | { kind: 'sent'; index: number; url: string | null }
  | { kind: 'empty'; index: number }

export interface ReadContext {
  today: string
  now: string
  language: string
  projects: readonly ProjectRef[]
  dayParts?: boolean
  energy?: boolean
}

/** The `[opentodo:: <link>]` field the plugin writes after sending (D8). */
export const LINK_FIELD = /\[opentodo::[ \t]*([^\]\s]*)[ \t]*\]/
const ID_MARK = /🆔️?\s*[A-Za-z0-9_-]+/

/** `* [ ]` reads like `- [ ]`; the vault grammar itself only writes dashes. */
const STAR_TASK = /^([ \t]*)\* \[([ xX])\]/
/** A list marker before a plain line: `- `, `* `, `+ `, `1. `, `1) `. */
const BULLET = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/

export function readLine(index: number, line: string, ctx: ReadContext): Read {
  const link = LINK_FIELD.exec(line)
  if (link) return { kind: 'sent', index, url: link[1] || null }
  if (ID_MARK.test(line)) return { kind: 'sent', index, url: null }
  const task = parseTaskLine(line.replace(STAR_TASK, '$1- [$2]'))
  if (task) {
    if (!task.title.trim()) return { kind: 'empty', index }
    const { fields: f, problems } = lineFields(task)
    const fields: Fields = { labels: [...task.tags] }
    if (f.due) {
      const [date, time, tz] = f.due.split('|')
      fields.due = { date, ...(time ? { time } : {}), ...(tz ? { tz } : {}) }
    }
    if (f.priority && f.priority !== '4') fields.priority = Number(f.priority) as Priority
    if (f.start) fields.start = f.start
    if (f.deadline) fields.deadline = f.deadline
    if (f.estimate) fields.estimate = Number(f.estimate)
    if (f.evening === 'true') fields.evening = true
    else if (f.daypart === 'morning' || f.daypart === 'afternoon') fields.dayPart = f.daypart
    if (f.energy === 'deep' || f.energy === 'medium' || f.energy === 'low') fields.energy = f.energy
    return { kind: 'draft', draft: { index, line, title: task.title, grammar: 'tasks', fields, problems, include: true } }
  }
  const text = line.replace(BULLET, '').trim()
  if (!text) return { kind: 'empty', index }
  return { kind: 'draft', draft: readQuickAdd(index, line, text, ctx, []) }
}

function quickAdd(text: string, ctx: ReadContext, dismissed: readonly Span[]) {
  return parse(text, { today: ctx.today, now: ctx.now, languages: [ctx.language], projects: ctx.projects, dayParts: ctx.dayParts, energy: ctx.energy, dismissed })
}

function readQuickAdd(index: number, line: string, text: string, ctx: ReadContext, dismissed: Span[]): Draft {
  const r = quickAdd(text, ctx, dismissed)
  const fields: Fields = { labels: [...r.labels] }
  if (r.due) fields.due = r.due
  if (r.priority && r.priority !== 4) fields.priority = r.priority
  if (r.projectId) fields.projectId = r.projectId
  if (r.start) fields.start = r.start
  if (r.deadline) fields.deadline = r.deadline
  if (r.estimateMinutes) fields.estimate = r.estimateMinutes
  if (r.spentMinutes) fields.spent = r.spentMinutes
  if (r.evening) fields.evening = true
  else if (r.dayPart) fields.dayPart = r.dayPart
  if (r.energy) fields.energy = r.energy
  if (r.recurrence) fields.recurrence = r.recurrence
  return { index, line, title: r.title.trim() || text, grammar: 'quickadd', fields, problems: [], include: true, source: text, dismissed }
}

/** The quick-add chip kinds behind each of the sheet's chips. */
const CHIP_KINDS: Record<string, string[]> = {
  due: ['due', 'reminder'], start: ['someday'], deadline: ['deadline'], priority: ['priority'], projectId: ['project'], estimate: ['estimate'],
  spent: ['spent'], evening: ['evening'], dayPart: ['daypart'], energy: ['energy'], recurrence: ['recurrence'],
}

/**
 * The draft without one chip. A quick-add line is read again with the chip's
 * words dismissed, so they go back into the title, as in the app's quick add;
 * a Tasks line just loses the field.
 */
export function removeChip(d: Draft, id: string, ctx: ReadContext): Draft {
  if (d.grammar === 'tasks' || d.source === undefined) return { ...d, fields: withoutChip(d.fields, id) }
  const r = quickAdd(d.source, ctx, d.dismissed ?? [])
  const label = id.startsWith('label:') ? id.slice('label:'.length) : null
  const spans = r.chips.filter((c) => (label !== null ? c.kind === 'label' && c.value === label : CHIP_KINDS[id]?.includes(c.kind))).flatMap((c) => c.spans)
  if (spans.length === 0) return { ...d, fields: withoutChip(d.fields, id) }
  const next = readQuickAdd(d.index, d.line, d.source, ctx, [...(d.dismissed ?? []), ...spans])
  return { ...next, include: d.include }
}

/** The lines a command reads: the cursor's line, or each non-empty line of the selection. */
export function selectedLines(lines: readonly string[], from: number, to: number): { index: number; line: string }[] {
  const out: { index: number; line: string }[] = []
  for (let i = from; i <= to && i < lines.length; i++) if (lines[i].trim()) out.push({ index: i, line: lines[i] })
  return out
}

const minutes = (n: number) => (n % 60 === 0 ? `${n / 60}h` : n > 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n}m`)

/** The recognised fields as removable chips, in a fixed order. */
export function chipsOf(f: Fields, projectName: (id: string) => string | undefined): Chip[] {
  const out: Chip[] = []
  if (f.due) out.push({ id: 'due', text: tr('Due {date}', { date: f.due.time ? `${f.due.date} ${f.due.time}` : f.due.date }) })
  if (f.start === 'someday') out.push({ id: 'start', text: tr('Someday') })
  else if (f.start) out.push({ id: 'start', text: tr('Starts {date}', { date: f.start }) })
  if (f.deadline) out.push({ id: 'deadline', text: tr('Deadline {date}', { date: f.deadline }) })
  if (f.priority) out.push({ id: 'priority', text: tr('Priority {n}', { n: f.priority }) })
  for (const name of f.labels) out.push({ id: `label:${name}`, text: tr('Label {name}', { name }) })
  if (f.projectId) out.push({ id: 'projectId', text: tr('Project {name}', { name: projectName(f.projectId) ?? f.projectId }) })
  if (f.estimate) out.push({ id: 'estimate', text: tr('Estimate {d}', { d: minutes(f.estimate) }) })
  if (f.spent) out.push({ id: 'spent', text: tr('Spent {d}', { d: minutes(f.spent) }) })
  if (f.evening) out.push({ id: 'evening', text: tr('This evening') })
  if (f.dayPart === 'morning') out.push({ id: 'dayPart', text: tr('Morning') })
  if (f.dayPart === 'afternoon') out.push({ id: 'dayPart', text: tr('Afternoon') })
  if (f.energy) out.push({ id: 'energy', text: tr('Energy {level}', { level: f.energy }) })
  if (f.recurrence) out.push({ id: 'recurrence', text: tr('Repeats {rule}', { rule: f.recurrence }) })
  return out
}

/** The fields without the chip's value. */
export function withoutChip(f: Fields, id: string): Fields {
  if (id.startsWith('label:')) {
    const name = id.slice('label:'.length)
    return { ...f, labels: f.labels.filter((l) => l !== name) }
  }
  const out = { ...f }
  delete out[id as keyof Fields]
  return out
}
