// Filter evaluation: compile a parsed query once into a predicate over local
// tasks. Pure; names are resolved against the labels and projects passed in on
// every compile, so renames are picked up and deleted names degrade to a warning
// plus an empty match instead of an error (design D3).
import { descendants } from '../tree'
import type { Label, Project, Task } from '../types'
import { parse, resolveDate, shiftISO, type Cmp, type Node } from './parse'

export interface FilterContext {
  /** The viewer's local calendar date, YYYY-MM-DD. */
  today: string
  labels: readonly Label[]
  projects: readonly Project[]
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

/** True when the query mentions `completed` or `open`; otherwise only open tasks match (design D5). */
export function mentionsState(n: Node): boolean {
  switch (n.kind) {
    case 'or':
    case 'and':
      return n.items.some(mentionsState)
    case 'not':
      return mentionsState(n.item)
    case 'keyword':
      return n.keyword === 'completed' || n.keyword === 'open'
    default:
      return false
  }
}

function compareISO(a: string, op: Cmp, b: string): boolean {
  switch (op) {
    case '<': return a < b
    case '<=': return a <= b
    case '=': return a === b
    case '>=': return a >= b
    case '>': return a > b
  }
}

/** Local midnight of a floating date as Unix milliseconds. */
function startOfDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** `created <op> date` as a millisecond range check on `created_at` in the viewer's zone. */
function createdPred(op: Cmp, date: string): Pred {
  const start = startOfDay(date)
  const next = startOfDay(shiftISO(date, 1))
  switch (op) {
    case '<': return (t) => t.created_at < start
    case '<=': return (t) => t.created_at < next
    case '=': return (t) => t.created_at >= start && t.created_at < next
    case '>=': return (t) => t.created_at >= start
    case '>': return (t) => t.created_at >= next
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
  const today = ctx.today
  const tomorrow = shiftISO(today, 1)

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
        const date = resolveDate(n.date, today)
        if (n.field === 'created') return createdPred(n.op, date)
        const op = n.op
        // A task without a due date never matches a `due` comparison.
        return (t) => t.due !== null && compareISO(t.due.date, op, date)
      }
      case 'search': {
        const needle = n.text.toLocaleLowerCase()
        return (t) => t.title.toLocaleLowerCase().includes(needle) || t.description.toLocaleLowerCase().includes(needle)
      }
      case 'keyword':
        switch (n.keyword) {
          case 'overdue': return (t) => t.due !== null && t.due.date < today
          case 'today': return (t) => t.due !== null && t.due.date === today
          case 'tomorrow': return (t) => t.due !== null && t.due.date === tomorrow
          case 'no date': return (t) => t.due === null
          case 'no time': return (t) => t.due !== null && !t.due.time
          case 'no project': return (t) => t.project_id === null
          case 'no labels': return (t) => t.labels.length === 0
          case 'completed': return (t) => t.completed_at !== null
          case 'open': return (t) => t.completed_at === null
          case 'subtask': return (t) => t.parent_id !== null
        }
    }
  }

  const pred = build(ast)
  const openOnly = !mentionsState(ast)
  const test: Pred = openOnly
    ? (t) => !t.deleted_at && t.completed_at === null && pred(t)
    : (t) => !t.deleted_at && pred(t)
  return { test, warnings }
}

/** Parse and evaluate in one step; syntax errors are returned, not thrown. */
export function runFilter(source: string, tasks: readonly Task[], ctx: FilterContext): FilterResult {
  let ast: Node | null
  try {
    ast = parse(source)
  } catch (e) {
    const err = e as { message: string; offset?: number }
    if (typeof err.offset !== 'number') throw e
    return { ok: false, error: err.message, offset: err.offset, position: err.offset + 1 }
  }
  if (!ast) return { ok: true, empty: true, tasks: [], warnings: [] }
  const { test, warnings } = compile(ast, ctx)
  return { ok: true, empty: false, tasks: tasks.filter(test), warnings }
}
