// Filter queries inline (design D4): a query with at least one filter term lists its
// matching tasks and offers the Filter view. Half-typed text is never an error here:
// anything that does not parse is simply a text search.
import { compile, parse, type FilterContext, type Node } from '../../lib/filter'
import type { Task } from '../../lib/types'
import { navigate } from '../router'
import type { Entry } from './entries'
import { t } from '../../lib/i18n'

/** At most this many tasks from a filter query. */
export const FILTER_RESULTS = 20

/** True when the query has a term other than `search:` (plain words stay a text search). */
export function hasFilterTerm(n: Node): boolean {
  switch (n.kind) {
    case 'search': return false
    case 'and':
    case 'or': return n.items.some(hasFilterTerm)
    case 'not': return hasFilterTerm(n.item)
    default: return true
  }
}

/**
 * The "Open in Filter view" entry and the matching tasks, or [] when the text is not
 * a filter query. `taskEntry` builds a task's entry (the same as the text search's,
 * so a task found both ways is listed once).
 */
export function filterEntries(text: string, tasks: readonly Task[], ctx: FilterContext, taskEntry: (task: Task) => Entry): Entry[] {
  const q = text.trim()
  if (!q) return []
  let ast: Node | null
  try {
    ast = parse(q)
  } catch {
    return []
  }
  if (!ast || !hasFilterTerm(ast)) return []
  let test: (tk: Task) => boolean
  try {
    test = compile(ast, { ...ctx, tasks }).test
  } catch {
    return []
  }
  const hidden = new Set(ctx.projects.filter((p) => p.archived).map((p) => p.id))
  const matches = tasks.filter((item) => (!item.project_id || !hidden.has(item.project_id)) && test(item))
  return [
    { kind: 'filter', key: `filter:${q}`, label: t('Open in Filter view: {query}', { query: q }), secondary: t('{n, plural, one {# task} other {# tasks}}', { n: matches.length }), icon: 'filter',
      run: () => navigate({ view: 'filter', q }) },
    ...matches.slice(0, FILTER_RESULTS).map(taskEntry),
  ]
}
