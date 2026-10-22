// "Make an automation rule" from a saved filter or a board column (automation-rules
// custom-views delta, design D3): the structural terms of the filter's query become
// a condition read from the client parser's tree; every other term is named as not
// carried over. Pure: names resolve through the lists the caller passes.
import { parse, printQuery, type Node } from '../filter'
import type { Label, OriginKind, Project, RuleCondition } from '../types'

const ORIGIN_KINDS = ['url', 'email', 'issue', 'import']

export interface Converted {
  condition: RuleCondition | null
  /** Terms of the query, printed, that a rule cannot use. */
  dropped: string[]
}

type Names = {
  labels: readonly Pick<Label, 'id' | 'name' | 'deleted_at'>[]
  projects: readonly Pick<Project, 'id' | 'name' | 'deleted_at'>[]
}

const byName = <T extends { name: string; deleted_at: number | null }>(list: readonly T[], name: string): T | undefined =>
  list.find((x) => !x.deleted_at && x.name.toLowerCase() === name.toLowerCase())

/** One term of an `and` as a partial condition, or null when a rule cannot use it. */
function term(n: Node, names: Names): RuleCondition | null {
  switch (n.kind) {
    case 'priority':
      return { priority: { in: [n.value] } }
    case 'label': {
      const l = byName(names.labels, n.name)
      return l ? { labels: { all: [l.id] } } : null
    }
    case 'project': {
      const p = byName(names.projects, n.name)
      return p ? { project: n.descendants ? { in: [p.id], descendants: true } : { in: [p.id] } } : null
    }
    case 'origin': {
      const kind = n.value.toLowerCase()
      return ORIGIN_KINDS.includes(kind) ? { origin: { kind: kind as OriginKind } } : null
    }
    case 'keyword':
      switch (n.keyword) {
        case 'overdue': return { due: 'overdue' }
        case 'today': return { due: 'today' }
        case 'no date': return { due: 'none' }
        case 'no project': return { project: 'none' }
        case 'no deadline': return { deadline: 'none' }
        case 'someday': return { start: 'someday' }
        case 'deferred': return { start: 'deferred' }
        case 'no start': return { start: 'none' }
        case 'evening': return { evening: true }
        case 'blocked': return { blocked: true }
        case 'unblocked': return { blocked: false }
        case 'habit': return { habit: true }
        case 'no origin': return { origin: 'none' }
        default: return null
      }
    case 'date':
      // `due = today` is today; `due <= N days` (N ≥ 0) also matches overdue tasks,
      // which no single predicate does, so only the exact day is carried over.
      if (n.field === 'due' && n.op === '=' && n.date.type === 'relative' && n.date.days === 0) return { due: 'today' }
      return null
    case 'not': {
      const inner = n.item
      if (inner.kind === 'label') {
        const l = byName(names.labels, inner.name)
        return l ? { labels: { none: [l.id] } } : null
      }
      if (inner.kind === 'keyword' && inner.keyword === 'blocked') return { blocked: false }
      if (inner.kind === 'keyword' && inner.keyword === 'habit') return { habit: false }
      if (inner.kind === 'keyword' && inner.keyword === 'evening') return { evening: false }
      return null
    }
    case 'or':
      return anyOf(n.items, names)
    default:
      return null
  }
}

/** An `or` a predicate can hold: priorities, labels (any) or projects. */
function anyOf(items: Node[], names: Names): RuleCondition | null {
  if (items.every((i) => i.kind === 'priority')) return { priority: { in: [...new Set(items.map((i) => (i as { value: 1 | 2 | 3 | 4 }).value))].sort() } }
  if (items.every((i) => i.kind === 'label')) {
    const ids = items.map((i) => byName(names.labels, (i as { name: string }).name)?.id)
    return ids.every(Boolean) ? { labels: { any: ids as string[] } } : null
  }
  if (items.every((i) => i.kind === 'project' && !i.descendants)) {
    const ids = items.map((i) => byName(names.projects, (i as { name: string }).name)?.id)
    return ids.every(Boolean) ? { project: { in: ids as string[] } } : null
  }
  return null
}

/** Merges a term into the condition; false when the key is already set another way. */
function merge(c: RuleCondition, part: RuleCondition): boolean {
  for (const [k, v] of Object.entries(part) as [keyof RuleCondition, unknown][]) {
    if (k === 'labels' && c.labels) {
      const p = v as NonNullable<RuleCondition['labels']>
      if (p.any && c.labels.any) return false
      c.labels = {
        ...(c.labels.any || p.any ? { any: c.labels.any ?? p.any } : {}),
        ...(c.labels.all || p.all ? { all: [...(c.labels.all ?? []), ...(p.all ?? [])] } : {}),
        ...(c.labels.none || p.none ? { none: [...(c.labels.none ?? []), ...(p.none ?? [])] } : {}),
      }
      continue
    }
    if (c[k] !== undefined) return false
    ;(c as Record<string, unknown>)[k] = v
  }
  return true
}

/** A query's structural terms as a condition, and the terms it leaves out. */
export function queryToCondition(query: string, names: Names): Converted {
  let ast: Node | null
  try {
    ast = parse(query)
  } catch {
    return { condition: null, dropped: query.trim() ? [query.trim()] : [] }
  }
  if (!ast) return { condition: null, dropped: [] }
  const items = ast.kind === 'and' ? ast.items : [ast]
  const c: RuleCondition = {}
  const dropped: string[] = []
  for (const item of items) {
    const part = term(item, names)
    if (!part || !merge(c, part)) dropped.push(printQuery(item).replace(/^\((.*)\)$/, '$1'))
  }
  return { condition: Object.keys(c).length ? c : null, dropped }
}
