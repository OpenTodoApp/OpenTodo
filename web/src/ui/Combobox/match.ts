// Picker matching (OpenSpec change ui-primitives, design D6): accent- and case-
// insensitive; exact label > every query word a word prefix > fuzzy subsequence.
export type Range = [start: number, end: number]
export interface Match {
  /** 3 exact, 2 word prefix, 1 fuzzy, 0 no match. */
  tier: 0 | 1 | 2 | 3
  /** Fuzzy only: smaller is tighter. */
  gaps: number
  /** Ranges in the label to highlight. */
  label: Range[]
  /** Ranges in the secondary text to highlight. */
  secondary: Range[]
}

const ASCII = /^[\x00-\x7f]*$/

/** Lowercase and strip diacritics, keeping one character per input character. */
export function fold(s: string): string {
  if (ASCII.test(s)) return s.toLowerCase()
  let out = ''
  for (const ch of s) out += ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().charAt(0) || ch
  return out
}

const NONE: Match = { tier: 0, gaps: 0, label: [], secondary: [] }
const WORD = /[\p{L}\p{N}]/u
const ALNUM_ASCII = /[a-z0-9]/

function wordStarts(text: string): number[] {
  const ascii = ASCII.test(text)
  const isWord = (c: string) => (ascii ? ALNUM_ASCII.test(c) : WORD.test(c))
  const starts: number[] = []
  for (let i = 0; i < text.length; i++) if (isWord(text[i]) && (i === 0 || !isWord(text[i - 1]))) starts.push(i)
  return starts
}

/** An option's text folded once, so typing only compares (design D6, large sources). */
export interface Prepared {
  l: string
  starts: number[]
  s: string
  sStarts: number[]
}

export function prepare(label: string, secondary = ''): Prepared {
  const l = fold(label), s = fold(secondary)
  return { l, starts: wordStarts(l), s, sStarts: s ? wordStarts(s) : [] }
}

function prefixRanges(text: string, starts: number[], words: string[]): Range[] | null {
  const ranges: Range[] = []
  for (const w of words) {
    const at = starts.find((st) => text.startsWith(w, st))
    if (at === undefined) return null
    ranges.push([at, at + w.length])
  }
  return ranges
}

function fuzzy(text: string, q: string): { gaps: number; ranges: Range[] } | null {
  const item = text.length > 64 ? text.slice(0, 64) : text
  const ranges: Range[] = []
  let gaps = 0
  let ti = 0
  for (const ch of q) {
    const at = item.indexOf(ch, ti)
    if (at < 0) return null
    if (ranges.length && ranges[ranges.length - 1][1] === at) ranges[ranges.length - 1][1] = at + 1
    else {
      if (ranges.length) gaps += at - ti
      ranges.push([at, at + 1])
    }
    ti = at + 1
  }
  return { gaps, ranges }
}

/** A query folded once per keystroke. */
export interface Query {
  q: string
  words: string[]
  compact: string
}

export function prepareQuery(query: string): Query {
  const q = fold(query.trim())
  const words = q.split(/\s+/).filter(Boolean)
  return { q, words, compact: words.join('') }
}

export function matchPrepared(query: Query, p: Prepared, labelLength: number): Match {
  const { q, words, compact } = query
  if (!q) return { tier: 3, gaps: 0, label: [], secondary: [] }
  if (p.l === q) return { tier: 3, gaps: 0, label: [[0, labelLength]], secondary: [] }
  const inLabel = prefixRanges(p.l, p.starts, words)
  if (inLabel) return { tier: 2, gaps: 0, label: inLabel, secondary: [] }
  if (p.s) {
    // Every word must start a word in the label or the secondary text.
    const lr: Range[] = [], sr: Range[] = []
    const ok = words.every((w) => {
      const a = prefixRanges(p.l, p.starts, [w])
      if (a) return lr.push(...a), true
      const b = prefixRanges(p.s, p.sStarts, [w])
      if (b) return sr.push(...b), true
      return false
    })
    if (ok) return { tier: 2, gaps: 0, label: lr, secondary: sr }
  }
  if (compact.length < 2) return NONE
  const f = fuzzy(p.l, compact)
  return f ? { tier: 1, gaps: f.gaps, label: f.ranges, secondary: [] } : NONE
}

export function match(query: string, label: string, secondary = ''): Match {
  return matchPrepared(prepareQuery(query), prepare(label, secondary), label.length)
}

/** Splits text into plain and highlighted parts for rendering <mark>. */
export function highlight(text: string, ranges: Range[]): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = []
  let at = 0
  for (const [s, e] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (s > at) parts.push({ text: text.slice(at, s), hit: false })
    if (e > Math.max(s, at)) parts.push({ text: text.slice(Math.max(s, at), e), hit: true })
    at = Math.max(at, e)
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false })
  return parts
}
