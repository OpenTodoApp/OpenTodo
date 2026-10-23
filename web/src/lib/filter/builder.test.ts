import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import filtersDoc from '../../../../docs/filters.md?raw'
import { builderQuery, formatQuery, fromBuilder, removeItem, stripPositions, toBuilder, updateGroup, type BGroup, type Leaf } from './builder'
import { parse, type Cmp, type DateExpr, type Node } from './parse'

const DOC_EXAMPLES = [...filtersDoc.matchAll(/```filter\n([\s\S]*?)```/g)].map((m) => m[1].trim())

/** The edge forms the Go parser's acceptance test lists (internal/filter/filter_test.go), minus the empty ones. */
const GO_EDGES = [
  '@work & due <= tomorrow & p1', '@errand | @call & p1', '(@errand | @call) & p1', 'due<=tomorrow',
  '#"Client A"', '@"follow up"', 'p1 & completed', 'completed | open', 'due = today', 'due <= today',
  '!!p1', '##Work & !(#Home | no project)', 'search:milk', 'search: "oat milk"', 'SEARCH: x',
  'created > 7 days ago', 'due before monday', 'due after 2026-02-28', 'P2', '@"a \\"quoted\\" name"',
  'no date | no time | no labels', '@Café & #プロジェクト',
  'deadline <= 3 days', '#Work & no deadline', 'deadline >= today & no date', 'deadline before friday',
  '@waiting & !someday', 'deferred & start <= 6 days', '#Home & evening', 'no start', 'start after 2026-10-20',
  'completed = last week', 'completed >= this month & p1', 'completed before yesterday', 'due = next week',
  'created = 2 months ago', 'deadline < 1 week ago', 'start <= next month', '!(completed > 3 weeks ago) | open',
  'completed', 'COMPLETED AFTER 2026-10-01',
  'cost > 100', 'client = "Acme"', '"Order date" <= friday & cost > 100', 'no cost', 'no "Order date"', 'done = true',
  'origin', 'no origin', 'origin: github', 'origin:github', 'origin: "my tracker"', 'origin: url | origin: email',
  'no origin & #Work', 'origin: github & open', '!origin',
  'paid = false', 'cost >= -2.5', 'status = Ordered', 'due_by <= 3 days', '"due" = 2026-10-16', 'no idea', 'kitchen = this week',
  // Nesting the parser keeps (it flattens only a & b & c, not (a & b) & c).
  '(a = 1 & p1) & p2', '(p1 | p2) | p3', '!(p1 & p2)', '!(p1 | p2) & !p3', 'tracked', 'tracked > 1h', 'tracked <= 90', 'tracked >= 1h30',
  '@"x|y" & #"a(b)" & search: "a & b"', 'search: \\', '@a\\b',
]

const same = (a: Node | null, b: Node | null) => expect(a && stripPositions(a)).toEqual(b && stripPositions(b))

/** A small seeded generator (mulberry32) so a failing tree reproduces. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = ['work', 'follow up', 'Café', 'a"b', 'x|y', 'p1', 'today', 'no', '#tag', 'back\\slash']
const CMPS: Cmp[] = ['<', '<=', '=', '>=', '>']

function randomTree(r: () => number, depth: number): Node {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
  if (depth < 3 && r() < 0.35) {
    const kind = pick(['and', 'or'] as const)
    const items = Array.from({ length: 2 + Math.floor(r() * 3) }, () => randomTree(r, depth + 1))
    return { kind, items }
  }
  if (r() < 0.15) return { kind: 'not', item: randomTree(r, depth + 1) }
  const dates: DateExpr[] = [
    { type: 'relative', days: 0 }, { type: 'relative', days: 1 }, { type: 'relative', days: -1 }, { type: 'relative', days: 5 },
    { type: 'relative', days: -12 }, { type: 'weekday', day: 3 }, { type: 'iso', date: '2026-02-28' },
    { type: 'period', unit: 'week', offset: 0 }, { type: 'period', unit: 'month', offset: -1 }, { type: 'period', unit: 'week', offset: 1 },
    { type: 'period', unit: 'month', offset: -3 },
  ]
  const leaves: (() => Leaf)[] = [
    () => ({ kind: 'label', name: pick(NAMES), pos: 0 }),
    () => ({ kind: 'project', name: pick(NAMES), descendants: r() < 0.5, pos: 0 }),
    () => ({ kind: 'priority', value: pick([1, 2, 3, 4] as const) }),
    () => ({ kind: 'date', field: pick(['due', 'created', 'deadline', 'start', 'completed'] as const), op: pick(CMPS), date: pick(dates) }),
    () => ({ kind: 'keyword', keyword: pick(['overdue', 'today', 'tomorrow', 'no date', 'no project', 'no labels', 'no time', 'no deadline', 'no start', 'someday', 'deferred', 'evening', 'completed', 'open', 'subtask', 'blocked', 'unblocked', 'habit', 'origin', 'no origin', 'tracked'] as const) }),
    () => ({ kind: 'search', text: pick(NAMES) }),
    () => ({ kind: 'origin', value: pick(['github', 'url', 'my tracker']) }),
    () => ({ kind: 'tracked', op: pick(CMPS), minutes: pick([0, 30, 60, 90, 125, 600]) }),
    () => ({ kind: 'field', name: pick(['cost', 'Order date', 'due', 'no', 'x"y']), op: pick(CMPS), value: pick([
      { type: 'number', value: 100 }, { type: 'number', value: -2.5 }, { type: 'bool', value: true },
      { type: 'text', value: 'Acme Inc' }, { type: 'text', value: 'today' }, { type: 'date', date: pick(dates) },
    ] as const), pos: 0, opPos: 0 }),
    () => ({ kind: 'nofield', name: pick(['cost', 'Order date', 'date']), pos: 0 }),
  ]
  return pick(leaves)()
}

describe('formatQuery', () => {
  it('round-trips every docs example and every Go edge form', () => {
    expect(DOC_EXAMPLES.length).toBeGreaterThanOrEqual(10)
    for (const q of [...DOC_EXAMPLES, ...GO_EDGES]) {
      const ast = parse(q)
      expect(ast, q).not.toBeNull()
      const text = formatQuery(ast!)
      same(parse(text), ast)
    }
  })

  it('round-trips 300 generated trees of every node kind', () => {
    const r = rng(20261023)
    for (let i = 0; i < 300; i++) {
      const tree = randomTree(r, 1)
      const text = formatQuery(tree)
      let back: Node | null
      try {
        back = parse(text)
      } catch (e) {
        throw new Error(`tree ${i}: ${text}: ${(e as Error).message}`)
      }
      same(back, tree)
    }
  })

  it('uses the fewest parentheses the precedence needs', () => {
    const f = (q: string) => formatQuery(parse(q)!)
    expect(f('((@work) & (due <= tomorrow)) & p1')).toBe('(@work & due <= tomorrow) & p1')
    expect(f('@work & (p1 | p2)')).toBe('@work & (p1 | p2)')
    expect(f('(@work & p1) | p2')).toBe('@work & p1 | p2')
    expect(f('!(@a | @b)')).toBe('!(@a | @b)')
    expect(f('!(@a)')).toBe('!@a')
    expect(f('tracked >= 90')).toBe('tracked >= 1h30')
    expect(f('@"follow up" & #Work')).toBe('@"follow up" & #Work')
    expect(f('search:milk')).toBe('search: milk')
  })

  it('writes the formatted fixtures the Go parser checks (internal/filter/testdata/formatted.txt)', () => {
    const r = rng(7)
    const lines = [...DOC_EXAMPLES, ...GO_EDGES].map((q) => formatQuery(parse(q)!))
    for (let i = 0; i < 100; i++) lines.push(formatQuery(randomTree(r, 1)))
    const want = '# Generated by web/src/lib/filter/builder.test.ts (UPDATE_FIXTURES=1); one formatted query per line.\n' + lines.join('\n') + '\n'
    const url = new URL('../../../../internal/filter/testdata/formatted.txt', import.meta.url)
    if (process.env.UPDATE_FIXTURES) writeFileSync(url, want)
    expect(readFileSync(url, 'utf8')).toBe(want)
  })
})

describe('builder model', () => {
  const build = (q: string) => toBuilder(parse(q))

  it('an empty query is an empty All of these, and an empty builder is an empty query', () => {
    const g = toBuilder(null)!
    expect(g).toMatchObject({ type: 'group', op: 'and', not: false, items: [] })
    expect(builderQuery(g)).toBe('')
  })

  it('a single leaf sits in a root All of these', () => {
    const g = build('p1')!
    expect(g.op).toBe('and')
    expect(g.items).toMatchObject([{ type: 'condition', not: false, leaf: { kind: 'priority', value: 1 } }])
    expect(builderQuery(g)).toBe('p1')
  })

  it('reads groups, Not on conditions and Not on groups', () => {
    const g = build('(@errand | @call) & !p4')!
    expect(g.op).toBe('and')
    expect(g.items[0]).toMatchObject({ type: 'group', op: 'or', not: false })
    expect(g.items[1]).toMatchObject({ type: 'condition', not: true, leaf: { kind: 'priority', value: 4 } })
    expect(build('!(@waiting | someday)')).toMatchObject({ op: 'or', not: true })
  })

  it('cannot show a double negation or a fourth level, and never rewrites them', () => {
    expect(build('!!p1')).toBeNull()
    expect(build('p1 & (p2 | (p3 & (@a | @b)))')).toBeNull()
    expect(build('p1 & (p2 | (p3 & @a))')).not.toBeNull()
  })

  it('formats back to the same text for every representable fixture', () => {
    for (const q of [...DOC_EXAMPLES, ...GO_EDGES]) {
      const ast = parse(q)!
      const g = toBuilder(ast)
      if (!g) continue
      expect(builderQuery(g), q).toBe(formatQuery(ast))
    }
  })

  it('drops empty groups and unwraps a one-item group, moving its Not', () => {
    let g = build('@work & (p1 | p2)')!
    const inner = g.items[1] as BGroup
    g = removeItem(g, inner.items[0].id)
    expect(builderQuery(g)).toBe('@work & p2')
    g = updateGroup(g, inner.id, (x) => ({ ...x, not: true }))
    expect(builderQuery(g)).toBe('@work & !p2')
    g = removeItem(g, (g.items[1] as BGroup).items[0].id)
    expect(builderQuery(g)).toBe('@work')
    // Not on a group around one negated condition cancels out rather than writing !!.
    const h = build('!(!p1)')
    expect(h).toBeNull()
    const k: BGroup = { type: 'group', id: 'r', not: false, op: 'and', items: [{ type: 'group', id: 'g', not: true, op: 'or', items: [{ type: 'condition', id: 'c', not: true, leaf: { kind: 'priority', value: 1 } }] }] }
    expect(fromBuilder(k)).toEqual({ kind: 'priority', value: 1 })
  })
})
