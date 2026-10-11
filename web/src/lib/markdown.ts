// A small, safe markdown subset for comment bodies (OpenSpec
// `comments-and-activity`, design D6): paragraphs with line breaks, *emphasis*,
// **strong**, `inline code`, fenced code blocks, [links](https://…) and bare
// https:// links, bulleted and numbered lists, and > block quotes.
//
// The parser produces plain data; the React renderer (app/Markdown.tsx) turns it
// into elements, so raw HTML can never reach the DOM: `<script>` stays text.
// Links are kept only for http(s) and mailto URLs; anything else (javascript:,
// data:, relative paths) is shown as its text. About 150 lines, no dependency.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'em' | 'strong'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' }

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'pre'; v: string }
  | { t: 'quote'; c: Block[] }
  | { t: 'list'; ordered: boolean; start: number; items: Block[][] }

const LIST = /^ {0,3}([-*+]|(\d{1,9})[.)])\s+(.*)$/
const FENCE = /^ {0,3}(```|~~~)/

/**
 * The rel of every link written by a user (comments, notes): no referrer, no
 * opener, and no search or link value for spam (OpenSpec `demo-sandboxes` D5;
 * applies on every instance).
 */
export const LINK_REL = 'nofollow ugc noopener noreferrer'

/** Only absolute http(s) and mailto links are rendered as links. */
export function safeHref(url: string): string | null {
  const u = url.trim()
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(u) ? u : null
}

export function parseMarkdown(src: string, depth = 0): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) body.push(lines[i++])
      i++ // closing fence (or end of input)
      out.push({ t: 'pre', v: body.join('\n') })
      continue
    }
    if (/^ {0,3}>/.test(line) && depth < 8) {
      const body: string[] = []
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^ {0,3}> ?/, ''))
      out.push({ t: 'quote', c: parseMarkdown(body.join('\n'), depth + 1) })
      continue
    }
    const first = LIST.exec(line)
    if (first && depth < 8) {
      const ordered = !!first[2]
      const list: Block[][] = []
      while (i < lines.length) {
        const m = LIST.exec(lines[i])
        if (!m || !!m[2] !== ordered) break
        const item = [m[3]]
        i++
        // Indented lines continue the item (and may hold a nested list).
        while (i < lines.length && (/^\s{2,}\S/.test(lines[i]) || (!lines[i].trim() && /^\s{2,}\S/.test(lines[i + 1] ?? '')))) {
          item.push(lines[i++].replace(/^\s{2,4}/, ''))
        }
        list.push(parseMarkdown(item.join('\n'), depth + 1))
      }
      out.push({ t: 'list', ordered, start: ordered ? Number(first[2]) : 1, items: list })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !/^ {0,3}>/.test(lines[i]) && !LIST.exec(lines[i])) para.push(lines[i++].trim())
    if (para.length === 0) para.push(lines[i++].trim()) // a line no other rule took
    out.push({ t: 'p', c: parseInline(para.join('\n')) })
  }
  return out
}

const PUNCT = /[!-/:-@[-`{-~]/

export function parseInline(s: string, depth = 0): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ t: 'text', v: text })
    text = ''
  }
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < s.length && PUNCT.test(s[i + 1])) {
      text += s[i + 1]
      i += 2
      continue
    }
    if (ch === '\n') {
      flush()
      out.push({ t: 'br' })
      i++
      continue
    }
    if (ch === '`') {
      const run = /^`+/.exec(s.slice(i))![0]
      const end = s.indexOf(run, i + run.length)
      if (end > 0) {
        flush()
        out.push({ t: 'code', v: s.slice(i + run.length, end).replace(/\n/g, ' ') })
        i = end + run.length
        continue
      }
      text += run
      i += run.length
      continue
    }
    if (ch === '[' && depth < 4) {
      const close = s.indexOf('](', i + 1)
      const end = close > 0 ? s.indexOf(')', close + 2) : -1
      if (close > 0 && end > 0 && !s.slice(i + 1, close).includes('[')) {
        const href = safeHref(s.slice(close + 2, end))
        const label = parseInline(s.slice(i + 1, close), depth + 1)
        flush()
        if (href) out.push({ t: 'link', href, c: label })
        else out.push(...label)
        i = end + 1
        continue
      }
    }
    if ((ch === 'h' || ch === 'H') && /^https?:\/\//i.test(s.slice(i, i + 8)) && (i === 0 || /[\s(]/.test(s[i - 1]))) {
      let url = /^[^\s<]+/.exec(s.slice(i))![0]
      url = url.replace(/[.,:;!?)]+$/, '')
      const href = safeHref(url)
      if (href) {
        flush()
        out.push({ t: 'link', href, c: [{ t: 'text', v: url }] })
        i += url.length
        continue
      }
    }
    if ((ch === '*' || ch === '_') && depth < 4) {
      const prev = i > 0 ? s[i - 1] : ' '
      // Intraword underscores (snake_case) are literal.
      if (ch === '_' && /[\p{L}\p{N}]/u.test(prev)) {
        text += ch
        i++
        continue
      }
      const dbl = s[i + 1] === ch
      const delim = dbl ? ch + ch : ch
      const start = i + delim.length
      let end = s.indexOf(delim, start)
      // A single delimiter must not match half of a double one.
      while (!dbl && end > 0 && s[end + 1] === ch) end = s.indexOf(delim, end + 2)
      if (end > start && !/\s/.test(s[start]) && !/\s/.test(s[end - 1])) {
        flush()
        out.push({ t: dbl ? 'strong' : 'em', c: parseInline(s.slice(start, end), depth + 1) })
        i = end + delim.length
        continue
      }
    }
    text += ch
    i++
  }
  flush()
  return out
}
