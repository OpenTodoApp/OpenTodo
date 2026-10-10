import { describe, expect, it } from 'vitest'
import { FilterSyntaxError, parse, printQuery, resolveDate, tokenize, type Node } from './parse'

/** Canonical, fully parenthesised form of a query. */
const show = (q: string): string => {
  const ast = parse(q)
  return ast ? printQuery(ast) : ''
}

/** The error a query throws, as { message, position }. */
function errorOf(q: string): { message: string; position: number; expected: string[] } {
  try {
    parse(q)
  } catch (e) {
    expect(e).toBeInstanceOf(FilterSyntaxError)
    const err = e as FilterSyntaxError
    return { message: err.message, position: err.position, expected: err.expected }
  }
  throw new Error(`expected "${q}" to fail`)
}

describe('tokenize', () => {
  it('tokenises labels, quoted names, connectives, negation, groups, projects and priority', () => {
    const toks = tokenize('@"follow up" & !(#Work | p1)').map(({ raw: _raw, ...t }) => t)
    expect(toks).toEqual([
      { type: 'label', name: 'follow up', pos: 0 },
      { type: 'and', pos: 13 },
      { type: 'not', pos: 15 },
      { type: 'lparen', pos: 16 },
      { type: 'project', name: 'Work', descendants: false, pos: 17 },
      { type: 'or', pos: 23 },
      { type: 'priority', value: 1, pos: 25 },
      { type: 'rparen', pos: 27 },
    ])
  })

  it('keeps raw source text for messages', () => {
    expect(tokenize('##"Client A"  &  P2').map((t) => t.raw)).toEqual(['##"Client A"', '&', 'P2'])
  })

  it('distinguishes # and ## and reads quoted project names', () => {
    expect(tokenize('##Work #"Client A"')).toMatchObject([
      { type: 'project', name: 'Work', descendants: true, pos: 0 },
      { type: 'project', name: 'Client A', descendants: false, pos: 7 },
    ])
  })

  it('splits comparison operators with and without spaces', () => {
    expect(tokenize('due<=tomorrow').map((t) => t.type)).toEqual(['word', 'cmp', 'word'])
    expect(tokenize('due <= tomorrow')[1]).toMatchObject({ type: 'cmp', op: '<=' })
    for (const op of ['<', '<=', '=', '>=', '>']) expect(tokenize(`created ${op} today`)[1]).toMatchObject({ type: 'cmp', op })
  })

  it('reads pN only for p1..p4, case-insensitively', () => {
    expect(tokenize('p1 P4 p5 p10')).toMatchObject([
      { type: 'priority', value: 1 }, { type: 'priority', value: 4 }, { type: 'word', value: 'p5' }, { type: 'word', value: 'p10' },
    ])
  })

  it('reads search text bare, quoted, with or without a space after the colon', () => {
    expect(tokenize('search: milk')).toMatchObject([{ type: 'search', text: 'milk', pos: 0 }])
    expect(tokenize('search:milk')).toMatchObject([{ type: 'search', text: 'milk' }])
    expect(tokenize('SEARCH: "oat milk" & p1')).toMatchObject([{ type: 'search', text: 'oat milk' }, { type: 'and', pos: 19 }, { type: 'priority' }])
    expect(tokenize('search: #tag')).toMatchObject([{ type: 'search', text: '#tag' }])
  })

  it('unescapes \\" and \\\\ in quoted strings', () => {
    expect(tokenize('@"say \\"hi\\" \\\\ bye"')).toMatchObject([{ type: 'label', name: 'say "hi" \\ bye' }])
  })

  it('allows non-operator punctuation and unicode in bare names', () => {
    expect(tokenize('@C#-dev_2 & #Café/Bar.1')).toMatchObject([
      { type: 'label', name: 'C#-dev_2' }, { type: 'and' }, { type: 'project', name: 'Café/Bar.1' },
    ])
  })

  it('ignores whitespace of any kind', () => {
    expect(tokenize(' \t@a\n&\r\n@b ').map((t) => t.type)).toEqual(['label', 'and', 'label'])
    expect(tokenize('   ')).toEqual([])
  })

  it('reports an unterminated quote and an empty name', () => {
    expect(() => tokenize('@"follow up')).toThrow('Missing closing quote for the text starting at position 2')
    expect(() => tokenize('p1 & @ & p2')).toThrow('Expected a label name after "@" at position 6')
    expect(() => tokenize('# Work')).toThrow('Expected a project name after "#" at position 1')
    expect(() => tokenize('##')).toThrow('Expected a project name after "##" at position 1')
    expect(() => tokenize('search:   ')).toThrow('Expected text after "search:" at position 1')
  })
})

describe('parse: precedence and grouping', () => {
  it('binds & tighter than |', () => {
    expect(show('@errand | @call & p1')).toBe('(@errand | (@call & p1))')
    expect(show('@a & @b | @c & @d')).toBe('((@a & @b) | (@c & @d))')
  })

  it('binds ! tighter than &', () => {
    expect(show('!@a & @b')).toBe('(!@a & @b)')
    expect(show('!!@a')).toBe('!!@a')
  })

  it('groups with parentheses and negates groups', () => {
    expect(show('(@errand | @call) & !#Work')).toBe('((@errand | @call) & !#Work)')
    expect(show('!(p1 | p2)')).toBe('!(p1 | p2)')
    expect(show('((p1))')).toBe('p1')
  })

  it('flattens chains of the same connective into one n-ary node', () => {
    const ast = parse('p1 | p2 | p3 | p4') as Extract<Node, { kind: 'or' }>
    expect(ast.kind).toBe('or')
    expect(ast.items).toHaveLength(4)
    expect(show('p1 & p2 & p3')).toBe('(p1 & p2 & p3)')
  })

  it('parses quoted names and keeps their case in the AST', () => {
    expect(parse('#"Client A" & @"follow up"')).toEqual({
      kind: 'and',
      items: [
        { kind: 'project', name: 'Client A', descendants: false, pos: 0 },
        { kind: 'label', name: 'follow up', pos: 14 },
      ],
    })
  })

  it('parses every term type', () => {
    expect(parse('@errand')).toEqual({ kind: 'label', name: 'errand', pos: 0 })
    expect(parse('##Work')).toEqual({ kind: 'project', name: 'Work', descendants: true, pos: 0 })
    expect(parse('p3')).toEqual({ kind: 'priority', value: 3 })
    expect(parse('search: "oat milk"')).toEqual({ kind: 'search', text: 'oat milk' })
    expect(parse('due <= tomorrow')).toEqual({ kind: 'date', field: 'due', op: '<=', date: { type: 'relative', days: 1 } })
    expect(parse('created > 7 days ago')).toEqual({ kind: 'date', field: 'created', op: '>', date: { type: 'relative', days: -7 } })
    expect(parse('due before 2026-12-01')).toEqual({ kind: 'date', field: 'due', op: '<', date: { type: 'iso', date: '2026-12-01' } })
    expect(parse('due after friday')).toEqual({ kind: 'date', field: 'due', op: '>', date: { type: 'weekday', day: 5 } })
    for (const k of ['overdue', 'today', 'tomorrow', 'completed', 'open', 'subtask']) expect(parse(k)).toEqual({ kind: 'keyword', keyword: k })
    for (const k of ['date', 'project', 'labels', 'time']) expect(parse(`no ${k}`)).toEqual({ kind: 'keyword', keyword: `no ${k}` })
  })

  it('ignores case of keywords, comparisons words and dates', () => {
    expect(show('NO DATE & Overdue | DUE Before TOMORROW & CREATED = Monday')).toBe('((no date & overdue) | (due < tomorrow & created = monday))')
  })

  it('returns null for an empty query', () => {
    expect(parse('')).toBeNull()
    expect(parse('   ')).toBeNull()
  })

  it('round-trips through printQuery', () => {
    for (const q of ['@errand | @call & p1', '#"Client A" & !@"follow up"', 'search: "a \\"b\\""', 'due >= 3 days & created < 2 days ago', '(no date | no time) & !subtask']) {
      const ast = parse(q)!
      expect(stripPos(parse(printQuery(ast))!)).toEqual(stripPos(ast))
    }
  })
})

/** printQuery does not preserve positions; compare structure only. */
function stripPos(n: Node): Node {
  return JSON.parse(JSON.stringify(n, (k, v) => (k === 'pos' ? undefined : v))) as Node
}
describe('parse: errors', () => {
  it('reports a missing term after a connective with its position', () => {
    expect(errorOf('@errand &')).toEqual({ message: 'Expected a term after "&" at position 9', position: 9, expected: ['term'] })
    expect(errorOf('p1 | ')).toMatchObject({ message: 'Expected a term after "|" at position 4', position: 4 })
    expect(errorOf('p1 & & p2').message).toBe('Expected a term after "&" at position 4')
    expect(errorOf('p1 & )').message).toBe('Expected a term after "&" at position 4')
    expect(errorOf('!').message).toBe('Expected a term after "!" at position 1')
    expect(errorOf('()').message).toBe('Expected a term after "(" at position 1')
  })

  it('reports a missing term at the start', () => {
    expect(errorOf('& p1')).toMatchObject({ message: 'Expected a term at position 1', position: 1 })
    expect(errorOf('  | p1').message).toBe('Expected a term at position 3')
  })

  it('reports an unmatched parenthesis', () => {
    expect(errorOf('(p1 | p2')).toMatchObject({ message: 'Missing ")" at end of query', position: 9, expected: ['")"'] })
    expect(errorOf('((p1) & p2').message).toBe('Missing ")" at end of query')
    expect(errorOf('p1 | p2)')).toMatchObject({ message: 'Unexpected ")" at position 8', position: 8 })
  })

  it('reports two terms without a connective', () => {
    expect(errorOf('@work p1')).toMatchObject({ message: 'Expected "&" or "|" before "p1" at position 7', expected: ['"&"', '"|"'] })
    expect(errorOf('(@work p1)').message).toBe('Expected "&", "|" or ")" before "p1" at position 8')
    expect(errorOf('search: oat milk').message).toBe('Expected "&" or "|" before "milk" at position 13')
  })

  it('reports unknown words, bad priorities and stray strings', () => {
    expect(errorOf('p1 & urgent')).toMatchObject({ message: 'Unknown term "urgent" at position 6', position: 6 })
    expect(errorOf('p5').message).toBe('Priority must be p1, p2, p3 or p4 at position 1')
    expect(errorOf('p0 | p1').message).toBe('Priority must be p1, p2, p3 or p4 at position 1')
    expect(errorOf('"milk"').message).toBe('Unexpected text "milk" at position 1; quote names after "@" or "#", or use search:')
    expect(errorOf('no').message).toBe('Expected "date", "project", "labels" or "time" after "no" at position 1')
    expect(errorOf('no dates').expected).toEqual(['"date"', '"project"', '"labels"', '"time"'])
  })

  it('reports incomplete date terms', () => {
    expect(errorOf('due')).toMatchObject({ message: 'Expected a comparison (<, <=, =, >=, >, before or after) after "due" at position 1' })
    expect(errorOf('due today').message).toBe('Expected a comparison (<, <=, =, >=, >, before or after) after "due" at position 1')
    expect(errorOf('p1 & created <=').message).toBe('Expected a date after "<=" at position 14')
    expect(errorOf('due < &').message).toBe('Expected a date after "<" at position 5')
    expect(errorOf('due = someday').message).toBe('Invalid date "someday" at position 7')
    expect(errorOf('due = 2026-02-30').message).toBe('Invalid date "2026-02-30" at position 7')
    expect(errorOf('due = 2026-1-3').message).toBe('Invalid date "2026-1-3" at position 7')
    expect(errorOf('due > 7').message).toBe('Expected "days" after "7" at position 7')
    expect(errorOf('due > 7 day').message).toBe('Expected "days" after "7" at position 7')
    expect(errorOf('due > 7 days ago ago').message).toBe('Expected "&" or "|" before "ago" at position 18')
  })
})

describe('date expressions', () => {
  // Saturday.
  const today = '2026-10-10'
  const d = (q: string) => {
    const ast = parse(`due = ${q}`) as Extract<Node, { kind: 'date' }>
    return resolveDate(ast.date, today)
  }

  it('resolves today, tomorrow and yesterday', () => {
    expect(d('today')).toBe('2026-10-10')
    expect(d('tomorrow')).toBe('2026-10-11')
    expect(d('yesterday')).toBe('2026-10-09')
  })

  it('resolves a weekday to its next occurrence, today included', () => {
    expect(d('friday')).toBe('2026-10-16')
    expect(d('saturday')).toBe('2026-10-10')
    expect(d('sunday')).toBe('2026-10-11')
    expect(d('Monday')).toBe('2026-10-12')
  })

  it('resolves ISO dates and N days / N days ago, across month and year ends', () => {
    expect(d('2026-12-01')).toBe('2026-12-01')
    expect(d('0 days')).toBe('2026-10-10')
    expect(d('30 days')).toBe('2026-11-09')
    expect(d('7 days ago')).toBe('2026-10-03')
    expect(resolveDate({ type: 'relative', days: 1 }, '2026-12-31')).toBe('2027-01-01')
    expect(resolveDate({ type: 'relative', days: 1 }, '2028-02-28')).toBe('2028-02-29')
    expect(resolveDate({ type: 'weekday', day: 1 }, '2026-12-29')).toBe('2027-01-04')
  })
})
