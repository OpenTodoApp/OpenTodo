// The visual filter builder's model (OpenSpec change filter-builder). The
// formula stays the stored form (design D1): this file prints a parsed query
// with the fewest parentheses the grammar needs (D2) and converts between the
// parse tree and the builder's groups and conditions (D3). Pure, no React.
import { WEEKDAYS, type DateExpr, type FieldValueExpr, type Node } from './parse'

// ---- printing (D2) ----

/** Characters that end a bare word (the tokenizer's BREAK). */
const BREAK = /[\s"&|!()<>=]/

function quoteAlways(s: string): string {
  return `"${s.replace(/["\\]/g, (c) => '\\' + c)}"`
}

/** A bare name unless it contains a break character, is empty, or starts with `#` (which would read as `##`). */
function quoteName(name: string): string {
  return BREAK.test(name) || name === '' || name.startsWith('#') ? quoteAlways(name) : name
}

/** `search:` and `origin:` text: bare when it reads back as one word. */
function quoteText(text: string): string {
  return BREAK.test(text) || text === '' || text.startsWith('"') ? quoteAlways(text) : text
}

export function formatDate(d: DateExpr): string {
  if (d.type === 'iso') return d.date
  if (d.type === 'weekday') return WEEKDAYS[d.day]
  if (d.type === 'period') {
    if (d.offset === 0) return `this ${d.unit}`
    if (d.offset === -1) return `last ${d.unit}`
    if (d.offset === 1) return `next ${d.unit}`
    return `${-d.offset} ${d.unit}s ago`
  }
  if (d.days === 0) return 'today'
  if (d.days === 1) return 'tomorrow'
  if (d.days === -1) return 'yesterday'
  return d.days < 0 ? `${-d.days} days ago` : `${d.days} days`
}

/** Minutes as the grammar reads them back: 45m, 2h, 1h30. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

function formatFieldValue(v: FieldValueExpr): string {
  switch (v.type) {
    case 'number': return String(v.value)
    case 'bool': return String(v.value)
    case 'text': return quoteAlways(v.value)
    case 'date': return formatDate(v.date)
  }
}

/** One leaf, as the parser reads it. */
export function formatLeaf(n: Node): string {
  switch (n.kind) {
    case 'label': return `@${quoteName(n.name)}`
    case 'project': return `${n.descendants ? '##' : '#'}${quoteName(n.name)}`
    case 'priority': return `p${n.value}`
    case 'date': return `${n.field} ${n.op} ${formatDate(n.date)}`
    case 'keyword': return n.keyword
    case 'search': return `search: ${quoteText(n.text)}`
    case 'origin': return `origin: ${quoteText(n.value)}`
    // Field names are always quoted: a bare one could be a reserved word.
    case 'field': return `${quoteAlways(n.name)} ${n.op} ${formatFieldValue(n.value)}`
    case 'nofield': return `no ${quoteAlways(n.name)}`
    case 'tracked': return `tracked ${n.op} ${formatMinutes(n.minutes)}`
    case 'or': case 'and': case 'not': return formatQuery(n)
  }
}

/**
 * Readable query text with the fewest parentheses that keep the tree: `!` binds
 * tighter than `&`, `&` tighter than `|`, and a child of the same kind keeps its
 * parentheses because the parser flattens `a & b & c` but not `(a & b) & c`.
 */
export function formatQuery(n: Node): string {
  const wrap = (child: Node, parens: boolean) => (parens ? `(${formatQuery(child)})` : formatQuery(child))
  switch (n.kind) {
    case 'or':
      return n.items.map((c) => wrap(c, c.kind === 'or')).join(' | ')
    case 'and':
      return n.items.map((c) => wrap(c, c.kind === 'and' || c.kind === 'or')).join(' & ')
    case 'not':
      return `!${wrap(n.item, n.item.kind === 'and' || n.item.kind === 'or')}`
    default:
      return formatLeaf(n)
  }
}

/** A parse tree without source positions, for comparing two trees. */
export function stripPositions(n: Node): Node {
  switch (n.kind) {
    case 'or': case 'and': return { kind: n.kind, items: n.items.map(stripPositions) }
    case 'not': return { kind: 'not', item: stripPositions(n.item) }
    case 'label': return { kind: 'label', name: n.name, pos: 0 }
    case 'project': return { kind: 'project', name: n.name, descendants: n.descendants, pos: 0 }
    case 'field': return { ...n, pos: 0, opPos: 0 }
    case 'nofield': return { ...n, pos: 0 }
    default: return n
  }
}

// ---- builder model (D3) ----

/** A leaf of the grammar: anything but `and`, `or` and `not`. */
export type Leaf = Exclude<Node, { kind: 'and' | 'or' | 'not' }>

export interface BCondition { type: 'condition'; id: string; not: boolean; leaf: Leaf }
export interface BGroup { type: 'group'; id: string; not: boolean; op: 'and' | 'or'; items: BItem[] }
export type BItem = BCondition | BGroup

/** Groups nest this many levels, the root included. */
export const MAX_DEPTH = 3

let seq = 0
/** A key for React lists; not part of the query. */
export function newId(): string {
  return `b${++seq}`
}

/**
 * The builder for a parsed query, or null when the builder cannot show it (a
 * double negation, or groups nested deeper than MAX_DEPTH). An empty query is
 * an empty "All of these".
 */
export function toBuilder(ast: Node | null): BGroup | null {
  if (!ast) return { type: 'group', id: newId(), not: false, op: 'and', items: [] }
  const item = toItem(ast, 1)
  if (!item) return null
  if (item.type === 'group') return item
  return { type: 'group', id: newId(), not: false, op: 'and', items: [item] }
}

function toItem(n: Node, depth: number): BItem | null {
  let not = false
  let node = n
  if (node.kind === 'not') {
    not = true
    node = node.item
    if (node.kind === 'not') return null
  }
  if (node.kind === 'and' || node.kind === 'or') {
    if (depth > MAX_DEPTH) return null
    const items: BItem[] = []
    for (const child of node.items) {
      const item = toItem(child, depth + 1)
      if (!item) return null
      items.push(item)
    }
    return { type: 'group', id: newId(), not, op: node.kind, items }
  }
  return { type: 'condition', id: newId(), not, leaf: node }
}

/** The parse tree of a builder; null when it holds no condition. */
export function fromBuilder(g: BGroup): Node | null {
  return itemNode(g)
}

function negate(n: Node, not: boolean): Node {
  return not ? { kind: 'not', item: n } : n
}

function itemNode(item: BItem): Node | null {
  if (item.type === 'condition') return negate(item.leaf, item.not)
  const nodes = item.items.map(itemNode).filter((n): n is Node => n !== null)
  if (nodes.length === 0) return null
  if (nodes.length === 1) {
    const only = nodes[0]
    // `!x` under Not would be `!!x`, which the builder cannot show: Not cancels out.
    if (item.not && only.kind === 'not') return only.item
    return negate(only, item.not)
  }
  return negate({ kind: item.op, items: nodes }, item.not)
}

/** The query text of a builder ('' for an empty one). */
export function builderQuery(g: BGroup): string {
  const n = fromBuilder(g)
  return n ? formatQuery(n) : ''
}

/** Depth of a group within the root (the root is 1). */
export function depthOf(root: BGroup, id: string): number {
  const walk = (g: BGroup, d: number): number => {
    if (g.id === id) return d
    for (const it of g.items) if (it.type === 'group') {
      const found = walk(it, d + 1)
      if (found) return found
    }
    return 0
  }
  return walk(root, 1)
}

/** A copy of the tree with `fn` applied to the group with `id`. */
export function updateGroup(root: BGroup, id: string, fn: (g: BGroup) => BGroup): BGroup {
  if (root.id === id) return fn(root)
  return { ...root, items: root.items.map((it) => (it.type === 'group' ? updateGroup(it, id, fn) : it)) }
}

/** A copy of the tree without the item `id`. */
export function removeItem(root: BGroup, id: string): BGroup {
  return { ...root, items: root.items.filter((it) => it.id !== id).map((it) => (it.type === 'group' ? removeItem(it, id) : it)) }
}

/** A copy of the tree with the item `id` replaced. */
export function replaceItem(root: BGroup, id: string, next: BItem): BGroup {
  return {
    ...root,
    items: root.items.map((it) => (it.id === id ? next : it.type === 'group' ? replaceItem(it, id, next) : it)),
  }
}
