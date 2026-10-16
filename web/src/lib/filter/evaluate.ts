// Filter evaluation: compile a parsed query once into a predicate over local
// tasks. Pure; names are resolved against the labels and projects passed in on
// every compile, so renames are picked up and deleted names degrade to a warning
// plus an empty match instead of an error (design D3).
import { blockedMap } from '../dependencies'
import { currentDateTime, localDueOf } from '../dates'
import { descendants } from '../tree'
import type { FieldDef, FieldValue, Label, Project, Task } from '../types'
import { fieldValueText, FilterSyntaxError, parse, resolveRange, shiftISO, type Cmp, type DateRange, type Node } from './parse'

export interface FilterContext {
  /** The viewer's local calendar date, YYYY-MM-DD. */
  today: string
  labels: readonly Label[]
  projects: readonly Project[]
  /** Every live task, for `blocked` and `unblocked` (task-dependencies D6). */
  tasks?: readonly Task[]
  /**
   * First day of the week for `this week` and friends, 0 = Sunday. Defaults to the
   * user's date-time preference snapshot (completed-date-filters D2).
   */
  weekStart?: number
  /**
   * Custom field definitions (OpenSpec custom-fields) for `name cmp value` and
   * `no name`; names resolve against the live ones of every project, ignoring case.
   */
  fields?: readonly FieldDef[]
}

export interface CompiledFilter {
  test: (task: Task) => boolean
  /** One message per unknown label or project name, in query order, without duplicates. */
  warnings: string[]
}

export type FilterResult =
  | { ok: true; empty: boolean; tasks: Task[]; warnings: string[] }
  | { ok: false; error: string; position: number; offset: number }

type Pred = (t: Task) => boolean

const NEVER: Pred = () => false

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}

/**
 * True when the query mentions `completed` or `open`, or compares the completion
 * date (completed-date-filters D3); otherwise only open tasks match (design D5).
 */
export function mentionsState(n: Node): boolean {
  switch (n.kind) {
    case 'or':
    case 'and':
      return n.items.some(mentionsState)
    case 'not':
      return mentionsState(n.item)
    case 'keyword':
      return n.keyword === 'completed' || n.keyword === 'open'
    case 'date':
      return n.field === 'completed'
    default:
      return false
  }
}

/** A day against a range of days (completed-date-filters D1); a one-day range is a plain comparison. */
function compareISO(d: string, op: Cmp, r: DateRange): boolean {
  switch (op) {
    case '<': return d < r.start
    case '<=': return d <= r.end
    case '=': return d >= r.start && d <= r.end
    case '>=': return d >= r.start
    case '>': return d > r.end
  }
}

/** Local midnight of a floating date as Unix milliseconds. */
function startOfDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/**
 * `created <op> date` and `completed <op> date` as a millisecond range check on an
 * instant in the viewer's zone; a null instant never matches.
 */
function instantPred(at: (t: Task) => number | null, op: Cmp, r: DateRange): Pred {
  const start = startOfDay(r.start)
  const next = startOfDay(shiftISO(r.end, 1))
  const test = (ms: number): boolean => {
    switch (op) {
      case '<': return ms < start
      case '<=': return ms < next
      case '=': return ms >= start && ms < next
      case '>=': return ms >= start
      case '>': return ms >= next
    }
  }
  return (t) => {
    const ms = at(t)
    return ms !== null && ms !== undefined && test(ms)
  }
}

const TYPE_WORDS: Record<string, string> = { text: 'Text', link: 'Link', choice: 'Choice' }

function isEmptyValue(v: FieldValue | undefined): boolean {
  return v === null || v === undefined || v === ''
}

/**
 * The predicate of one field term against one definition (custom-fields D5):
 * numbers numerically, dates with the date grammar, text, link and choice with
 * `=` only ignoring case, checkboxes with `= true` / `= false`. A term the type
 * cannot answer is a FilterSyntaxError at the operator. Only tasks of the
 * definition's project are considered, the same values the panel shows.
 */
function fieldPred(def: FieldDef, n: Extract<Node, { kind: 'field' }>, today: string, weekStart: number): Pred {
  const at = n.opPos
  const value = (t: Task): FieldValue | undefined => (t.project_id === def.project_id ? t.fields?.[def.id] : undefined)
  const label = `"${n.name}"`
  switch (def.type) {
    case 'number': {
      if (n.value.type !== 'number') throw new FilterSyntaxError(`Field ${label} holds numbers: compare it with a number at position ${at + 1}`, at, ['number'])
      const want = n.value.value
      const op = n.op
      return (t) => {
        const v = value(t)
        if (typeof v !== 'number') return false
        switch (op) {
          case '<': return v < want
          case '<=': return v <= want
          case '=': return v === want
          case '>=': return v >= want
          case '>': return v > want
        }
      }
    }
    case 'date': {
      if (n.value.type !== 'date') throw new FilterSyntaxError(`Field ${label} holds dates: compare it with a date at position ${at + 1}`, at, ['date'])
      const range = resolveRange(n.value.date, today, weekStart)
      const op = n.op
      return (t) => {
        const v = value(t)
        return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && compareISO(v, op, range)
      }
    }
    case 'checkbox': {
      if (n.op !== '=' || n.value.type !== 'bool') throw new FilterSyntaxError(`Checkbox fields support "= true" or "= false" only, at position ${at + 1}`, at, ['"= true"', '"= false"'])
      const want = n.value.value
      // An unset checkbox reads as unchecked.
      return (t) => {
        const v = value(t)
        return t.project_id === def.project_id && (want ? v === true : v !== true)
      }
    }
    default: {
      if (n.op !== '=') throw new FilterSyntaxError(`${TYPE_WORDS[def.type] ?? 'Text'} fields support "=" only, at position ${at + 1}`, at, ['"="'])
      // A bare word that reads as a date (`client = today`) still compares as its text.
      const want = fieldValueText(n.value).toLocaleLowerCase()
      return (t) => {
        const v = value(t)
        return typeof v === 'string' && v.toLocaleLowerCase() === want
      }
    }
  }
}

/** Compile an AST into a predicate. Deleted tasks never match; open-only unless the query mentions state. */
export function compile(ast: Node, ctx: FilterContext): CompiledFilter {
  const warnings: string[] = []
  const warn = (msg: string) => {
    if (!warnings.includes(msg)) warnings.push(msg)
  }

  const liveLabels = ctx.labels.filter((l) => !l.deleted_at)
  const liveProjects = ctx.projects.filter((p) => !p.deleted_at)
  const labelsByName = new Map<string, string[]>()
  for (const l of liveLabels) labelsByName.set(nameKey(l.name), [...(labelsByName.get(nameKey(l.name)) ?? []), l.id])
  const projectsByName = new Map<string, string[]>()
  for (const p of liveProjects) projectsByName.set(nameKey(p.name), [...(projectsByName.get(nameKey(p.name)) ?? []), p.id])
  const fieldsByName = new Map<string, FieldDef[]>()
  for (const d of ctx.fields ?? []) {
    if (!d.deleted_at) fieldsByName.set(nameKey(d.name), [...(fieldsByName.get(nameKey(d.name)) ?? []), d])
  }
  const today = ctx.today
  const weekStart = ctx.weekStart ?? currentDateTime().weekStart
  const tomorrow = shiftISO(today, 1)
  // Open blockers per task, built once when the query asks (task-dependencies D6).
  let blocked: Map<string, number> | null = null
  const blockedSet = () => {
    if (!blocked) {
      if (!ctx.tasks) warn('Blocked tasks cannot be told apart here')
      blocked = blockedMap(ctx.tasks ?? [])
    }
    return blocked
  }

  const build = (n: Node): Pred => {
    switch (n.kind) {
      case 'or': {
        const ps = n.items.map(build)
        return (t) => ps.some((p) => p(t))
      }
      case 'and': {
        const ps = n.items.map(build)
        return (t) => ps.every((p) => p(t))
      }
      case 'not': {
        const p = build(n.item)
        return (t) => !p(t)
      }
      case 'label': {
        const ids = labelsByName.get(nameKey(n.name))
        if (!ids) {
          warn(`No label named "${n.name}"`)
          return NEVER
        }
        // Several labels may share a name after concurrent creation: any of them matches.
        if (ids.length === 1) {
          const id = ids[0]
          return (t) => t.labels.includes(id)
        }
        const set = new Set(ids)
        return (t) => t.labels.some((id) => set.has(id))
      }
      case 'project': {
        const ids = projectsByName.get(nameKey(n.name))
        if (!ids) {
          warn(`No project named "${n.name}"`)
          return NEVER
        }
        const set = new Set(ids)
        if (n.descendants) for (const id of ids) for (const d of descendants(id, liveProjects as Project[])) set.add(d)
        return (t) => t.project_id !== null && set.has(t.project_id)
      }
      case 'priority': {
        const v = n.value
        return (t) => t.priority === v
      }
      case 'date': {
        const date = resolveRange(n.date, today, weekStart)
        if (n.field === 'created') return instantPred((t) => t.created_at, n.op, date)
        if (n.field === 'completed') return instantPred((t) => t.completed_at, n.op, date)
        const op = n.op
        // A task without a deadline never matches a `deadline` comparison (deadlines D4).
        if (n.field === 'deadline') return (t) => !!t.deadline && compareISO(t.deadline, op, date)
        // Only a start date compares; null and Someday never match (someday-and-evening).
        if (n.field === 'start') return (t) => !!t.start && t.start !== 'someday' && compareISO(t.start, op, date)
        // A task without a due date never matches a `due` comparison.
        return (t) => t.due !== null && compareISO(localDueOf(t.due).date, op, date)
      }
      case 'field': {
        const defs = fieldsByName.get(nameKey(n.name))
        if (!defs) {
          warn(`No field named "${n.name}"`)
          return NEVER
        }
        // Several projects may define the name, with different types: the term
        // uses every definition it can answer, and fails only when none can.
        const ps: Pred[] = []
        let first: unknown = null
        for (const d of defs) {
          try {
            ps.push(fieldPred(d, n, today, weekStart))
          } catch (e) {
            first ??= e
          }
        }
        if (ps.length === 0) throw first
        return (t) => ps.some((p) => p(t))
      }
      case 'nofield': {
        const defs = fieldsByName.get(nameKey(n.name))
        if (!defs) {
          warn(`No field named "${n.name}"`)
          return NEVER
        }
        return (t) => defs.some((d) => t.project_id === d.project_id && isEmptyValue(t.fields?.[d.id]))
      }
      case 'search': {
        const needle = n.text.toLocaleLowerCase()
        return (t) => t.title.toLocaleLowerCase().includes(needle) || t.description.toLocaleLowerCase().includes(needle)
      }
      case 'keyword':
        switch (n.keyword) {
          case 'overdue': return (t) => t.due !== null && localDueOf(t.due).date < today
          case 'today': return (t) => t.due !== null && localDueOf(t.due).date === today
          case 'tomorrow': return (t) => t.due !== null && localDueOf(t.due).date === tomorrow
          case 'no date': return (t) => t.due === null
          case 'no time': return (t) => t.due !== null && !t.due.time
          case 'no project': return (t) => t.project_id === null
          case 'no labels': return (t) => t.labels.length === 0
          case 'no deadline': return (t) => !t.deadline
          case 'no start': return (t) => !t.start
          case 'someday': return (t) => t.start === 'someday'
          case 'deferred': return (t) => !!t.start && t.start !== 'someday' && t.start > today
          case 'evening': return (t) => !!t.evening
          // A habit's skipped occurrence record is not a completion (OpenSpec habits, D6).
          case 'completed': return (t) => t.completed_at !== null && !t.skipped
          case 'open': return (t) => t.completed_at === null
          case 'subtask': return (t) => t.parent_id !== null
          case 'habit': return (t) => t.habit === true
          case 'blocked': { const b = blockedSet(); return (t) => b.has(t.id) }
          case 'unblocked': { const b = blockedSet(); return (t) => !b.has(t.id) }
        }
    }
  }

  const pred = build(ast)
  const openOnly = !mentionsState(ast)
  // Skipped habit records match no query, whatever its terms (habits D6).
  const test: Pred = openOnly
    ? (t) => !t.deleted_at && t.completed_at === null && pred(t)
    : (t) => !t.deleted_at && !t.skipped && pred(t)
  return { test, warnings }
}

/** Parse and evaluate in one step; syntax errors are returned, not thrown. */
export function runFilter(source: string, tasks: readonly Task[], ctx: FilterContext): FilterResult {
  try {
    const ast = parse(source)
    if (!ast) return { ok: true, empty: true, tasks: [], warnings: [] }
    // A field term its type cannot answer is reported like a syntax error (custom-fields).
    const { test, warnings } = compile(ast, ctx.tasks ? ctx : { ...ctx, tasks })
    return { ok: true, empty: false, tasks: tasks.filter(test), warnings }
  } catch (e) {
    const err = e as { message: string; offset?: number }
    if (typeof err.offset !== 'number') throw e
    return { ok: false, error: err.message, offset: err.offset, position: err.offset + 1 }
  }
}
