// The label checkboxes of the calendar's and Upcoming's filter (OpenSpec change
// calendar-clarity, design D4): they read and write one clause of the query, "any of
// these labels" (`@errand | @call`). A query of only that clause is replaced whole; in
// an "all of" query the clause is one of its terms and the other terms are kept.
import { parse, printQuery, type Node } from './parse'

type LabelNode = Extract<Node, { kind: 'label' }>

const isLabel = (n: Node): n is LabelNode => n.kind === 'label'
/** `@a` or `@a | @b | …`: the clause the checkboxes own. */
const labelClause = (n: Node): string[] | null =>
  isLabel(n) ? [n.name] : n.kind === 'or' && n.items.length > 0 && n.items.every(isLabel) ? n.items.map((i) => (i as LabelNode).name) : null

/** The query split into the checked label names and the other terms; null when it does not parse. */
export function splitLabels(query: string): { names: string[]; rest: Node[] } | null {
  let ast: Node | null
  try {
    ast = parse(query)
  } catch {
    return null
  }
  if (!ast) return { names: [], rest: [] }
  const own = labelClause(ast)
  if (own) return { names: own, rest: [] }
  if (ast.kind === 'and') {
    const i = ast.items.findIndex((n) => labelClause(n) !== null)
    if (i >= 0) return { names: labelClause(ast.items[i])!, rest: ast.items.filter((_, j) => j !== i) }
    return { names: [], rest: ast.items }
  }
  return { names: [], rest: [ast] }
}

/** Without the outer parentheses printQuery puts around a compound. */
const bare = (n: Node): string => {
  const s = printQuery(n)
  return (n.kind === 'and' || n.kind === 'or') && s.startsWith('(') ? s.slice(1, -1) : s
}

/** The query with its label clause set to `names` (none removes it); null when the query does not parse. */
export function withLabels(query: string, names: readonly string[]): string | null {
  const split = splitLabels(query)
  if (!split) return null
  const labels: Node | null = names.length === 0 ? null
    : names.length === 1 ? { kind: 'label', name: names[0], pos: 0 }
    : { kind: 'or', items: names.map((name): Node => ({ kind: 'label', name, pos: 0 })) }
  const items = labels ? [...split.rest, labels] : split.rest
  if (items.length === 0) return ''
  if (items.length === 1) return bare(items[0])
  return items.map(printQuery).join(' & ')
}
