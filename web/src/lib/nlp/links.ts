// Links in a quick-add line (OpenSpec change quick-add-links, D1): an http or
// https URL that starts a token becomes a link attachment of the new task and
// leaves the title. Read only with `ParseContext.links`; internal/quickadd/links.go
// is the same rule, pinned by quickadd.vectors.json.
import { stripSpans, type Span, type Token } from './tokenize'

/** How many links one line attaches; later ones stay in the title. */
export const MAX_LINKS = 5

const TRAILING = '.,;:!?'
const count = (s: string, ch: string) => s.split(ch).length - 1

/** The URL a token starts with, without the sentence punctuation after it, or null. */
export function matchLink(text: string): string | null {
  const lower = text.toLowerCase()
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return null
  let url = text
  while (url) {
    const c = url[url.length - 1]
    if (TRAILING.includes(c) || (c === ')' && count(url, '(') < count(url, ')')) || (c === ']' && count(url, '[') < count(url, ']'))) url = url.slice(0, -1)
    else break
  }
  return hostOf(url) ? url : null
}

/** The host of a URL that has "://": without a user, a port or "www.", ASCII letters lowercased (links.go does the same). */
function hostOf(url: string): string {
  let rest = url.slice(url.indexOf('://') + 3)
  const end = rest.search(/[/?#]/)
  if (end >= 0) rest = rest.slice(0, end)
  rest = rest.slice(rest.lastIndexOf('@') + 1)
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']')
    if (close >= 0) rest = rest.slice(0, close + 1)
  } else if (rest.includes(':')) rest = rest.slice(0, rest.indexOf(':'))
  rest = rest.replace(/[A-Z]/g, (c) => c.toLowerCase())
  return rest.startsWith('www.') ? rest.slice(4) : rest
}

/** What a link chip reads: the host of a link token (sentence punctuation after the URL is not part of it), '' for no link. */
export function linkHost(token: string): string {
  const url = matchLink(token)
  return url ? hostOf(url) : ''
}

/** One link token: the URL and the whole token's span, which leaves the title with any punctuation. */
export interface LinkHit {
  url: string
  span: Span
}

/** The first MAX_LINKS unquoted link tokens no live dismissal covers, by token index. */
export function findLinks(line: string, tokens: readonly Token[], dismissed: readonly Span[]): Map<number, LinkHit> {
  const out = new Map<number, LinkHit>()
  for (let i = 0; i < tokens.length && out.size < MAX_LINKS; i++) {
    const t = tokens[i]
    const url = t.quoted ? null : matchLink(t.text)
    if (!url || dismissed.some((d) => t.start < d.end && d.start < t.end)) continue
    out.set(i, { url, span: { start: t.start, end: t.end, text: line.slice(t.start, t.end) } })
  }
  return out
}

/**
 * The links a line keeps, in line order: all of them, unless removing them with
 * the other attributes' spans would leave no title (quick-add-links D2), then none.
 */
export function keptLinks(line: string, spans: readonly Span[], quoteSpans: readonly Span[], links: ReadonlyMap<number, LinkHit>): LinkHit[] {
  const hits = [...links.keys()].sort((a, b) => a - b).map((i) => links.get(i)!)
  if (!hits.length) return []
  return stripSpans(line, [...spans, ...hits.map((h) => h.span)], quoteSpans) ? hits : []
}
