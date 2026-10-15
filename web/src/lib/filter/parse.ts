// Filter query language (OpenSpec change `filter-query-language`): tokenizer,
// recursive-descent parser and date expressions. Pure and dependency-free; the
// grammar is documented in docs/filters.md and this file accepts exactly it.
//
//   query   := or
//   or      := and ( "|" and )*
//   and     := not ( "&" not )*
//   not     := "!" not | "(" or ")" | term
//   term    := "@" name | "##" name | "#" name | "p1".."p4"
//            | ("due" | "created" | "deadline" | "start") cmp date | keyword | "search:" text
//
// Positions in messages are 1-based character columns; `FilterSyntaxError.offset`
// is the matching 0-based offset for editors.

// ---- tokens ----

export type Cmp = '<' | '<=' | '=' | '>=' | '>'

export type Token =
  | { type: 'and' | 'or' | 'not' | 'lparen' | 'rparen'; pos: number; raw: string }
  | { type: 'cmp'; op: Cmp; pos: number; raw: string }
  | { type: 'label'; name: string; pos: number; raw: string }
  | { type: 'project'; name: string; descendants: boolean; pos: number; raw: string }
  | { type: 'priority'; value: Priority; pos: number; raw: string }
  | { type: 'search'; text: string; pos: number; raw: string }
  | { type: 'word'; value: string; pos: number; raw: string }
  | { type: 'string'; value: string; pos: number; raw: string }

export type Priority = 1 | 2 | 3 | 4

/** A syntax error with a 0-based offset, a 1-based column and the set of things that were expected. */
export class FilterSyntaxError extends Error {
  constructor(message: string, public offset: number, public expected: string[] = []) {
    super(message)
    this.name = 'FilterSyntaxError'
  }
  /** 1-based column, as shown in the message. */
  get position(): number {
    return this.offset + 1
  }
}

const SINGLE: Record<string, 'and' | 'or' | 'not' | 'lparen' | 'rparen'> = { '&': 'and', '|': 'or', '!': 'not', '(': 'lparen', ')': 'rparen' }
/** Characters that end a bare word: whitespace, quotes, connectives, parentheses and comparison operators. */
const BREAK = /[\s"&|!()<>=]/

function isSpace(c: string): boolean {
  return /\s/.test(c)
}

/** Split a query into tokens. Throws FilterSyntaxError for a bad prefix or an unterminated string. */
export function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  const n = src.length

  const readBare = (): string => {
    const start = i
    while (i < n && !BREAK.test(src[i])) i++
    return src.slice(start, i)
  }
  const readString = (): string => {
    // src[i] is the opening quote. Backslash escapes the next character (\" and \\).
    const start = i
    i++
    let s = ''
    while (i < n && src[i] !== '"') {
      if (src[i] === '\\' && i + 1 < n) i++
      s += src[i++]
    }
    if (i >= n) throw new FilterSyntaxError(`Missing closing quote for the text starting at position ${start + 1}`, start, ['"'])
    i++
    return s
  }
  const readName = (what: string, after: string, at: number): string => {
    if (i < n && src[i] === '"') return readString()
    const name = readBare()
    if (!name) throw new FilterSyntaxError(`Expected a ${what} name after "${after}" at position ${at + 1}`, at, [`${what} name`])
    return name
  }

  while (i < n) {
    const c = src[i]
    if (isSpace(c)) {
      i++
      continue
    }
    const pos = i
    if (SINGLE[c]) {
      i++
      out.push({ type: SINGLE[c], pos, raw: c })
      continue
    }
    if (c === '<' || c === '>' || c === '=') {
      const op = (c !== '=' && src[i + 1] === '=' ? c + '=' : c) as Cmp
      i += op.length
      out.push({ type: 'cmp', op, pos, raw: op })
      continue
    }
    if (c === '@') {
      i++
      const name = readName('label', '@', pos)
      out.push({ type: 'label', name, pos, raw: src.slice(pos, i) })
      continue
    }
    if (c === '#') {
      const descendants = src[i + 1] === '#'
      i += descendants ? 2 : 1
      const name = readName('project', descendants ? '##' : '#', pos)
      out.push({ type: 'project', name, descendants, pos, raw: src.slice(pos, i) })
      continue
    }
    if (c === '"') {
      const value = readString()
      out.push({ type: 'string', value, pos, raw: src.slice(pos, i) })
      continue
    }
    const word = readBare()
    if (/^search:/i.test(word)) {
      // `search:text`, `search: text` or `search: "several words"`.
      let text = word.slice('search:'.length)
      if (!text) {
        while (i < n && isSpace(src[i])) i++
        if (i < n && src[i] === '"') text = readString()
        else text = readBare()
      }
      if (!text) throw new FilterSyntaxError(`Expected text after "search:" at position ${pos + 1}`, pos, ['text'])
      out.push({ type: 'search', text, pos, raw: src.slice(pos, i) })
      continue
    }
    const pm = /^p([1-4])$/i.exec(word)
    if (pm) {
      out.push({ type: 'priority', value: Number(pm[1]) as Priority, pos, raw: word })
      continue
    }
    out.push({ type: 'word', value: word, pos, raw: word })
  }
  return out
}

// ---- AST ----

export type Keyword = 'overdue' | 'today' | 'tomorrow' | 'no date' | 'no project' | 'no labels' | 'no time' | 'no deadline' | 'no start' | 'someday' | 'deferred' | 'evening' | 'completed' | 'open' | 'subtask' | 'blocked' | 'unblocked' | 'habit'

/** today = 0, tomorrow = 1, yesterday = -1, `N days` = N, `N days ago` = -N. */
export type DateExpr =
  | { type: 'relative'; days: number }
  | { type: 'weekday'; day: number }
  | { type: 'iso'; date: string }

export type Node =
  | { kind: 'or'; items: Node[] }
  | { kind: 'and'; items: Node[] }
  | { kind: 'not'; item: Node }
  | { kind: 'label'; name: string; pos: number }
  | { kind: 'project'; name: string; descendants: boolean; pos: number }
  | { kind: 'priority'; value: Priority }
  | { kind: 'date'; field: 'due' | 'created' | 'deadline' | 'start'; op: Cmp; date: DateExpr }
  | { kind: 'keyword'; keyword: Keyword }
  | { kind: 'search'; text: string }

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const SIMPLE_KEYWORDS = new Set<Keyword>(['overdue', 'today', 'tomorrow', 'completed', 'open', 'subtask', 'someday', 'deferred', 'evening', 'blocked', 'unblocked', 'habit'])
const NO_KEYWORDS = ['date', 'project', 'labels', 'time', 'deadline', 'start'] as const
const CMP_EXPECTED = ['"<"', '"<="', '"="', '">="', '">"', '"before"', '"after"']

// ---- parser ----

/** Parse a query. Returns null for an empty (whitespace-only) query; throws FilterSyntaxError otherwise. */
export function parse(src: string): Node | null {
  const tokens = tokenize(src)
  if (tokens.length === 0) return null
  let i = 0
  const end = src.length

  const peek = (): Token | undefined => tokens[i]
  const lower = (t: Token | undefined): string => (t && t.type === 'word' ? t.value.toLowerCase() : '')
  const fail = (message: string, offset: number, expected: string[]): never => {
    throw new FilterSyntaxError(message, offset, expected)
  }
  /** Error for a missing term; `prev` is the operator or parenthesis just consumed, if any. */
  const missingTerm = (prev: Token | undefined): never => {
    const t = peek()
    if (prev) return fail(`Expected a term after "${prev.raw}" at position ${prev.pos + 1}`, prev.pos, ['term'])
    return fail(`Expected a term at position ${(t ? t.pos : end) + 1}`, t ? t.pos : end, ['term'])
  }

  /** `prev` is the "(" that opened this group, so an immediately missing term reports it. */
  function parseOr(prev: Token | undefined): Node {
    const items = [parseAnd(prev)]
    while (peek()?.type === 'or') {
      const op = tokens[i++]
      items.push(parseAnd(op))
    }
    return items.length === 1 ? items[0] : { kind: 'or', items }
  }

  function parseAnd(prev: Token | undefined): Node {
    const items = [parseNot(prev)]
    while (peek()?.type === 'and') {
      const op = tokens[i++]
      items.push(parseNot(op))
    }
    return items.length === 1 ? items[0] : { kind: 'and', items }
  }

  function parseNot(prev: Token | undefined): Node {
    const t = peek()
    if (!t) return missingTerm(prev)
    if (t.type === 'not') {
      i++
      return { kind: 'not', item: parseNot(t) }
    }
    if (t.type === 'lparen') {
      i++
      const inner = parseOr(t)
      const close = peek()
      if (!close) return fail('Missing ")" at end of query', end, ['")"'])
      if (close.type !== 'rparen') return fail(`Expected "&", "|" or ")" before "${close.raw}" at position ${close.pos + 1}`, close.pos, ['"&"', '"|"', '")"'])
      i++
      return inner
    }
    return parseTerm(prev)
  }

  function parseTerm(prev: Token | undefined): Node {
    const t = peek()!
    switch (t.type) {
      case 'label':
        i++
        return { kind: 'label', name: t.name, pos: t.pos }
      case 'project':
        i++
        return { kind: 'project', name: t.name, descendants: t.descendants, pos: t.pos }
      case 'priority':
        i++
        return { kind: 'priority', value: t.value }
      case 'search':
        i++
        return { kind: 'search', text: t.text }
      case 'word':
        return parseWordTerm(t)
      case 'string':
        return fail(`Unexpected text ${t.raw} at position ${t.pos + 1}; quote names after "@" or "#", or use search:`, t.pos, ['term'])
      default:
        return missingTerm(prev)
    }
  }

  function parseWordTerm(t: Extract<Token, { type: 'word' }>): Node {
    const w = t.value.toLowerCase()
    i++
    if (w === 'due' || w === 'created' || w === 'deadline' || w === 'start') {
      const c = peek()
      let op: Cmp | null = null
      if (c?.type === 'cmp') op = c.op
      else if (lower(c) === 'before') op = '<'
      else if (lower(c) === 'after') op = '>'
      if (!op || !c) return fail(`Expected a comparison (<, <=, =, >=, >, before or after) after "${t.raw}" at position ${t.pos + 1}`, t.pos, CMP_EXPECTED)
      i++
      return { kind: 'date', field: w, op, date: parseDate(c) }
    }
    if (w === 'no') {
      const next = lower(peek())
      if (!(NO_KEYWORDS as readonly string[]).includes(next)) {
        return fail(`Expected "date", "project", "labels", "time", "deadline" or "start" after "no" at position ${t.pos + 1}`, t.pos, NO_KEYWORDS.map((k) => `"${k}"`))
      }
      i++
      return { kind: 'keyword', keyword: `no ${next}` as Keyword }
    }
    if (SIMPLE_KEYWORDS.has(w as Keyword)) return { kind: 'keyword', keyword: w as Keyword }
    if (/^p\d+$/.test(w)) return fail(`Priority must be p1, p2, p3 or p4 at position ${t.pos + 1}`, t.pos, ['"p1"', '"p2"', '"p3"', '"p4"'])
    return fail(`Unknown term "${t.raw}" at position ${t.pos + 1}`, t.pos, ['term'])
  }

  function parseDate(after: Token): DateExpr {
    const t = peek()
    if (!t || t.type !== 'word') {
      return fail(`Expected a date after "${after.raw}" at position ${after.pos + 1}`, after.pos, ['date'])
    }
    const w = t.value.toLowerCase()
    i++
    if (w === 'today') return { type: 'relative', days: 0 }
    if (w === 'tomorrow') return { type: 'relative', days: 1 }
    if (w === 'yesterday') return { type: 'relative', days: -1 }
    const wd = (WEEKDAYS as readonly string[]).indexOf(w)
    if (wd >= 0) return { type: 'weekday', day: wd }
    if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
      if (!validISO(w)) return fail(`Invalid date "${t.raw}" at position ${t.pos + 1}`, t.pos, ['date'])
      return { type: 'iso', date: w }
    }
    if (/^\d+$/.test(w)) {
      const days = Number(w)
      if (lower(peek()) !== 'days') {
        return fail(`Expected "days" after "${t.raw}" at position ${t.pos + 1}`, t.pos, ['"days"'])
      }
      i++
      if (lower(peek()) === 'ago') {
        i++
        return { type: 'relative', days: -days }
      }
      return { type: 'relative', days }
    }
    return fail(`Invalid date "${t.raw}" at position ${t.pos + 1}`, t.pos, ['date'])
  }

  const ast = parseOr(undefined)
  const rest = peek()
  if (rest) {
    if (rest.type === 'rparen') fail(`Unexpected ")" at position ${rest.pos + 1}`, rest.pos, ['"&"', '"|"'])
    fail(`Expected "&" or "|" before "${rest.raw}" at position ${rest.pos + 1}`, rest.pos, ['"&"', '"|"'])
  }
  return ast
}

function validISO(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

// ---- dates ----

/** Add days to a floating YYYY-MM-DD date (calendar arithmetic, no time zone involved). */
export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Day of week of a floating date, 0 = Sunday. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Resolve a date expression against the viewer's local calendar date `today` (YYYY-MM-DD). */
export function resolveDate(expr: DateExpr, today: string): string {
  switch (expr.type) {
    case 'iso':
      return expr.date
    case 'relative':
      return shiftISO(today, expr.days)
    case 'weekday':
      // Next occurrence, today included.
      return shiftISO(today, (expr.day - weekdayOf(today) + 7) % 7)
  }
}

// ---- printing (tests, debugging, future saved views) ----

function quote(name: string): string {
  return BREAK.test(name) || name === '' ? `"${name.replace(/["\\]/g, (c) => '\\' + c)}"` : name
}

function printDate(d: DateExpr): string {
  if (d.type === 'iso') return d.date
  if (d.type === 'weekday') return WEEKDAYS[d.day]
  if (d.days === 0) return 'today'
  if (d.days === 1) return 'tomorrow'
  if (d.days === -1) return 'yesterday'
  return d.days < 0 ? `${-d.days} days ago` : `${d.days} days`
}

/** Canonical text with every compound expression parenthesised; re-parses to the same AST. */
export function printQuery(n: Node): string {
  switch (n.kind) {
    case 'or':
    case 'and':
      return `(${n.items.map(printQuery).join(n.kind === 'or' ? ' | ' : ' & ')})`
    case 'not':
      return `!${printQuery(n.item)}`
    case 'label':
      return `@${quote(n.name)}`
    case 'project':
      return `${n.descendants ? '##' : '#'}${quote(n.name)}`
    case 'priority':
      return `p${n.value}`
    case 'date':
      return `${n.field} ${n.op} ${printDate(n.date)}`
    case 'keyword':
      return n.keyword
    case 'search':
      return `search: ${quote(n.text)}`
  }
}
