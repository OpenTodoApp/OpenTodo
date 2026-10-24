import { t } from '../i18n'
import { durationMinutes } from '../time'
// Filter query language (OpenSpec change `filter-query-language`): tokenizer,
// recursive-descent parser and date expressions. Pure and dependency-free; the
// grammar is documented in docs/filters.md and this file accepts exactly it.
//
//   query   := or
//   or      := and ( "|" and )*
//   and     := not ( "&" not )*
//   not     := "!" not | "(" or ")" | term
//   term    := "@" name | "##" name | "#" name | "p1".."p4"
//            | ("due" | "created" | "deadline" | "start" | "completed") cmp date | keyword | "search:" text
//            | "origin:" value                        (task origins, OpenSpec task-origin)
//            | "workspace:" name                      (workspaces, OpenSpec group-mentions)
//            | "tracked" cmp duration                 (tracked time, OpenSpec time-tracking)
//            | field cmp value | "no" field          (custom fields, OpenSpec custom-fields)
//   date    := day | period   (a day is a period of one day; see resolveRange)
//   field   := a word that is not a reserved word | '"' chars '"'
//   value   := number | "true" | "false" | date | word | '"' chars '"'
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
  | { type: 'origin'; value: string; pos: number; raw: string }
  | { type: 'workspace'; name: string; pos: number; raw: string }
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
    if (i >= n) throw new FilterSyntaxError(t('Missing closing quote for the text starting at position {pos}', { pos: start + 1 }), start, ['"'])
    i++
    return s
  }
  const readName = (what: string, after: string, at: number): string => {
    if (i < n && src[i] === '"') return readString()
    const name = readBare()
    if (!name) throw new FilterSyntaxError((what === 'label' ? t('Expected a label name after "{after}" at position {pos}', { after, pos: at + 1 }) : t('Expected a project name after "{after}" at position {pos}', { after, pos: at + 1 })), at, [`${what} name`])
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
    // `search:text`, `search: text` or `search: "several words"`; `origin:` alike (task-origin).
    const readPrefixed = (prefix: string): string => {
      const text = word.slice(prefix.length)
      if (text) return text
      while (i < n && isSpace(src[i])) i++
      return i < n && src[i] === '"' ? readString() : readBare()
    }
    if (/^search:/i.test(word)) {
      const text = readPrefixed('search:')
      if (!text) throw new FilterSyntaxError(t('Expected text after "search:" at position {pos}', { pos: pos + 1 }), pos, ['text'])
      out.push({ type: 'search', text, pos, raw: src.slice(pos, i) })
      continue
    }
    if (/^workspace:/i.test(word)) {
      const name = readPrefixed('workspace:')
      if (!name) throw new FilterSyntaxError(t('Expected a workspace name after "workspace:" at position {pos}', { pos: pos + 1 }), pos, ['workspace name'])
      out.push({ type: 'workspace', name, pos, raw: src.slice(pos, i) })
      continue
    }
    if (/^origin:/i.test(word)) {
      const value = readPrefixed('origin:')
      if (!value) throw new FilterSyntaxError(t('Expected a provider or kind after "origin:" at position {pos}', { pos: pos + 1 }), pos, ['origin'])
      out.push({ type: 'origin', value, pos, raw: src.slice(pos, i) })
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

export type Keyword = 'overdue' | 'today' | 'tomorrow' | 'no date' | 'no project' | 'no labels' | 'no time' | 'no deadline' | 'no start' | 'someday' | 'deferred' | 'evening' | 'completed' | 'open' | 'subtask' | 'blocked' | 'unblocked' | 'habit' | 'origin' | 'no origin' | 'tracked'

/**
 * today = 0, tomorrow = 1, yesterday = -1, `N days` = N, `N days ago` = -N.
 * A period (OpenSpec change `completed-date-filters`, design D1) is a calendar week
 * or month relative to the current one: this = 0, last = -1, next = 1, `N weeks ago` = -N.
 */
export type DateExpr =
  | { type: 'relative'; days: number }
  | { type: 'weekday'; day: number }
  | { type: 'iso'; date: string }
  | { type: 'period'; unit: 'week' | 'month'; offset: number }

export type DateField = 'due' | 'created' | 'deadline' | 'start' | 'completed'

export type Node =
  | { kind: 'or'; items: Node[] }
  | { kind: 'and'; items: Node[] }
  | { kind: 'not'; item: Node }
  | { kind: 'label'; name: string; pos: number }
  | { kind: 'project'; name: string; descendants: boolean; pos: number }
  | { kind: 'priority'; value: Priority }
  | { kind: 'date'; field: DateField; op: Cmp; date: DateExpr }
  | { kind: 'keyword'; keyword: Keyword }
  | { kind: 'search'; text: string }
  /** `origin: value`: the origin's provider, else its kind, equals value ignoring case (task-origin). */
  | { kind: 'origin'; value: string }
  /** `workspace: name`: the task's workspace has that name, ignoring case (group-mentions D6). */
  | { kind: 'workspace'; name: string; pos: number }
  /** `name cmp value` over a custom field (custom-fields); `opPos` places type errors. */
  | { kind: 'field'; name: string; op: Cmp; value: FieldValueExpr; pos: number; opPos: number }
  /** `no name`: a project defining the field, no value. */
  | { kind: 'nofield'; name: string; pos: number }
  /** `tracked cmp duration`: the task's tracked minutes (time-tracking D9). */
  | { kind: 'tracked'; op: Cmp; minutes: number }

/** The right-hand side of a field term; the field's type decides how it compares. */
export type FieldValueExpr =
  | { type: 'number'; value: number }
  | { type: 'bool'; value: boolean }
  | { type: 'text'; value: string }
  | { type: 'date'; date: DateExpr }

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const SIMPLE_KEYWORDS = new Set<Keyword>(['overdue', 'today', 'tomorrow', 'completed', 'open', 'subtask', 'someday', 'deferred', 'evening', 'blocked', 'unblocked', 'habit', 'origin'])
const NO_KEYWORDS = ['date', 'project', 'labels', 'time', 'deadline', 'start', 'origin'] as const
/** Words that start a date expression in a field term's value; a number starts one only before a unit. */
const DATE_STARTS = new Set(['today', 'tomorrow', 'yesterday', 'this', 'last', 'next'])
const DATE_UNITS = new Set(['days', 'week', 'weeks', 'month', 'months'])
const CMP_EXPECTED =['"<"', '"<="', '"="', '">="', '">"', '"before"', '"after"']

// ---- parser ----

/** Parse a query. Returns null for an empty (whitespace-only) query; throws FilterSyntaxError otherwise. */
export function parse(src: string): Node | null {
  const tokens = tokenize(src)
  if (tokens.length === 0) return null
  let i = 0
  const end = src.length

  const peek = (): Token | undefined => tokens[i]
  const lower = (tok: Token | undefined): string => (tok && tok.type === 'word' ? tok.value.toLowerCase() : '')
  const fail = (message: string, offset: number, expected: string[]): never => {
    throw new FilterSyntaxError(message, offset, expected)
  }
  /** Error for a missing term; `prev` is the operator or parenthesis just consumed, if any. */
  const missingTerm = (prev: Token | undefined): never => {
    const token = peek()
    if (prev) return fail(t('Expected a term after "{after}" at position {pos}', { after: prev.raw, pos: prev.pos + 1 }), prev.pos, ['term'])
    return fail(t('Expected a term at position {pos}', { pos: (token ? token.pos : end) + 1 }), token ? token.pos : end, ['term'])
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
    const tok = peek()
    if (!tok) return missingTerm(prev)
    if (tok.type === 'not') {
      i++
      return { kind: 'not', item: parseNot(tok) }
    }
    if (tok.type === 'lparen') {
      i++
      const inner = parseOr(tok)
      const close = peek()
      if (!close) return fail(t('Missing ")" at end of query'), end, ['")"'])
      if (close.type !== 'rparen') return fail(t('Expected "&", "|" or ")" before "{before}" at position {pos}', { before: close.raw, pos: close.pos + 1 }), close.pos, ['"&"', '"|"', '")"'])
      i++
      return inner
    }
    return parseTerm(prev)
  }

  function parseTerm(prev: Token | undefined): Node {
    const tok = peek()!
    switch (tok.type) {
      case 'label':
        i++
        return { kind: 'label', name: tok.name, pos: tok.pos }
      case 'project':
        i++
        return { kind: 'project', name: tok.name, descendants: tok.descendants, pos: tok.pos }
      case 'priority':
        i++
        return { kind: 'priority', value: tok.value }
      case 'search':
        i++
        return { kind: 'search', text: tok.text }
      case 'origin':
        i++
        return { kind: 'origin', value: tok.value }
      case 'workspace':
        i++
        return { kind: 'workspace', name: tok.name, pos: tok.pos }
      case 'word':
        return parseWordTerm(tok)
      case 'string':
        // A quoted name followed by a comparison is a field term (custom-fields).
        if (tokens[i + 1]?.type === 'cmp') {
          i++
          return parseFieldTerm(tok.value, tok.pos)
        }
        return fail(t('Unexpected text {text} at position {pos}; quote names after "@" or "#", or use search:', { text: tok.raw, pos: tok.pos + 1 }), tok.pos, ['term'])
      default:
        return missingTerm(prev)
    }
  }

  function parseWordTerm(entry: Extract<Token, { type: 'word' }>): Node {
    const w = entry.value.toLowerCase()
    i++
    // `completed` is the state keyword unless a comparison follows (completed-date-filters D3).
    const dated = w === 'completed' && (peek()?.type === 'cmp' || lower(peek()) === 'before' || lower(peek()) === 'after')
    if (w === 'due' || w === 'created' || w === 'deadline' || w === 'start' || dated) {
      const c = peek()
      let op: Cmp | null = null
      if (c?.type === 'cmp') op = c.op
      else if (lower(c) === 'before') op = '<'
      else if (lower(c) === 'after') op = '>'
      if (!op || !c) return fail(t('Expected a comparison (<, <=, =, >=, >, before or after) after "{after}" at position {pos}', { after: entry.raw, pos: entry.pos + 1 }), entry.pos, CMP_EXPECTED)
      i++
      return { kind: 'date', field: w, op, date: parseDate(c) }
    }
    // Tracked time (time-tracking D9): the keyword, or `tracked cmp duration`. A
    // reserved word: a field named "tracked" is reachable only quoted.
    if (w === 'tracked') {
      const c = peek()
      if (c?.type !== 'cmp') return { kind: 'keyword', keyword: 'tracked' }
      i++
      const v = peek()
      const message = (pos: number) => t('Expected a duration such as 30m or 1h30 after "{after}" at position {pos}', { after: c.raw, pos: pos + 1 })
      if (!v || v.type !== 'word') return fail(message(c.pos), c.pos, ['duration'])
      const minutes = durationMinutes(v.value)
      if (minutes === null) return fail(message(v.pos), v.pos, ['duration'])
      i++
      return { kind: 'tracked', op: c.op, minutes }
    }
    if (w === 'no') {
      const nt = peek()
      const next = lower(nt)
      if ((NO_KEYWORDS as readonly string[]).includes(next)) {
        i++
        return { kind: 'keyword', keyword: `no ${next}` as Keyword }
      }
      // Any other name is a custom field without a value (custom-fields).
      if (nt && (nt.type === 'word' || nt.type === 'string')) {
        i++
        return { kind: 'nofield', name: nt.value, pos: nt.pos }
      }
      return fail(t('Expected "date", "project", "labels", "time", "deadline", "start", "origin" or a field name after "no" at position {pos}', { pos: entry.pos + 1 }), entry.pos, [...NO_KEYWORDS.map((k) => `"${k}"`), 'field name'])
    }
    if (SIMPLE_KEYWORDS.has(w as Keyword)) return { kind: 'keyword', keyword: w as Keyword }
    if (/^p\d+$/.test(w)) return fail(t('Priority must be p1, p2, p3 or p4 at position {pos}', { pos: entry.pos + 1 }), entry.pos, ['"p1"', '"p2"', '"p3"', '"p4"'])
    // Any other word followed by a comparison names a custom field (custom-fields).
    if (peek()?.type === 'cmp') return parseFieldTerm(entry.value, entry.pos)
    return fail(t('Unknown term "{term}" at position {pos}', { term: entry.raw, pos: entry.pos + 1 }), entry.pos, ['term'])
  }

  /** `name cmp value` with the name already consumed; the comparison is next. */
  function parseFieldTerm(name: string, pos: number): Node {
    const c = tokens[i++] as Extract<Token, { type: 'cmp' }>
    return { kind: 'field', name, op: c.op, value: parseFieldValue(c), pos, opPos: c.pos }
  }

  /**
   * A field term's value: a quoted text, true or false, a date (anything the date
   * grammar starts with), a number, or any other bare word as text.
   */
  function parseFieldValue(after: Token): FieldValueExpr {
    const tok = peek()
    if (tok?.type === 'string') {
      i++
      return { type: 'text', value: tok.value }
    }
    if (!tok || tok.type !== 'word') return fail(t('Expected a value after "{after}" at position {pos}', { after: after.raw, pos: after.pos + 1 }), after.pos, ['value'])
    const w = tok.value.toLowerCase()
    if (w === 'true' || w === 'false') {
      i++
      return { type: 'bool', value: w === 'true' }
    }
    const unit = /^\d+$/.test(w) ? lower(tokens[i + 1]) : ''
    if (DATE_STARTS.has(w) || (WEEKDAYS as readonly string[]).includes(w) || /^\d{4}-\d{2}-\d{2}$/.test(w) || DATE_UNITS.has(unit)) {
      return { type: 'date', date: parseDate(after) }
    }
    i++
    if (/^-?\d+(\.\d+)?$/.test(w)) return { type: 'number', value: Number(w) }
    return { type: 'text', value: tok.value }
  }

  function parseDate(after: Token): DateExpr {
    const tok = peek()
    if (!tok || tok.type !== 'word') {
      return fail(t('Expected a date after "{after}" at position {pos}', { after: after.raw, pos: after.pos + 1 }), after.pos, ['date'])
    }
    const w = tok.value.toLowerCase()
    i++
    if (w === 'today') return { type: 'relative', days: 0 }
    if (w === 'tomorrow') return { type: 'relative', days: 1 }
    if (w === 'yesterday') return { type: 'relative', days: -1 }
    const wd = (WEEKDAYS as readonly string[]).indexOf(w)
    if (wd >= 0) return { type: 'weekday', day: wd }
    if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
      if (!validISO(w)) return fail(t('Invalid date "{date}" at position {pos}', { date: tok.raw, pos: tok.pos + 1 }), tok.pos, ['date'])
      return { type: 'iso', date: w }
    }
    if (w === 'this' || w === 'last' || w === 'next') {
      const unit = lower(peek())
      if (unit !== 'week' && unit !== 'month') {
        return fail(t('Expected "week" or "month" after "{after}" at position {pos}', { after: tok.raw, pos: tok.pos + 1 }), tok.pos, ['"week"', '"month"'])
      }
      i++
      return { type: 'period', unit, offset: w === 'this' ? 0 : w === 'last' ? -1 : 1 }
    }
    if (/^\d+$/.test(w)) {
      const n = Number(w)
      const unitTok = peek()
      const unit = lower(unitTok)
      if (unit === 'days') {
        i++
        if (lower(peek()) === 'ago') {
          i++
          return { type: 'relative', days: -n }
        }
        return { type: 'relative', days: n }
      }
      if (unit === 'week' || unit === 'weeks' || unit === 'month' || unit === 'months') {
        i++
        if (lower(peek()) !== 'ago') {
          return fail(t('Expected "ago" after "{after}" at position {pos}', { after: unitTok!.raw, pos: unitTok!.pos + 1 }), unitTok!.pos, ['"ago"'])
        }
        i++
        return { type: 'period', unit: unit.startsWith('week') ? 'week' : 'month', offset: n === 0 ? 0 : -n }
      }
      return fail(t('Expected "days", "weeks" or "months" after "{after}" at position {pos}', { after: tok.raw, pos: tok.pos + 1 }), tok.pos, ['"days"', '"weeks"', '"months"'])
    }
    return fail(t('Invalid date "{date}" at position {pos}', { date: tok.raw, pos: tok.pos + 1 }), tok.pos, ['date'])
  }

  const ast = parseOr(undefined)
  const rest = peek()
  if (rest) {
    if (rest.type === 'rparen') fail(t('Unexpected ")" at position {pos}', { pos: rest.pos + 1 }), rest.pos, ['"&"', '"|"'])
    fail(t('Expected "&" or "|" before "{before}" at position {pos}', { before: rest.raw, pos: rest.pos + 1 }), rest.pos, ['"&"', '"|"'])
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

/** First day of the calendar month `months` away from the month of `iso`. */
function monthStart(iso: string, months: number): string {
  const [y, m] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, 1))
  return dt.toISOString().slice(0, 10)
}

/** An inclusive range of floating dates. */
export interface DateRange {
  start: string
  end: string
}

/**
 * Resolve a date expression to the days it denotes, against the viewer's local
 * calendar date `today` and first day of the week (0 = Sunday). A day expression
 * is a range of one day; `this week` starts on `weekStart` (completed-date-filters D1).
 */
export function resolveRange(expr: DateExpr, today: string, weekStart = 1): DateRange {
  if (expr.type !== 'period') {
    const d = resolveDate(expr, today)
    return { start: d, end: d }
  }
  if (expr.unit === 'week') {
    const start = shiftISO(today, -((weekdayOf(today) - weekStart + 7) % 7) + 7 * expr.offset)
    return { start, end: shiftISO(start, 6) }
  }
  const start = monthStart(today, expr.offset)
  return { start, end: shiftISO(monthStart(today, expr.offset + 1), -1) }
}

/** Resolve a date expression against the viewer's local calendar date `today` (YYYY-MM-DD); a period resolves to its first day. */
export function resolveDate(expr: DateExpr, today: string, weekStart = 1): string {
  switch (expr.type) {
    case 'iso':
      return expr.date
    case 'relative':
      return shiftISO(today, expr.days)
    case 'weekday':
      // Next occurrence, today included.
      return shiftISO(today, (expr.day - weekdayOf(today) + 7) % 7)
    case 'period':
      return resolveRange(expr, today, weekStart).start
  }
}

// ---- printing (tests, debugging, future saved views) ----

function quote(name: string): string {
  return BREAK.test(name) || name === '' ? `"${name.replace(/["\\]/g, (c) => '\\' + c)}"` : name
}

function quoteAlways(s: string): string {
  return `"${s.replace(/["\\]/g, (c) => '\\' + c)}"`
}

/** A field term's value as query text (`client = today` compares with "today"). */
export function fieldValueText(v: FieldValueExpr): string {
  return v.type === 'text' ? v.value : v.type === 'date' ? printDate(v.date) : String(v.value)
}

function printFieldValue(v: FieldValueExpr): string {
  switch (v.type) {
    case 'number': return String(v.value)
    case 'bool': return String(v.value)
    case 'text': return quoteAlways(v.value)
    case 'date': return printDate(v.date)
  }
}

function printDate(d: DateExpr): string {
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
    case 'origin':
      return `origin: ${quote(n.value)}`
    case 'workspace':
      return `workspace: ${quote(n.name)}`
    case 'field':
      // Field names are always quoted: a bare one could collide with a reserved word.
      return `${quoteAlways(n.name)} ${n.op} ${printFieldValue(n.value)}`
    case 'nofield':
      return `no ${quoteAlways(n.name)}`
    case 'tracked':
      return `tracked ${n.op} ${n.minutes}`
  }
}
