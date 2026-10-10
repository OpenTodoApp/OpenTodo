// Quote-aware tokenizer for the quick-add line. Pure and dependency-free.
import { normalize } from './vocab'

/** A half-open character range [start, end) in the original line. */
export interface Span {
  start: number
  end: number
  /** The original text of the range; kept so a dismissal can detect edits. */
  text: string
}

export interface Token {
  /** Original text, exactly as typed. */
  text: string
  /** Folded text used by the grammar; see `normalize`. */
  norm: string
  start: number
  end: number
  /** Inside a balanced pair of double quotes: never matched by any grammar. */
  quoted: boolean
}

export interface Tokenized {
  tokens: Token[]
  /** Positions of the quote characters of balanced pairs; removed from the title. */
  quoteSpans: Span[]
}

/**
 * Split a line into whitespace-separated tokens with character spans. A balanced
 * pair of double quotes marks its content as literal: the quoted words become
 * tokens flagged `quoted`, and the quote characters themselves are reported so the
 * title builder can drop them. An unmatched quote is an ordinary character.
 */
export function tokenize(line: string): Tokenized {
  const tokens: Token[] = []
  const quoteSpans: Span[] = []
  const closers = balancedQuotes(line)
  let i = 0
  let quoted = false
  let start = -1
  const flush = (end: number) => {
    if (start >= 0 && end > start) {
      const text = line.slice(start, end)
      tokens.push({ text, norm: normalize(text), start, end, quoted })
    }
    start = -1
  }
  while (i < line.length) {
    const ch = line[i]
    if (closers.has(i)) {
      flush(i)
      quoteSpans.push({ start: i, end: i + 1, text: ch })
      quoted = !quoted
    } else if (/\s/.test(ch)) {
      flush(i)
    } else if (start < 0) {
      start = i
    }
    i++
  }
  flush(line.length)
  return { tokens, quoteSpans }
}

/** Indices of every double quote that belongs to a balanced opening/closing pair. */
function balancedQuotes(line: string): Set<number> {
  const positions: number[] = []
  for (let i = 0; i < line.length; i++) if (line[i] === '"') positions.push(i)
  const set = new Set<number>()
  // Pair quotes left to right; a dangling last quote stays literal.
  for (let k = 0; k + 1 < positions.length; k += 2) {
    set.add(positions[k])
    set.add(positions[k + 1])
  }
  return set
}

/**
 * Build the saved title: drop every removed span, then collapse runs of
 * whitespace and trim. Spans may overlap or be unordered.
 */
export function stripSpans(line: string, remove: readonly Span[]): string {
  if (remove.length === 0) return line.replace(/\s+/g, ' ').trim()
  const cut = new Uint8Array(line.length)
  for (const s of remove) for (let i = Math.max(0, s.start); i < Math.min(line.length, s.end); i++) cut[i] = 1
  let out = ''
  for (let i = 0; i < line.length; i++) {
    // A removed span acts as a word boundary so "milk tomorrow p2" never glues words.
    out += cut[i] ? ' ' : line[i]
  }
  return out.replace(/\s+/g, ' ').trim()
}
