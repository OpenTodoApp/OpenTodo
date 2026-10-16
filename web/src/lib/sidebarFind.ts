// Find in the sidebar (OpenSpec change sidebar-groups, app-shell "Find in the
// sidebar"): one pure match over the rows the sidebar already has. Projects keep
// their ancestors so a nested match still reads as part of its tree; labels and
// filters match by name. Case- and accent-insensitive, with the picker's rules
// (exact, then every word a word prefix, then letters in order).
import { matchPrepared, prepare, prepareQuery } from '../ui/Combobox/match'

export interface FindRow {
  id: string
  parent: string | null
  name: string
}

export interface FindNamed {
  id: string
  name: string
}

export interface SidebarFindInput {
  /** The whole project tree, flattened in tree order, collapse ignored. */
  rows: FindRow[]
  labels: FindNamed[]
  /** The saved filters the sidebar lists. */
  views: FindNamed[]
}

export type FindKind = 'project' | 'label' | 'view'

export interface SidebarFindResult {
  /** Projects to show: the matches and their ancestors. */
  projects: Set<string>
  /** Projects that matched by name (an ancestor shown for context is not in it). */
  matched: Set<string>
  labels: Set<string>
  views: Set<string>
  /** Every match in reading order: matched projects in tree order, then labels, then filters. */
  order: { kind: FindKind; id: string }[]
  /** True when the query has text and nothing matches. */
  empty: boolean
}

function hits(query: ReturnType<typeof prepareQuery>, name: string): boolean {
  return matchPrepared(query, prepare(name), name.length).tier > 0
}

/** An empty query shows everything, in which case `order` is empty too. */
export function matchSidebar(query: string, { rows, labels, views }: SidebarFindInput): SidebarFindResult {
  const q = prepareQuery(query)
  if (!q.q) {
    return {
      projects: new Set(rows.map((r) => r.id)), matched: new Set(), labels: new Set(labels.map((l) => l.id)), views: new Set(views.map((v) => v.id)),
      order: [], empty: false,
    }
  }
  const parentOf = new Map(rows.map((r) => [r.id, r.parent]))
  const matched = new Set<string>()
  const projects = new Set<string>()
  const order: SidebarFindResult['order'] = []
  for (const r of rows) {
    if (!hits(q, r.name)) continue
    matched.add(r.id)
    order.push({ kind: 'project', id: r.id })
    // The match and every ancestor, so its place in the tree is clear.
    let cur: string | null = r.id
    const seen = new Set<string>()
    while (cur !== null && !seen.has(cur)) {
      seen.add(cur)
      projects.add(cur)
      cur = parentOf.get(cur) ?? null
    }
  }
  const labelIds = new Set<string>()
  for (const l of labels) if (hits(q, l.name)) { labelIds.add(l.id); order.push({ kind: 'label', id: l.id }) }
  const viewIds = new Set<string>()
  for (const v of views) if (hits(q, v.name)) { viewIds.add(v.id); order.push({ kind: 'view', id: v.id }) }
  return { projects, matched, labels: labelIds, views: viewIds, order, empty: order.length === 0 }
}
