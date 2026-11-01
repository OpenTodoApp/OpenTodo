// The vault's task-line grammar (OpenSpec `markdown-vault` "Task lines"): the
// TypeScript twin of internal/vault/line.go (ParseLine, PrintLine) and of
// LineFields in internal/vault/task.go. Both run
// internal/vault/testdata/lines.vectors.json; obsidian/src/vault/line.test.ts
// also reads the fixture vault. `obsidian-vault-sync` builds on this file.
//
// Go indexes strings by byte and this file by UTF-16 code unit; every pattern
// below works on whole code points, so the two read a line the same way.

const MARK_DUE = '📅'
const MARK_START = '🛫'
const MARK_DONE = '✅'
const MARK_CREATED = '➕'
const MARK_RECUR = '🔁'
const MARK_ID = '🆔'
const MARK_BLOCKED = '⛔'
const MARK_HIGHEST = '🔺'
const MARK_HIGH = '⏫'
const MARK_MEDIUM = '🔼'
const MARK_LOW = '🔽'
const MARK_LOWEST = '⏬'
const VARIATION_SEL = '️'

const VALUE_MARKERS = [MARK_DUE, MARK_START, MARK_DONE, MARK_CREATED, MARK_RECUR, MARK_ID, MARK_BLOCKED]
const PRIORITY_MARKERS: [string, number][] = [[MARK_HIGHEST, 1], [MARK_HIGH, 2], [MARK_MEDIUM, 3], [MARK_LOW, 4], [MARK_LOWEST, 4]]
/** Obsidian Tasks fields the vault does not map: kept as text after the title. */
const UNKNOWN_MARKERS = ['⏳', '❌', '🏁', '⏰']
const PRIORITY_MARKER: Record<number, string> = { 1: MARK_HIGHEST, 2: MARK_HIGH, 3: MARK_MEDIUM }

const INLINE_FIELDS = new Set(['time', 'tz', 'deadline', 'estimate', 'someday', 'evening', 'span', 'daypart', 'energy'])
const READ_ONLY_FIELDS = new Set(['origin', 'location', 'tracked'])

const TASK_LINE = /^([ \t]*)- \[([ xX])\](?:[ \t]+(.*))?$/su
const DATE = /^\d{4}-\d{2}-\d{2}/
const ID = /^[A-Za-z0-9_-]+/
const BLOCKED = /^[A-Za-z0-9_-]+(?:[ \t]*,[ \t]*[A-Za-z0-9_-]+)*/
const INLINE = /^\[([A-Za-z][A-Za-z0-9_\- ]*(?::[^:\[\]]+)?)::[ \t]*([^\[\]\\]*)\]/u
const TAG = /^#([\p{L}\p{N}_/-]+)/u
const SPACE = /^\s$/u
const DIGIT = /^\p{Nd}$/u

/** One parsed task line, as internal/vault.Line. */
export interface Line {
  indent: string
  done: boolean
  title: string
  /** Text the vault does not understand, kept after the title. */
  trailing: string
  due: string
  /** A date, or "someday" from [someday:: true]. */
  start: string
  doneDate: string
  created: string
  recur: string
  /** 0: no marker (4). */
  priority: number
  id: string
  blocked: string[]
  tags: string[]
  time: string
  tz: string
  deadline: string
  estimate: string
  evening: boolean
  span: string
  dayPart: string
  energy: string
  /** origin, location, tracked and field:<name>, as written. */
  readOnly: Record<string, string>
  /** Which fields the line carries at all. */
  has: Record<string, boolean>
}

/** The parts of a task line (`- [ ] …` at any indent), or null for any other line. */
export function taskLineParts(s: string): { indent: string; done: boolean; content: string } | null {
  const m = TASK_LINE.exec(s)
  if (!m || s.includes('\n')) return null
  return { indent: m[1], done: m[2] !== ' ', content: m[3] ?? '' }
}

interface Token {
  kind: string
  text: string
  value: string
}

function atMarker(s: string, markers: readonly string[]): [string, number] {
  for (const m of markers) {
    if (s.startsWith(m)) {
      let n = m.length
      if (s.startsWith(VARIATION_SEL, n)) n += VARIATION_SEL.length
      return [m, n]
    }
  }
  return ['', 0]
}

function atPriority(s: string): [number, number] {
  for (const [m, p] of PRIORITY_MARKERS) {
    if (s.startsWith(m)) {
      let n = m.length
      if (s.startsWith(VARIATION_SEL, n)) n += VARIATION_SEL.length
      return [p, n]
    }
  }
  return [0, 0]
}

const skipSpace = (s: string) => s.replace(/^[ \t]+/, '')
const isSpace = (ch: string | undefined) => ch !== undefined && SPACE.test(ch)

/** Not digits only, so `#42` in "PR #42" stays text, as in Obsidian. */
function isTag(name: string): boolean {
  for (const ch of name) if (!DIGIT.test(ch)) return true
  return false
}

const firstChar = (s: string, i = 0): string | undefined => {
  const cp = s.codePointAt(i)
  return cp === undefined ? undefined : String.fromCodePoint(cp)
}

const lastChar = (s: string): string | undefined => {
  const chars = Array.from(s)
  return chars[chars.length - 1]
}

const MARKER_KIND: Record<string, string> = { [MARK_DUE]: 'due', [MARK_START]: 'start', [MARK_DONE]: 'done', [MARK_CREATED]: 'created', [MARK_RECUR]: 'recur', [MARK_ID]: 'id', [MARK_BLOCKED]: 'blocked' }

function fieldAt(s: string): [Token, number] | null {
  const [m, n] = atMarker(s, VALUE_MARKERS)
  if (m) {
    let rest = s.slice(n)
    let sp = rest.length - skipSpace(rest).length
    rest = rest.slice(sp)
    let v = ''
    if (m === MARK_DUE || m === MARK_START || m === MARK_DONE || m === MARK_CREATED) v = DATE.exec(rest)?.[0] ?? ''
    else if (m === MARK_ID) v = ID.exec(rest)?.[0] ?? ''
    else if (m === MARK_BLOCKED) v = BLOCKED.exec(rest)?.[0] ?? ''
    else if (m === MARK_RECUR) v = recurText(rest).replace(/[ \t]+$/, '')
    if (v === '') sp = 0
    const len = n + sp + v.length
    return [{ kind: MARKER_KIND[m], text: s.slice(0, len), value: v }, len]
  }
  const [p, pn] = atPriority(s)
  if (p > 0) return [{ kind: 'priority', text: s.slice(0, pn), value: String(p) }, pn]
  const [u, un] = atMarker(s, UNKNOWN_MARKERS)
  if (u) return [{ kind: 'unknown', text: s.slice(0, un), value: '' }, un]
  if (s.startsWith('[[')) {
    const end = s.indexOf(']]')
    if (end >= 0 && !s.slice(2, end).includes('[[')) return [{ kind: 'unknown', text: s.slice(0, end + 2), value: '' }, end + 2]
  }
  const im = INLINE.exec(s)
  if (im) {
    const key = im[1].trim()
    const val = im[2].trim()
    if (INLINE_FIELDS.has(key)) return [{ kind: key, text: im[0], value: val }, im[0].length]
    if (READ_ONLY_FIELDS.has(key) || (key.startsWith('field:') && key.slice('field:'.length).trim() !== '')) {
      return [{ kind: 'ro:' + key, text: im[0], value: val }, im[0].length]
    }
    return [{ kind: 'unknown', text: im[0], value: '' }, im[0].length]
  }
  const tm = TAG.exec(s)
  if (tm && isTag(tm[1])) {
    const end = tm[0].length
    if (end === s.length || isSpace(firstChar(s, end))) return [{ kind: 'tag', text: tm[0], value: tm[1] }, end]
  }
  return null
}

/** A rule's text: up to the next recognised field, or up to the word holding a bracket. */
function recurText(s: string): string {
  for (let i = 0; i < s.length; ) {
    if (s[i] === '[' || s[i] === ']') {
      const before = s.slice(0, i)
      let j = -1
      for (let k = before.length - 1; k >= 0; k--) {
        if (isSpace(before[k])) {
          j = k
          break
        }
      }
      return j >= 0 ? s.slice(0, j) : ''
    }
    if (i === 0 || isSpace(lastChar(s.slice(0, i)))) {
      const f = fieldAt(s.slice(i))
      if (f && f[1] > 0) return s.slice(0, i)
    }
    i += firstChar(s, i)!.length
  }
  return s
}

function tokenize(s: string): Token[] {
  const out: Token[] = []
  let text = ''
  const flush = () => {
    if (text.length > 0) {
      out.push({ kind: 'text', text, value: '' })
      text = ''
    }
  }
  let boundary = true
  for (let i = 0; i < s.length; ) {
    if (boundary && s[i] === '\\' && i + 1 < s.length) {
      const f = fieldAt(s.slice(i + 1))
      if (f && f[1] > 0) {
        text += s.slice(i + 1, i + 1 + f[1])
        i += 1 + f[1]
        boundary = false
        continue
      }
    }
    if (boundary) {
      const f = fieldAt(s.slice(i))
      if (f && f[1] > 0) {
        flush()
        out.push(f[0])
        i += f[1]
        boundary = true
        continue
      }
    }
    const ch = firstChar(s, i)!
    text += ch
    boundary = isSpace(ch)
    i += ch.length
  }
  flush()
  return out
}

/** Go's strings.TrimSpace for the white space a line can hold. */
const trimSpace = (s: string) => s.replace(/^\s+|\s+$/gu, '')

/** Parses the content of a task line (after `- [ ] `). */
export function parseLine(indent: string, done: boolean, content: string): Line {
  const l: Line = {
    indent, done, title: '', trailing: '', due: '', start: '', doneDate: '', created: '', recur: '', priority: 0, id: '', blocked: [], tags: [],
    time: '', tz: '', deadline: '', estimate: '', evening: false, span: '', dayPart: '', energy: '', readOnly: {}, has: {},
  }
  const title: string[] = []
  const trailing: string[] = []
  let unknown = false
  for (const tok of tokenize(content)) {
    if (tok.kind === 'text') {
      const t = trimSpace(tok.text)
      if (t !== '') {
        if (unknown) trailing.push(t.replaceAll('\\]', ']'))
        else title.push(t)
      }
      continue
    }
    if (tok.kind === 'unknown') {
      unknown = true
      trailing.push(trimSpace(tok.text))
      continue
    }
    l.has[tok.kind] = true
    switch (tok.kind) {
      case 'due': l.due = tok.value; break
      case 'start': l.start = tok.value; break
      case 'done': l.doneDate = tok.value; break
      case 'created': l.created = tok.value; break
      case 'recur': l.recur = tok.value; break
      case 'id': l.id = tok.value; break
      case 'blocked':
        for (const id of tok.value.split(',')) {
          const v = trimSpace(id)
          if (v) l.blocked.push(v)
        }
        break
      case 'priority': l.priority = Number(tok.value); break
      case 'tag': l.tags.push(tok.value); break
      case 'time': l.time = tok.value; break
      case 'tz': l.tz = tok.value; break
      case 'deadline': l.deadline = tok.value; break
      case 'estimate': l.estimate = tok.value; break
      case 'someday':
        if (tok.value.toLowerCase() === 'true') {
          l.start = 'someday'
          l.has.start = true
        }
        break
      case 'evening': l.evening = tok.value.toLowerCase() === 'true'; break
      case 'span': l.span = tok.value; break
      case 'daypart': l.dayPart = tok.value; break
      case 'energy': l.energy = tok.value; break
      default:
        if (tok.kind.startsWith('ro:')) l.readOnly[tok.kind.slice(3)] = tok.value
    }
  }
  l.title = title.join(' ')
  l.trailing = trailing.join(' ')
  return l
}

/** Parses a whole line, or null when it is not a task line. */
export function parseTaskLine(s: string): Line | null {
  const p = taskLineParts(s)
  return p ? parseLine(p.indent, p.done, p.content) : null
}

function escapeFields(title: string, keepUnknown: boolean): string {
  let b = ''
  let boundary = true
  for (let i = 0; i < title.length; ) {
    if (boundary) {
      const f = fieldAt(title.slice(i))
      if (f && f[1] > 0) {
        if (keepUnknown && f[0].kind === 'unknown') {
          b += title.slice(i, i + f[1])
          i += f[1]
          continue
        }
        b += '\\' + title.slice(i, i + f[1])
        i += f[1]
        boundary = false
        continue
      }
    }
    const ch = firstChar(title, i)!
    if (keepUnknown && ch === ']') b += '\\'
    b += ch
    boundary = isSpace(ch)
    i += ch.length
  }
  return b
}

const FIELD_VALUE = /[[\]\\]|\r|\n/g

function readOnlyRank(k: string): number {
  return k === 'origin' ? 0 : k === 'location' ? 1 : k === 'tracked' ? 2 : 3
}

/** Writes a task line in the vault's field order. */
export function printLine(l: Line): string {
  let parts: string[] = [escapeFields(l.title, false)]
  if (l.title === '') parts = []
  if (l.trailing !== '') parts.push(escapeFields(l.trailing, true))
  if (l.due) parts.push(`${MARK_DUE} ${l.due}`)
  if (l.time) parts.push(`[time:: ${l.time}]`)
  if (l.tz) parts.push(`[tz:: ${l.tz}]`)
  if (l.start === 'someday') parts.push('[someday:: true]')
  else if (l.start) parts.push(`${MARK_START} ${l.start}`)
  if (l.deadline) parts.push(`[deadline:: ${l.deadline}]`)
  if (l.estimate) parts.push(`[estimate:: ${l.estimate}]`)
  if (l.evening) parts.push('[evening:: true]')
  else if (l.dayPart) parts.push(`[daypart:: ${l.dayPart}]`)
  if (l.span) parts.push(`[span:: ${l.span}]`)
  if (l.energy) parts.push(`[energy:: ${l.energy}]`)
  const pm = PRIORITY_MARKER[l.priority]
  if (pm) parts.push(pm)
  if (l.recur) parts.push(`${MARK_RECUR} ${l.recur}`)
  for (const t of l.tags) parts.push('#' + t)
  if (l.blocked.length) parts.push(`${MARK_BLOCKED} ${l.blocked.join(',')}`)
  if (l.created) parts.push(`${MARK_CREATED} ${l.created}`)
  if (l.done && l.doneDate) parts.push(`${MARK_DONE} ${l.doneDate}`)
  const keys = Object.keys(l.readOnly).sort((a, b) => readOnlyRank(a) - readOnlyRank(b) || (a < b ? -1 : a > b ? 1 : 0))
  for (const k of keys) parts.push(`[${k}:: ${l.readOnly[k].replace(FIELD_VALUE, (c) => (c === '\r' || c === '\n' ? ' ' : ''))}]`)
  if (l.id) parts.push(`${MARK_ID} ${l.id}`)
  return l.indent + (l.done ? '- [x] ' : '- [ ] ') + parts.join(' ')
}

// ---- LineFields (internal/vault/task.go) ----

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/** A calendar date, as Go's time.Parse("2006-01-02"). */
export function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

/** An IANA zone the runtime knows (Go: internal/zoned.Valid). */
export function validZone(tz: string): boolean {
  if (!tz || tz === 'Local') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const HOURS = /^(\d+(?:\.\d+)?)h(?:(\d{1,2})(?:m|min)?)?$/
const MINUTES = /^(\d+)(?:m|min|mins|minutes)?$/
const MAX_DURATION = 100 * 24 * 60

/** internal/timetrack.ParseDuration: 30m, 45min, 1h, 1h30, 1.5h or bare minutes. */
function durationMinutes(input: string): number | null {
  const t = input.trim().toLowerCase()
  let m = HOURS.exec(t)
  if (m) {
    const mins = m[2] ? Number(m[2]) : 0
    if (mins > 59) return null
    const total = Math.round(Number(m[1]) * 60 + mins)
    return total <= MAX_DURATION ? total : null
  }
  m = MINUTES.exec(t)
  if (m) {
    const n = Number(m[1])
    return n <= MAX_DURATION ? n : null
  }
  return null
}

/** An estimate from 1 minute to 7 days (internal/vault parseMinutes). */
export function estimateMinutes(s: string): number | null {
  const m = durationMinutes(s.replaceAll(' ', ''))
  return m === null || m < 1 || m > 7 * 24 * 60 ? null : m
}

const prio = (p: number) => String(p < 1 || p > 4 ? 4 : p)

/**
 * The fields a task line sets by itself, as internal/vault.LineFields: compared
 * strings keyed by field, and the problems of values that did not parse (those
 * fields are left out).
 */
export function lineFields(l: Line): { fields: Record<string, string>; problems: string[] } {
  const p: Record<string, string> = { title: l.title, done: String(l.done), evening: String(l.evening), priority: prio(l.priority) }
  const problems: string[] = []
  const bad = (s: string) => problems.push(s)
  if (l.done && l.doneDate !== '') {
    if (validDate(l.doneDate)) p.donedate = l.doneDate
    else bad(`✅ ${l.doneDate} is not a date`)
  }
  if (l.due === '' && (l.time !== '' || l.tz !== '')) bad('a time needs a 📅 date')
  else if (l.due !== '' && !validDate(l.due)) bad(`📅 ${l.due} is not a date`)
  else if (l.time !== '' && !CLOCK.test(l.time)) bad(`time ${l.time} is not between 00:00 and 23:59`)
  else if (l.tz !== '' && (l.time === '' || !validZone(l.tz))) bad(`tz ${l.tz} is not a time zone with a time`)
  else p.due = l.due !== '' ? `${l.due}|${l.time}|${l.tz}` : ''
  for (const [key, val, mark] of [['start', l.start, '🛫'], ['deadline', l.deadline, 'deadline']] as const) {
    if (val === '' || validDate(val) || (key === 'start' && val === 'someday')) p[key] = val
    else bad(`${mark} ${val} is not a date`)
  }
  const part = l.dayPart.trim().toLowerCase()
  if (l.evening || part === '') p.daypart = ''
  else if (part === 'morning' || part === 'afternoon') p.daypart = part
  else bad(`daypart ${l.dayPart} is not morning or afternoon`)
  const span = l.span.trim().toLowerCase()
  if (span === '' || span === 'false' || span === 'true') p.span = String(span === 'true')
  else bad(`span ${l.span} is not true or false`)
  const energy = l.energy.trim().toLowerCase()
  if (energy === '') p.energy = ''
  else if (energy === 'deep' || energy === 'medium' || energy === 'low') p.energy = energy
  else bad(`energy ${l.energy} is not deep, medium or low`)
  if (l.estimate === '') p.estimate = ''
  else {
    const mins = estimateMinutes(l.estimate)
    if (mins !== null) p.estimate = String(mins)
    else bad(`estimate ${l.estimate} is not a duration from 1 minute to 7 days`)
  }
  return { fields: p, problems }
}
