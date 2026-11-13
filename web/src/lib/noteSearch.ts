// On-device note search (OpenSpec notes-overview, D4): the matcher, the ranking and the
// snippet. Pure functions with no data access, loaded lazily with the Notes page and the
// palette. The Go port is internal/notesearch (used by the MCP tool search_notes and
// `ot notes search`); both are pinned by internal/notesearch/testdata/vectors.json.
//
// Matching: the query is split into terms (quoted text is one phrase), every term must occur
// as a substring of the note's title and its Markdown-stripped text, ignoring case and
// diacritics (NFKD, combining marks removed, lower-cased, final sigma folded to sigma).
// Operators (note-search-operators): `OR` joins alternatives, `title:` and `text:` limit
// a word or phrase to one field.

/** A segment of a snippet: plain text, marked when it is a match. Never HTML. */
export interface SnippetSegment {
  text: string
  mark: boolean
}

/** What one note's match says about it. */
export interface NoteMatch {
  /** Every term occurs in the title or the text. */
  matched: boolean
  /** At least one term occurs in the title. */
  titleMatch: boolean
  /** The number of terms that occur in the text. */
  bodyWords: number
}

/** A note to search: its key, title, Markdown text and last change (Unix ms). */
export interface SearchableNote {
  key: string
  title: string
  text: string
  updated: number
}

/** A ranked result. */
export interface NoteHit<T> extends NoteMatch {
  note: T
}

/** A note's normalised title and stripped, normalised body, for an index to keep. */
export interface PreparedNote {
  title: string
  body: string
}

const MARKS = /\p{M}/gu
const ASCII = /^[\x00-\x7f]*$/
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'
const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c)
const QUOTES = new Set(['"', '“', '”', '„'])
const ASCII_PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')
/** The characters stripInline acts on; a line without them passes unchanged. */
const INLINE_MARKERS = /[\\`![*_~|]/
const INLINE_MARKER_LIST = [...'\\`![*_~|']
const INLINE_MARKER_SET = new Set(INLINE_MARKER_LIST)
const INLINE_NEXT = /[\\`![*_~|]/g

function lower(s: string, lang?: string): string {
  return lang ? s.toLocaleLowerCase(lang) : s.toLowerCase()
}

/** Text for comparison: NFKD, lower-cased, combining marks removed, "ς" as "σ". */
export function normalizeText(s: string, lang?: string): string {
  if (ASCII.test(s)) {
    // NFKD leaves ASCII as it is: only lower-case it, unless the language's rules
    // made something else of it (notes-compaction-at-scale: 10 KB notes).
    const l = lower(s, lang)
    if (ASCII.test(l)) return l
  }
  return lower(s.normalize('NFKD'), lang).replace(MARKS, '').replace(/ς/g, 'σ')
}

/** normalizeText of one code point. */
function normalizeChar(c: string, lang?: string): string {
  if (c.length === 1 && c.charCodeAt(0) < 0x80) return lang ? lower(c, lang) : c.toLowerCase()
  return normalizeText(c, lang)
}

/** Strips the block markers at the start of a line (quotes, headings, list markers, task boxes). */
function stripLinePrefix(line: string): string {
  let s = line.replace(/^[ \t]+/, '')
  for (;;) {
    const before = s
    if (s.startsWith('>')) s = s.slice(1)
    else if (/^#{1,6}( |\t|$)/.test(s)) s = s.replace(/^#+/, '')
    else if (/^[-*+]( |\t|$)/.test(s)) s = s.slice(1)
    else if (/^[0-9]{1,9}[.)]( |\t|$)/.test(s)) s = s.replace(/^[0-9]+[.)]/, '')
    else if (/^\[[ xX]\]( |\t|$)/.test(s)) s = s.slice(3)
    s = s.replace(/^[ \t]+/, '')
    if (s === before) return s
  }
}

/** A line with no letters or digits made only of rule and table characters, or a code fence. */
function dropLine(line: string): boolean {
  const s = line.replace(/^[ \t]+/, '')
  if (s.startsWith('```') || s.startsWith('~~~')) return true
  return s !== '' && /^[-*_|:= \t]+$/.test(s)
}

/** The code points of a line: the line itself when it is ASCII (one code unit each), else an array. */
type CodePoints = string | string[]

const part = (cs: CodePoints, a: number, b: number) => (typeof cs === 'string' ? cs.slice(a, b) : cs.slice(a, b).join(''))

/** The inline pass over one line's code points. */
function stripInline(cs: CodePoints): string {
  let out = ''
  let skipFrom = -1
  let skipTo = -1
  for (let i = 0; i < cs.length; i++) {
    if (skipFrom >= 0 && i > skipFrom) skipFrom = -1
    if (i === skipFrom) {
      i = skipTo - 1
      skipFrom = -1
      continue
    }
    const c = cs[i]
    if (typeof cs === 'string' && !INLINE_MARKER_SET.has(c)) {
      // A run without markers is copied at once, up to the next marker or the
      // link target to skip (notes-compaction-at-scale: 10 KB notes).
      INLINE_NEXT.lastIndex = i
      let end = INLINE_NEXT.exec(cs)?.index ?? cs.length
      if (skipFrom > i) end = Math.min(end, skipFrom)
      out += cs.slice(i, end)
      i = end - 1
      continue
    }
    if (c === '\\' && i + 1 < cs.length && ASCII_PUNCT.has(cs[i + 1])) {
      out += cs[++i]
      continue
    }
    if (c === '`') {
      let n = 1
      while (cs[i + n] === '`') n++
      const close = findRun(cs, '`', n, i + n)
      if (close >= 0) {
        out += part(cs, i + n, close)
        i = close + n - 1
      } else i += n - 1
      continue
    }
    if (c === '!' && cs[i + 1] === '[' && linkEnd(cs, i + 1)) continue
    if (c === '[') {
      const end = linkEnd(cs, i)
      if (end && skipFrom < 0) {
        skipFrom = end[0]
        skipTo = end[1]
        continue
      }
      out += c
      continue
    }
    if (c === '*' || c === '_') {
      if (isWordChar(cs[i - 1]) && isWordChar(cs[i + 1])) out += c
      continue
    }
    if (c === '~') {
      let n = 1
      while (cs[i + n] === '~') n++
      if (n === 1) out += c
      i += n - 1
      continue
    }
    if (c === '|') {
      out += ' '
      continue
    }
    out += c
  }
  return out
}

/** The index of the next run of exactly n copies of ch at or after from, or -1. */
function findRun(cs: CodePoints, ch: string, n: number, from: number): number {
  for (let i = from; i < cs.length; i++) {
    if (cs[i] !== ch) continue
    let m = 1
    while (cs[i + m] === ch) m++
    if (m === n) return i
    i += m - 1
  }
  return -1
}

/** For a "[" at open: [index of "](", index after ")"] of a link, or null. */
function linkEnd(cs: CodePoints, open: number): [number, number] | null {
  for (let j = open + 1; j + 1 < cs.length; j++) {
    if (cs[j] === '[') return null
    if (cs[j] === ']') {
      if (cs[j + 1] !== '(') return null
      for (let k = j + 2; k < cs.length; k++) if (cs[k] === ')') return [j, k + 1]
      return null
    }
  }
  return null
}

/** The whitespace characters (isSpace) other than the space. */
const OTHER_SPACES = ['\t', '\n', '\r', '\f', '\v']

/** Collapses whitespace runs (isSpace) to one space and trims them. */
function collapse(s: string): string {
  // Only runs that are not already one space are replaced: a 10 KB note has
  // thousands of single spaces and few other runs.
  // Whether there is such a run is asked with indexOf, much faster than the pattern
  // walking a 10 KB note character by character.
  const runs = s.includes('  ') || OTHER_SPACES.some((c) => s.includes(c))
  const one = runs ? s.replace(/[\t\n\r\f\v][ \t\n\r\f\v]*| [ \t\n\r\f\v]+/g, ' ') : s
  // The one space a run left at either end goes (a pattern for the end was tried at every position).
  const from = one.charCodeAt(0) === 0x20 ? 1 : 0
  const to = one.length > from && one.charCodeAt(one.length - 1) === 0x20 ? one.length - 1 : one.length
  return from === 0 && to === one.length ? one : one.slice(from, to)
}

/**
 * Plain text of Markdown for matching and snippets: block markers (quotes, headings, list
 * markers, task boxes), rule and table separator lines, code fences, emphasis markers
 * (`*` and `_` unless inside a word, `~~`), inline code backticks, table pipes, link and image
 * targets and backslash escapes removed; whitespace collapsed to single spaces.
 */
export function stripMarkdown(md: string): string {
  const lines: string[] = []
  // A note without any inline marker has none on any line (asked with indexOf, as in collapse).
  const inline = INLINE_MARKER_LIST.some((m) => md.includes(m))
  for (const raw of (md.includes('\r') ? md.replace(/\r\n?/g, '\n') : md).split('\n')) {
    // An empty line adds only a space, which collapse takes out again (most notes
    // have one between every two paragraphs).
    if (raw === '') continue
    // A line starting with an ASCII letter has no block marker and is no rule or fence.
    const c = raw.charCodeAt(0) | 0x20
    const plainStart = c >= 0x61 && c <= 0x7a
    if (!plainStart && dropLine(raw)) continue
    const line = plainStart ? raw : stripLinePrefix(raw)
    // The inline pass copies a line without any of its markers as it is.
    lines.push(!inline || !INLINE_MARKERS.test(line) ? line : stripInline(ASCII.test(line) ? line : [...line]))
  }
  return collapse(lines.join(' '))
}

/** Where a search term must occur (note-search-operators D2): the title or the text, or either. */
export type SearchField = 'any' | 'title' | 'text'
/** One alternative of a group: a normalised word or phrase and its field. */
export interface SearchTerm { text: string; field: SearchField }
/**
 * A parsed query (note-search-operators D1): every group must match, a group matches
 * when one of its alternatives does. Without `OR` each group holds one term.
 */
export type SearchQuery = SearchTerm[][]

const FIELD_PREFIXES: Record<string, SearchField> = { 'title:': 'title', 'text:': 'text' }

/**
 * A query's groups (D1, D2): words and quoted phrases (straight or curly quotes); the
 * word `OR` in capitals outside quotes joins its neighbours into one group, and is
 * ignored at the start, the end or doubled; `title:` or `text:` directly before a word
 * or phrase limits it to that field, and alone it is a word. Terms are normalised;
 * empty terms and repeated groups are left out.
 */
export function parseSearch(q: string, lang?: string): SearchQuery {
  const tokens: (SearchTerm | 'OR')[] = []
  const add = (raw: string, field: SearchField, quoted: boolean) => {
    if (!quoted && field === 'any' && raw === 'OR') return void tokens.push('OR')
    let f = field
    let t = raw
    if (!quoted && field === 'any') {
      const prefix = Object.keys(FIELD_PREFIXES).find((p) => normalizeText(raw.slice(0, p.length), lang) === p && raw.length > p.length)
      if (prefix) { f = FIELD_PREFIXES[prefix]; t = raw.slice(prefix.length) }
    }
    const n = collapse(normalizeText(t, lang))
    if (n !== '') tokens.push({ text: n, field: f })
  }
  // The query keeps its case (for OR); a character that normalises to a space or a quote counts as one.
  const cs = [...q]
  const asSpace = (c: string) => isSpace(c) || (c.charCodeAt(0) > 0x7f && [...normalizeText(c, lang)].some(isSpace))
  const asQuote = (c: string) => QUOTES.has(c) || (c.charCodeAt(0) > 0x7f && QUOTES.has(normalizeText(c, lang)))
  let word = ''
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]
    if (asQuote(c)) {
      // A field prefix directly before the quote limits the phrase.
      const field = FIELD_PREFIXES[normalizeText(word, lang)] ?? 'any'
      if (field === 'any') add(word, 'any', false)
      word = ''
      let j = i + 1
      while (j < cs.length && !asQuote(cs[j])) j++
      add(cs.slice(i + 1, j).join(''), field, true)
      i = j
    } else if (asSpace(c)) {
      add(word, 'any', false)
      word = ''
    } else word += c
  }
  add(word, 'any', false)
  const groups: SearchQuery = []
  let join = false
  for (const tok of tokens) {
    if (tok === 'OR') { join = groups.length > 0; continue }
    const last = groups[groups.length - 1]
    if (join && last) { if (!last.some((x) => x.text === tok.text && x.field === tok.field)) last.push(tok) }
    else groups.push([tok])
    join = false
  }
  const key = (g: SearchTerm[]) => g.map((x) => `${x.field}:${x.text}`).join('|')
  return groups.filter((g, i) => groups.findIndex((h) => key(h) === key(g)) === i)
}

/**
 * The terms a snippet highlights: every word and phrase of the query that may match in
 * the text (a `title:` term never does), normalised, without empties or repeats. For a
 * query without operators these are its search terms, quoted text one phrase.
 */
export function parseQuery(q: string, lang?: string): string[] {
  const terms: string[] = []
  for (const g of parseSearch(q, lang)) for (const x of g) if (x.field !== 'title' && !terms.includes(x.text)) terms.push(x.text)
  return terms
}

/** A note's normalised title and body, to keep in an index and pass to matchPrepared. */
export function prepareNote(note: { title: string; text: string }, lang?: string): PreparedNote {
  return { title: normalizeText(note.title, lang), body: normalizeText(stripMarkdown(note.text), lang) }
}

/**
 * matchNote over a prepared note: every group must have an alternative that occurs in
 * its field (D1, D2); a group counts as a title match when a matching alternative is in
 * the title, and as a body word when one is in the text. Plain terms are groups of one.
 */
export function matchPrepared(p: PreparedNote, query: SearchQuery | string[]): NoteMatch {
  const groups: SearchQuery = query.map((g) => (typeof g === 'string' ? [{ text: g, field: 'any' as const }] : g))
  let matched = groups.length > 0
  let titleMatch = false
  let bodyWords = 0
  for (const g of groups) {
    let any = false
    let title = false
    let body = false
    for (const { text: t, field } of g) {
      const inTitle = field !== 'text' && p.title.includes(t)
      const inBody = field !== 'title' && p.body.includes(t)
      // A term found in neither can still run from the title into the body, but only
      // through the space that joins them: the joined text is built for such a phrase
      // alone (joining it for every note on each keystroke copied every 10 KB note).
      const across = field === 'any' && !inTitle && !inBody && t.includes(' ') && (p.title + ' ' + p.body).includes(t)
      if (inTitle || inBody || across) any = true
      if (inTitle) title = true
      if (inBody) body = true
    }
    if (!any) matched = false
    if (title) titleMatch = true
    if (body) bodyWords++
  }
  return { matched, titleMatch, bodyWords }
}

/** Whether a note matches a query (from parseSearch, or terms from parseQuery); no terms match nothing. */
export function matchNote(note: { title: string; text: string }, query: SearchQuery | string[], lang?: string): NoteMatch {
  return matchPrepared(prepareNote(note, lang), query)
}

/** Orders matches: title matches first, then more matched body words, then newest, then key. */
export function compareHits<T extends SearchableNote>(a: NoteHit<T>, b: NoteHit<T>): number {
  if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1
  if (a.bodyWords !== b.bodyWords) return b.bodyWords - a.bodyWords
  if (a.note.updated !== b.note.updated) return b.note.updated - a.note.updated
  return a.note.key < b.note.key ? -1 : a.note.key > b.note.key ? 1 : 0
}

/** The notes matching query, ranked (compareHits). An empty query matches nothing. */
export function rankNotes<T extends SearchableNote>(notes: T[], query: string, lang?: string): NoteHit<T>[] {
  const groups = parseSearch(query, lang)
  const hits: NoteHit<T>[] = []
  if (groups.length === 0) return hits
  for (const note of notes) {
    const m = matchNote(note, groups, lang)
    if (m.matched) hits.push({ note, ...m })
  }
  return hits.sort(compareHits)
}

/** The snippet of a note's Markdown text: snippetPlain over stripMarkdown(text). */
export function snippet(text: string, terms: string[], max = 140, lang?: string): SnippetSegment[] {
  return snippetPlain(stripMarkdown(text), terms, max, lang)
}

/**
 * About max code points of plain text around the first match of any term, cut at spaces,
 * with "…" where it was cut, every occurrence of a term inside as a marked segment showing
 * the original characters. Without a match in the text: its start, unmarked.
 */
export function snippetPlain(plain: string, terms: string[], max = 140, lang?: string): SnippetSegment[] {
  if (plain === '') return []
  const ranges: Array<[number, number]> = []
  if (ASCII.test(plain)) {
    // ASCII text lowers one character for one (normalizeChar of an ASCII character
    // is its lower case), so the whole text is lowered at once and searched with
    // indexOf: the same ranges as the loop below, without a call per character
    // (list-rendering-at-scale: 10 KB notes took most of a note search keystroke).
    const low = lower(plain, lang)
    for (const t of terms) {
      if (t === '') continue
      for (let i = low.indexOf(t); i >= 0; i = low.indexOf(t, i + t.length)) ranges.push([i, i + t.length])
    }
    // One code unit per code point: the string itself serves as P, without
    // splitting 10 KB into characters for every row shown (notes-compaction-at-scale).
    return snippetSegments(plain, ranges, max)
  }
  const P = [...plain]
  const norm: string[] = []
  const orig: number[] = []
  P.forEach((c, i) => {
    for (const n of normalizeChar(c, lang)) {
      norm.push(n)
      orig.push(i)
    }
  })
  for (const t of terms) {
    const T = [...t]
    if (T.length === 0) continue
    for (let i = 0; i + T.length <= norm.length; ) {
      let ok = true
      for (let k = 0; k < T.length && ok; k++) ok = norm[i + k] === T[k]
      if (!ok) {
        i++
        continue
      }
      ranges.push([orig[i], orig[i + T.length - 1] + 1])
      i += T.length
    }
  }
  return snippetSegments(P, ranges, max)
}

/**
 * The snippet of the code points P around the first of the matched ranges (snippetPlain).
 * P is an array of code points, or a string whose code units are its code points (ASCII).
 */
function snippetSegments(P: string | string[], ranges: Array<[number, number]>, max: number): SnippetSegment[] {
  const part = (a: number, b: number) => (typeof P === 'string' ? P.slice(a, b) : P.slice(a, b).join(''))
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const [start, end] = ranges.length ? windowAround(P, ranges[0], max) : windowAround(P, [0, 0], max)
  const out: SnippetSegment[] = []
  const emit = (text: string, mark: boolean) => {
    if (text === '') return
    const last = out[out.length - 1]
    if (last && last.mark === mark) last.text += text
    else out.push({ text, mark })
  }
  if (start > 0) emit('…', false)
  let at = start
  let markEnd = start
  for (const [a0, b0] of ranges) {
    const a = Math.max(a0, start, markEnd)
    const b = Math.min(b0, end)
    if (a >= b) continue
    emit(part(at, a), false)
    emit(part(a, b), true)
    at = b
    markEnd = b
  }
  emit(part(at, end), false)
  if (end < P.length) emit('…', false)
  return out
}

/** The [start, end) window of about max code points around the match m, cut at spaces. */
function windowAround(P: string | string[], m: [number, number], max: number): [number, number] {
  const n = P.length
  let start = 0
  let end = n
  if (n > max) {
    start = Math.max(0, m[0] - Math.floor(Math.max(0, max - (m[1] - m[0])) / 2))
    end = Math.min(n, start + max)
    start = Math.max(0, end - max)
    if (start > 0 && !isSpace(P[start - 1])) {
      let s = start
      while (s < m[0] && !isSpace(P[s])) s++
      if (s < m[0]) start = s
    }
    if (end < n && !isSpace(P[end])) {
      let e = end
      while (e > m[1] && !isSpace(P[e - 1])) e--
      if (e > m[1]) end = e
    }
  }
  while (start < end && isSpace(P[start])) start++
  while (end > start && isSpace(P[end - 1])) end--
  return [start, end]
}
