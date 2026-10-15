import { describe, expect, it } from 'vitest'
import filtersDoc from '../../../../docs/filters.md?raw'
import type { Label, Project, Task } from '../types'
import { compile, mentionsState, runFilter, type FilterContext } from './evaluate'
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
    expect(errorOf('no').message).toBe('Expected "date", "project", "labels", "time", "deadline" or "start" after "no" at position 1')
    expect(errorOf('no dates').expected).toEqual(['"date"', '"project"', '"labels"', '"time"', '"deadline"', '"start"'])
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

// ---- evaluation fixtures (today is Saturday 2026-10-10) ----

const TODAY = '2026-10-10'
/** Local-time Unix ms for a calendar date at noon. */
const at = (iso: string, hour = 12) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, hour).getTime()
}

function label(id: string, name: string, extra: Partial<Label> = {}): Label {
  return { id, name, color: '#000', position: 0, created_at: 0, deleted_at: null, _clock: {}, ...extra }
}
function project(id: string, name: string, parent_id: string | null = null, extra: Partial<Project> = {}): Project {
  return { id, name, color: '#000', position: 0, archived: false, parent_id, created_at: 0, deleted_at: null, _clock: {}, ...extra }
}
function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
    position: 0, created_at: at('2026-09-01'), completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}

const LABELS: Label[] = [
  label('l-errand', 'errand'),
  label('l-call', 'Call'),
  label('l-work', 'work'),
  label('l-follow', 'Follow Up'),
  label('l-errand2', 'Errand'), // duplicate name from a concurrent create on another device
  label('l-old', 'old', { deleted_at: 1 }),
]
const PROJECTS: Project[] = [
  project('p-work', 'Work'),
  project('p-client', 'Client A', 'p-work'),
  project('p-deep', 'Deep', 'p-client'),
  project('p-home', 'Home'),
  project('p-gone', 'Gone', null, { deleted_at: 1 }),
]
const TASKS: Task[] = [
  task('milk', { title: 'Buy oat milk', labels: ['l-errand'], priority: 1, due: { date: '2026-10-09' } }),
  task('call-mom', { title: 'Call mom', labels: ['l-call'], priority: 1, project_id: 'p-home', due: { date: '2026-10-10', time: '18:00' } }),
  task('report', { title: 'Write report', description: 'Quarterly OAT MILK numbers', labels: ['l-work'], priority: 1, project_id: 'p-work', due: { date: '2026-10-11' } }),
  task('client-mail', { title: 'Email client', labels: ['l-follow', 'l-work'], priority: 2, project_id: 'p-client', due: { date: '2026-10-16' } }),
  task('deep-task', { title: 'Deep thing', project_id: 'p-deep', priority: 3, created_at: at('2026-10-08') }),
  task('inbox-p1', { title: 'Inbox urgent', priority: 1, created_at: at('2026-10-04') }),
  task('hardware', { title: 'Hardware store', labels: ['l-errand2'], priority: 4, created_at: at('2026-10-03', 23) }),
  task('sub', { title: 'Sub step', parent_id: 'report', project_id: 'p-work', priority: 4 }),
  task('done-p1', { title: 'Done urgent', priority: 1, completed_at: at('2026-10-09'), project_id: 'p-work' }),
  task('deleted', { title: 'Deleted milk', priority: 1, deleted_at: at('2026-10-09'), labels: ['l-errand'] }),
  task('gone-label', { title: 'Old label only', labels: ['l-old'] }),
  task('future', { title: 'Far away', due: { date: '2026-12-01' }, created_at: at('2026-10-10', 8) }),
]

const CTX: FilterContext = { today: TODAY, labels: LABELS, projects: PROJECTS }

function ids(q: string, tasks: Task[] = TASKS, ctx: FilterContext = CTX): string[] {
  const r = runFilter(q, tasks, ctx)
  if (!r.ok) throw new Error(r.error)
  return r.tasks.map((t) => t.id).sort()
}
function warningsOf(q: string, ctx: FilterContext = CTX): string[] {
  const r = runFilter(q, TASKS, ctx)
  if (!r.ok) throw new Error(r.error)
  return r.warnings
}
const sorted = (...xs: string[]) => xs.sort()

describe('evaluate: labels and projects', () => {
  it('@name matches open tasks carrying a label of that name, ignoring case, any duplicate', () => {
    expect(ids('@errand')).toEqual(sorted('milk', 'hardware'))
    expect(ids('@ERRAND')).toEqual(sorted('milk', 'hardware'))
    expect(ids('@call')).toEqual(['call-mom'])
  })

  it('quoted names match names with spaces, ignoring case', () => {
    expect(ids('@"follow up"')).toEqual(['client-mail'])
    expect(ids('#"client a" & @"FOLLOW UP"')).toEqual(['client-mail'])
  })

  it('#name matches only that project, ##name includes every descendant', () => {
    expect(ids('#Work')).toEqual(sorted('report', 'sub'))
    expect(ids('##Work')).toEqual(sorted('report', 'sub', 'client-mail', 'deep-task'))
    expect(ids('##"Client A"')).toEqual(sorted('client-mail', 'deep-task'))
    expect(ids('##Deep')).toEqual(['deep-task'])
  })

  it('no project and no labels', () => {
    expect(ids('no project')).toEqual(sorted('milk', 'inbox-p1', 'hardware', 'gone-label', 'future'))
    expect(ids('no project & p1')).toEqual(sorted('milk', 'inbox-p1'))
    expect(ids('no labels')).toEqual(sorted('deep-task', 'inbox-p1', 'sub', 'future'))
  })

  it('a deleted label or project is an unknown name', () => {
    expect(ids('@old')).toEqual([])
    expect(warningsOf('@old')).toEqual(['No label named "old"'])
    expect(warningsOf('#Gone')).toEqual(['No project named "Gone"'])
  })

  it('picks up renames on the next evaluation', () => {
    const renamed = { ...CTX, labels: LABELS.map((l) => (l.id === 'l-call' ? { ...l, name: 'phone' } : l)) }
    expect(ids('@phone', TASKS, renamed)).toEqual(['call-mom'])
    expect(warningsOf('@call', renamed)).toEqual(['No label named "call"'])
  })

  it('grouping and negation from the spec', () => {
    expect(ids('(@errand | @call) & !#Work')).toEqual(sorted('milk', 'hardware', 'call-mom'))
    expect(ids('@errand | @call & p1')).toEqual(sorted('milk', 'hardware', 'call-mom'))
    expect(ids('(@errand | @call) & p1')).toEqual(sorted('milk', 'call-mom'))
  })
})

describe('evaluate: priority, state, subtask, search', () => {
  it('pN matches the priority, open tasks only by default', () => {
    expect(ids('p1')).toEqual(sorted('milk', 'call-mom', 'report', 'inbox-p1'))
    expect(ids('p2')).toEqual(['client-mail'])
    expect(ids('p3')).toEqual(['deep-task'])
  })

  it('completed alone means only completed; completed | open means both; open is explicit open', () => {
    expect(ids('p1 & completed')).toEqual(['done-p1'])
    expect(ids('completed')).toEqual(['done-p1'])
    expect(ids('p1 & (completed | open)')).toEqual(sorted('milk', 'call-mom', 'report', 'inbox-p1', 'done-p1'))
    expect(ids('p1 & open')).toEqual(ids('p1'))
    expect(ids('#Work & !open')).toEqual(['done-p1'])
    expect(ids('#Work & !completed')).toEqual(sorted('report', 'sub'))
  })

  it('mentionsState looks through every connective', () => {
    expect(mentionsState(parse('p1 & !(p2 | completed)')!)).toBe(true)
    expect(mentionsState(parse('p1 & !(p2 | overdue)')!)).toBe(false)
  })

  it('deleted tasks never match, not even with completed or a negation', () => {
    expect(ids('search: milk | completed | open')).not.toContain('deleted')
    expect(ids('!p4 | completed | open')).not.toContain('deleted')
  })

  it('subtask matches tasks with a parent', () => {
    expect(ids('subtask')).toEqual(['sub'])
    expect(ids('#Work & !subtask')).toEqual(['report'])
  })

  it('search: matches title or description as a case-insensitive substring', () => {
    expect(ids('search: "oat milk"')).toEqual(sorted('milk', 'report'))
    expect(ids('search: MOM')).toEqual(['call-mom'])
    expect(ids('search:quarterly')).toEqual(['report'])
    expect(ids('search: "nothing like this"')).toEqual([])
  })
})

describe('evaluate: dates', () => {
  it('due <= tomorrow includes overdue tasks and excludes undated ones', () => {
    expect(ids('due <= tomorrow')).toEqual(sorted('milk', 'call-mom', 'report'))
  })

  it('every comparison operator and the before / after words', () => {
    expect(ids('due < today')).toEqual(['milk'])
    expect(ids('due before today')).toEqual(['milk'])
    expect(ids('due = today')).toEqual(['call-mom'])
    expect(ids('due >= tomorrow')).toEqual(sorted('report', 'client-mail', 'future'))
    expect(ids('due > tomorrow')).toEqual(sorted('client-mail', 'future'))
    expect(ids('due after tomorrow')).toEqual(sorted('client-mail', 'future'))
    expect(ids('due before 2026-12-01')).toEqual(sorted('milk', 'call-mom', 'report', 'client-mail'))
    expect(ids('due = yesterday')).toEqual(['milk'])
    expect(ids('due <= 6 days')).toEqual(sorted('milk', 'call-mom', 'report', 'client-mail'))
  })

  it('weekday expression: due = friday on Saturday 2026-10-10 is 2026-10-16', () => {
    expect(ids('due = friday')).toEqual(['client-mail'])
    expect(ids('due = saturday')).toEqual(['call-mom'])
  })

  it('a task without a due date never matches a due comparison', () => {
    for (const op of ['<', '<=', '=', '>=', '>']) expect(ids(`due ${op} 2000-01-01 | due ${op} 2100-01-01`)).not.toContain('inbox-p1')
    // Only an explicit negation lets undated tasks in.
    expect(ids('!(due <= today) & no project')).toEqual(sorted('inbox-p1', 'hardware', 'gone-label', 'future'))
  })

  it('created compares the local calendar date of created_at', () => {
    // 7 days ago is 2026-10-03; "> 7 days ago" means created 10-04 or later.
    expect(ids('created > 7 days ago & no date')).toEqual(sorted('deep-task', 'inbox-p1'))
    expect(ids('created >= 7 days ago & no date')).toEqual(sorted('deep-task', 'inbox-p1', 'hardware'))
    expect(ids('created = 2026-10-03')).toEqual(['hardware'])
    expect(ids('created = today')).toEqual(['future'])
    expect(ids('created < 2026-10-03 & #Work')).toEqual(sorted('report', 'sub'))
    expect(ids('created <= 2026-10-03 & no project')).toEqual(sorted('milk', 'hardware', 'gone-label'))
  })

  it('keywords overdue, today, tomorrow, no date, no time', () => {
    expect(ids('overdue')).toEqual(['milk'])
    expect(ids('today')).toEqual(['call-mom'])
    expect(ids('tomorrow')).toEqual(['report'])
    expect(ids('no date')).toEqual(sorted('deep-task', 'inbox-p1', 'hardware', 'sub', 'gone-label'))
    expect(ids('no time')).toEqual(sorted('milk', 'report', 'client-mail', 'future'))
    expect(ids('today & !no time')).toEqual(['call-mom'])
  })

  it('today moves with the injected date', () => {
    expect(ids('today', TASKS, { ...CTX, today: '2026-10-11' })).toEqual(['report'])
    expect(ids('overdue', TASKS, { ...CTX, today: '2026-10-11' })).toEqual(sorted('milk', 'call-mom'))
  })
})

describe('evaluate: deadlines (OpenSpec deadlines 4.1)', () => {
  // Today is 2026-10-14 in these scenarios.
  const ctx: FilterContext = { ...CTX, today: '2026-10-14' }
  const DL: Task[] = [
    task('passed', { deadline: '2026-10-12', project_id: 'p-work' }),
    task('soon', { deadline: '2026-10-17', due: { date: '2026-10-15' } }),
    task('later', { deadline: '2026-10-30' }),
    task('unplanned', { deadline: '2026-10-14' }),
    task('none-work', { project_id: 'p-work' }),
    task('none-inbox', { due: { date: '2026-10-20' } }),
  ]
  it('deadline <= 3 days includes passed deadlines and never undated tasks', () => {
    expect(ids('deadline <= 3 days', DL, ctx)).toEqual(sorted('passed', 'soon', 'unplanned'))
    for (const op of ['<', '<=', '=', '>=', '>']) expect(ids(`deadline ${op} 2000-01-01 | deadline ${op} 2100-01-01`, DL, ctx)).not.toContain('none-work')
  })
  it('every comparison form works on deadlines', () => {
    expect(ids('deadline = today', DL, ctx)).toEqual(['unplanned'])
    expect(ids('deadline before today', DL, ctx)).toEqual(['passed'])
    expect(ids('deadline after 2026-10-20', DL, ctx)).toEqual(['later'])
    expect(ids('deadline = saturday', DL, ctx)).toEqual(['soon'])
  })
  it('#Work & no deadline', () => {
    expect(ids('#Work & no deadline', DL, ctx)).toEqual(['none-work'])
  })
  it('deadline >= today & no date: a deadline but no plan', () => {
    expect(ids('deadline >= today & no date', DL, ctx)).toEqual(sorted('later', 'unplanned'))
  })
  it('round-trips through printing', () => {
    expect(show('deadline<=7 days&no deadline')).toBe('(deadline <= 7 days & no deadline)')
  })
})

describe('evaluate: start, Someday and evening (OpenSpec someday-and-evening 4.1)', () => {
  const ctx: FilterContext = { ...CTX, today: '2026-10-14' }
  const L: Task[] = [
    task('wait-parked', { labels: ['l-call'], start: 'someday' }),
    task('wait-deferred', { labels: ['l-call'], start: '2026-10-18' }),
    task('wait-plain', { labels: ['l-call'] }),
    task('soon', { start: '2026-10-20' }),
    task('later', { start: '2026-10-25' }),
    task('started', { start: '2026-10-10' }),
    task('home-evening', { project_id: 'p-home', evening: true, due: { date: '2026-10-20' } }),
    task('home-day', { project_id: 'p-home' }),
  ]
  it('@call & !someday keeps deferred tasks', () => {
    expect(ids('@call & !someday', L, ctx)).toEqual(sorted('wait-deferred', 'wait-plain'))
  })
  it('deferred & start <= 6 days', () => {
    expect(ids('deferred & start <= 6 days', L, ctx)).toEqual(sorted('wait-deferred', 'soon'))
  })
  it('#Home & evening, whatever the date', () => {
    expect(ids('#Home & evening', L, ctx)).toEqual(['home-evening'])
  })
  it('someday, no start, and start never matching parked or empty starts', () => {
    expect(ids('someday', L, ctx)).toEqual(['wait-parked'])
    expect(ids('no start & @call', L, ctx)).toEqual(['wait-plain'])
    expect(ids('start < 2100-01-01', L, ctx)).not.toContain('wait-parked')
    expect(ids('start <= today', L, ctx)).toEqual(['started'])
  })
  it('round-trips through printing', () => {
    expect(show('someday|deferred&start>today')).toBe('(someday | (deferred & start > today))')
  })
})

describe('evaluate: warnings and graceful degradation', () => {
  it('unknown label warns and rest still matches', () => {
    const r = runFilter('@errands | p1', TASKS, CTX)
    expect(r).toMatchObject({ ok: true, warnings: ['No label named "errands"'] })
    expect(ids('@errands | p1')).toEqual(ids('p1'))
  })

  it('warns once per name, in query order, keeping the typed spelling', () => {
    expect(warningsOf('#Nope & @x | @x | #nope2')).toEqual(['No project named "Nope"', 'No label named "x"', 'No project named "nope2"'])
  })

  it('an unknown name evaluates to no match, so its negation matches everything else', () => {
    expect(ids('!@nothing & p1')).toEqual(ids('p1'))
  })

  it('no labels at all: label terms warn and match nothing', () => {
    const ctx = { ...CTX, labels: [] }
    expect(ids('@errand', TASKS, ctx)).toEqual([])
    expect(warningsOf('@errand', ctx)).toEqual(['No label named "errand"'])
  })

  it('without any hierarchy ## behaves like #', () => {
    const flat = { ...CTX, projects: PROJECTS.map((p) => ({ ...p, parent_id: null })) }
    expect(ids('##Work', TASKS, flat)).toEqual(ids('#Work', TASKS, flat))
  })

  it('a parent cycle among projects does not hang ##', () => {
    const cyc = { ...CTX, projects: [project('a', 'A', 'b'), project('b', 'B', 'a')] }
    const tasks = [task('ta', { project_id: 'a' }), task('tb', { project_id: 'b' })]
    expect(ids('##A', tasks, cyc)).toEqual(['ta', 'tb'])
  })

  it('empty query: no results, no warnings; syntax errors are returned with a position', () => {
    expect(runFilter('  ', TASKS, CTX)).toEqual({ ok: true, empty: true, tasks: [], warnings: [] })
    expect(runFilter('@errand &', TASKS, CTX)).toEqual({ ok: false, error: 'Expected a term after "&" at position 9', position: 9, offset: 8 })
  })

  it('compile is reusable across task lists', () => {
    const f = compile(parse('p1 & no project')!, CTX)
    expect(TASKS.filter(f.test).map((t) => t.id).sort()).toEqual(sorted('milk', 'inbox-p1'))
    expect(f.test(task('x', { priority: 1 }))).toBe(true)
  })
})

describe('evaluate: performance', () => {
  it('evaluates a 20-term query over 5,000 generated tasks in under 50 ms', () => {
    const labels = Array.from({ length: 30 }, (_, i) => label(`gl${i}`, `label${i}`))
    const projects = Array.from({ length: 40 }, (_, i) => project(`gp${i}`, `Project ${i}`, i >= 10 ? `gp${i % 10}` : null))
    const tasks = Array.from({ length: 5000 }, (_, i) => task(`g${i}`, {
      title: `Generated task number ${i} about ${i % 7 === 0 ? 'oat milk' : 'something'}`,
      description: i % 3 === 0 ? 'Some longer notes that the search term has to scan through' : '',
      project_id: i % 5 === 0 ? null : `gp${i % 40}`,
      parent_id: i % 9 === 0 && i > 0 ? `g${i - 1}` : null,
      priority: ((i % 4) + 1) as Task['priority'],
      due: i % 6 === 0 ? null : { date: resolveDate({ type: 'relative', days: (i % 40) - 20 }, TODAY), ...(i % 4 === 0 ? { time: '09:00' } : {}) },
      labels: i % 4 === 0 ? [] : [`gl${i % 30}`, `gl${(i * 7) % 30}`],
      created_at: at(resolveDate({ type: 'relative', days: -(i % 60) }, TODAY)),
      completed_at: i % 10 === 0 ? at(TODAY) : null,
    }))
    const query = [
      '(@label1 | @label2 | @"label3")',
      '(##"Project 1" | #"Project 2" | no project)',
      '!p4',
      '(due <= 14 days | no date | overdue)',
      '!(due = friday & p3)',
      '(created > 30 days ago | today | tomorrow)',
      '!subtask',
      '(search: milk | search: "longer notes" | no labels)',
      '!overdue',
    ].join(' & ')
    expect(countTerms(parse(query)!)).toBe(20)
    const ctx = { today: TODAY, labels, projects }
    runFilter(query, tasks, ctx) // warm-up (JIT)
    const start = performance.now()
    const r = runFilter(query, tasks, ctx)
    const ms = performance.now() - start
    expect(r.ok && r.tasks.length).toBeGreaterThan(0)
    expect(ms).toBeLessThan(50)
  })
})

describe('docs examples', () => {
  const blocks = [...filtersDoc.matchAll(/```filter\n([\s\S]*?)```/g)].map((m) => m[1].trim())

  it('docs/filters.md has at least ten worked examples and every one parses and evaluates', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(10)
    for (const q of blocks) {
      const r = runFilter(q, TASKS, CTX)
      expect(r.ok, `${q}: ${r.ok ? '' : r.error}`).toBe(true)
    }
  })

  it('the documented grammar examples in prose parse too', () => {
    for (const q of ['@work & due <= tomorrow & p1', '@errand | @call & p1', '(@errand | @call) & p1', 'due<=tomorrow', '#"Client A"', '@"follow up"', 'p1 & completed', 'completed | open', 'due = today', 'due <= today']) {
      expect(() => parse(q), q).not.toThrow()
    }
  })

  it('every row of the error table produces exactly the documented message', () => {
    const section = filtersDoc.slice(filtersDoc.indexOf('## Errors'), filtersDoc.indexOf('## The Filter view'))
    const rows = [...section.matchAll(/^\| `(.+?)` \| `(.+?)` \|$/gm)].map((m) => [m[1], m[2]].map((s) => s.replace(/\\\|/g, '|')))
    expect(rows.length).toBeGreaterThanOrEqual(5)
    for (const [q, msg] of rows) expect(errorOf(q).message, q).toBe(msg)
  })

  it('the date table matches the evaluator for Saturday 2026-10-10', () => {
    const d = (q: string) => resolveDate((parse(`due = ${q}`) as Extract<Node, { kind: 'date' }>).date, TODAY)
    expect([d('friday'), d('saturday'), d('3 days'), d('7 days ago')]).toEqual(['2026-10-16', '2026-10-10', '2026-10-13', '2026-10-03'])
  })
})

function countTerms(n: Node): number {
  if (n.kind === 'and' || n.kind === 'or') return n.items.reduce((s, x) => s + countTerms(x), 0)
  if (n.kind === 'not') return countTerms(n.item)
  return 1
}

describe('blocked and unblocked (task-dependencies)', () => {
  const tasks: Task[] = [
    task('confirm', { title: 'Confirm dates', due: { date: TODAY } }),
    task('flights', { title: 'Book flights', due: { date: TODAY }, blocked_by: ['confirm'] }),
    task('hotel', { title: 'Book hotel', blocked_by: ['done', 'gone', 'unknown'] }),
    task('done', { title: 'Old step', completed_at: at('2026-10-01') }),
    task('gone', { title: 'Removed step', deleted_at: at('2026-10-01') }),
    task('later', { title: 'Later', due: { date: '2026-10-20' } }),
  ]
  const ctx: FilterContext = { ...CTX, tasks }
  it('blocked lists open tasks with an open blocker only', () => {
    expect(ids('blocked', tasks, ctx)).toEqual(['flights'])
  })
  it('unblocked & today lists what can be done today', () => {
    expect(ids('unblocked & today', tasks, ctx)).toEqual(['confirm'])
  })
  it('a blocker completed elsewhere moves the task to unblocked on the next evaluation', () => {
    const after = tasks.map((t) => (t.id === 'confirm' ? { ...t, completed_at: at('2026-10-10') } : t))
    expect(ids('unblocked', after, { ...CTX, tasks: after })).toContain('flights')
    expect(ids('blocked', after, { ...CTX, tasks: after })).toEqual([])
  })
  it('round-trips through printQuery and warns without the task set', () => {
    for (const q of ['blocked & !unblocked', 'unblocked | @errand']) {
      const ast = parse(q)!
      expect(stripPos(parse(printQuery(ast))!)).toEqual(stripPos(ast))
    }
    expect(compile(parse('blocked')!, CTX).warnings).toEqual(['Blocked tasks cannot be told apart here'])
  })
})
