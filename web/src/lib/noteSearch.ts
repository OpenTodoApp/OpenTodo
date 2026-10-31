// On-device note search (OpenSpec notes-overview, D4): the matcher, the ranking and the
// snippet. Pure functions with no data access, loaded lazily with the Notes page and the
// palette. The Go port is internal/notesearch (used by the MCP tool search_notes and
// `ot notes search`); both are pinned by internal/notesearch/testdata/vectors.json.
//
// Matching: the query is split into terms (quoted text is one phrase), every term must occur
// as a substring of the note's title and its Markdown-stripped text, ignoring case and
// diacritics (NFKD, combining marks removed, lower-cased, final sigma folded to sigma).

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

function lower(s: string, lang?: string): string {
  return lang ? s.toLocaleLowerCase(lang) : s.toLowerCase()
}

/** Text for comparison: NFKD, lower-cased, combining marks removed, "ς" as "σ". */
export function normalizeText(s: string, lang?: string): string {
  if (!lang && ASCII.test(s)) return s.toLowerCase()
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

/** The inline pass over one line's code points. */
function stripInline(cs: string[]): string {
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
    if (c === '\\' && i + 1 < cs.length && ASCII_PUNCT.has(cs[i + 1])) {
      out += cs[++i]
      continue
    }
    if (c === '`') {
      let n = 1
      while (cs[i + n] === '`') n++
      const close = findRun(cs, '`', n, i + n)
      if (close >= 0) {
        out += cs.slice(i + n, close).join('')
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
function findRun(cs: string[], ch: string, n: number, from: number): number {
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
function linkEnd(cs: string[], open: number): [number, number] | null {
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

/** Collapses whitespace runs to one space and trims. */
function collapse(s: string): string {
  let out = ''
  let space = false
  for (const c of s) {
    if (isSpace(c)) {
      space = out !== ''
      continue
    }
    if (space) out += ' '
    space = false
    out += c
  }
  return out
}

/**
 * Plain text of Markdown for matching and snippets: block markers (quotes, headings, list
 * markers, task boxes), rule and table separator lines, code fences, emphasis markers
 * (`*` and `_` unless inside a word, `~~`), inline code backticks, table pipes, link and image
 * targets and backslash escapes removed; whitespace collapsed to single spaces.
 */
export function stripMarkdown(md: string): string {
  const lines: string[] = []
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (dropLine(raw)) continue
    lines.push(stripInline([...stripLinePrefix(raw)]))
  }
  return collapse(lines.join(' '))
}

/** The search terms of a query: quoted text (straight or curly quotes) is one phrase, the rest one term per word; normalised, without empties or repeats. */
export function parseQuery(q: string, lang?: string): string[] {
  const terms: string[] = []
  const add = (t: string) => {
    const n = collapse(t)
    if (n !== '' && !terms.includes(n)) terms.push(n)
  }
  const cs = [...normalizeText(q, lang)]
  let word = ''
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]
    if (QUOTES.has(c)) {
      add(word)
      word = ''
      let j = i + 1
      while (j < cs.length && !QUOTES.has(cs[j])) j++
      add(cs.slice(i + 1, j).join(''))
      i = j
    } else if (isSpace(c)) {
      add(word)
      word = ''
    } else word += c
  }
  add(word)
  return terms
}

/** A note's normalised title and body, to keep in an index and pass to matchPrepared. */
export function prepareNote(note: { title: string; text: string }, lang?: string): PreparedNote {
  return { title: normalizeText(note.title, lang), body: normalizeText(stripMarkdown(note.text), lang) }
}

/** matchNote over a prepared note. */
export function matchPrepared(p: PreparedNote, terms: string[]): NoteMatch {
  const all = p.title + ' ' + p.body
  let matched = terms.length > 0
  let titleMatch = false
  let bodyWords = 0
  for (const t of terms) {
    if (!all.includes(t)) matched = false
    if (p.title.includes(t)) titleMatch = true
    if (p.body.includes(t)) bodyWords++
  }
  return { matched, titleMatch, bodyWords }
}

/** Whether a note matches terms (from parseQuery); no terms match nothing. */
export function matchNote(note: { title: string; text: string }, terms: string[], lang?: string): NoteMatch {
  return matchPrepared(prepareNote(note, lang), terms)
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
  const terms = parseQuery(query, lang)
  const hits: NoteHit<T>[] = []
  if (terms.length === 0) return hits
  for (const note of notes) {
    const m = matchNote(note, terms, lang)
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
  const P = [...plain]
  if (P.length === 0) return []
  const norm: string[] = []
  const orig: number[] = []
  P.forEach((c, i) => {
    for (const n of normalizeChar(c, lang)) {
      norm.push(n)
      orig.push(i)
    }
  })
  const ranges: Array<[number, number]> = []
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
    emit(P.slice(at, a).join(''), false)
    emit(P.slice(a, b).join(''), true)
    at = b
    markEnd = b
  }
  emit(P.slice(at, end).join(''), false)
  if (end < P.length) emit('…', false)
  return out
}

/** The [start, end) window of about max code points around the match m, cut at spaces. */
function windowAround(P: string[], m: [number, number], max: number): [number, number] {
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
