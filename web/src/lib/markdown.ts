// A small, safe markdown subset for comment bodies and note projections
// (OpenSpec `comments-and-activity` D6, `editor-everywhere` D1): paragraphs with
// line breaks, headings, *emphasis*, **strong**, ~~strike~~, `inline code`,
// fenced code blocks, [links](https://…) and bare https:// links, bulleted,
// numbered and check lists, > block quotes, pipe tables, images that name an
// attachment (`![alt](attachment:<id>)`), links to a task (`?task=<id>`) and
// @mentions the caller can resolve.
//
// The parser produces plain data; the React renderer (app/Markdown.tsx) turns it
// into elements, so raw HTML can never reach the DOM: `<script>` stays text.
// Links are kept only for http(s) and mailto URLs; anything else (javascript:,
// data:, relative paths) is shown as its text. No image is ever loaded from an
// address: `![x](https://…)` is a link named x. No dependency.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'em' | 'strong' | 'strike'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  /** A link to a task of this app (Make subtask, editor-everywhere D6). */
  | { t: 'task'; id: string; c: Inline[] }
  /** `@token` of a member the caller resolved. */
  | { t: 'mention'; v: string }
  | { t: 'br' }

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'pre'; v: string; lang?: string }
  | { t: 'quote'; c: Block[] }
  | { t: 'list'; ordered: boolean; start: number; items: Block[][]; checks?: (boolean | null)[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'table'; align: (string | null)[]; head: Inline[][]; rows: Inline[][][] }
  /** An embedded attachment of the same task (resolved by the renderer). */
  | { t: 'img'; id: string; alt: string }

/** What the caller can resolve while parsing: mention tokens of members. */
export interface MarkdownOptions {
  mention?: (token: string) => boolean
}

const LIST = /^ {0,3}([-*+]|(\d{1,9})[.)])\s+(.*)$/
const FENCE = /^ {0,3}(```+|~~~+)\s*([^`\s]*)/
const IMAGE = /^ {0,3}!\[((?:\\.|[^\]\\])*)\]\(attachment:([A-Za-z0-9_-]+)\)\s*$/
const RULE_CELL = /^:?-+:?$/
const TASK_HREF = /^\?task=([A-Za-z0-9_-]+)$/

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

/** Table cells: split on unescaped `|`, outer pipes dropped, `\|` read as `|`. */
function cells(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
    } else if (s[i] === '|') {
      out.push(cur)
      cur = ''
    } else cur += s[i]
  }
  if (cur.trim() || !line.trim().endsWith('|')) out.push(cur)
  return out.map((c) => c.trim())
}

function isTableStart(lines: string[], i: number): boolean {
  if (!lines[i].includes('|') || i + 1 >= lines.length) return false
  const rule = cells(lines[i + 1])
  return rule.length === cells(lines[i]).length && rule.every((c) => RULE_CELL.test(c))
}

function startsBlock(lines: string[], i: number): boolean {
  const l = lines[i]
  return FENCE.test(l) || /^ {0,3}>/.test(l) || !!LIST.exec(l) || /^ {0,3}#{1,6}\s/.test(l) || IMAGE.test(l) || isTableStart(lines, i)
}

export function parseMarkdown(src: string, depth = 0, opts: MarkdownOptions = {}): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  const inline = (s: string) => parseInline(s, 0, opts)
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
      out.push({ t: 'pre', v: body.join('\n'), ...(fence[2] ? { lang: fence[2] } : {}) })
      continue
    }
    if (/^ {0,3}>/.test(line) && depth < 8) {
      const body: string[] = []
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^ {0,3}> ?/, ''))
      out.push({ t: 'quote', c: parseMarkdown(body.join('\n'), depth + 1, opts) })
      continue
    }
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      out.push({ t: 'h', level: heading[1].length, c: inline(heading[2]) })
      i++
      continue
    }
    const img = IMAGE.exec(line)
    if (img) {
      out.push({ t: 'img', id: img[2], alt: img[1].replace(/\\(.)/g, '$1') })
      i++
      continue
    }
    if (isTableStart(lines, i)) {
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.startsWith(':') ? 'left' : c.endsWith(':') ? 'right' : null))
      const row = (l: string) => align.map((_, k) => inline(cells(l)[k] ?? ''))
      const head = row(lines[i])
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(row(lines[i++]))
      out.push({ t: 'table', align, head, rows })
      continue
    }
    const first = LIST.exec(line)
    if (first && depth < 8) {
      const ordered = !!first[2]
      const list: Block[][] = []
      const checks: (boolean | null)[] = []
      while (i < lines.length) {
        const m = LIST.exec(lines[i])
        if (!m || !!m[2] !== ordered) break
        const box = /^\[([ xX])\]\s+(.*)$/.exec(m[3])
        checks.push(box ? box[1] !== ' ' : null)
        const item = [box ? box[2] : m[3]]
        i++
        // Indented lines continue the item (and may hold a nested list).
        while (i < lines.length && (/^\s{2,}\S/.test(lines[i]) || (!lines[i].trim() && /^\s{2,}\S/.test(lines[i + 1] ?? '')))) {
          item.push(lines[i++].replace(/^\s{2,4}/, ''))
        }
        list.push(parseMarkdown(item.join('\n'), depth + 1, opts))
      }
      out.push({ t: 'list', ordered, start: ordered ? Number(first[2]) : 1, items: list, ...(checks.some((c) => c !== null) ? { checks } : {}) })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines, i))) para.push(lines[i++].trim())
    out.push({ t: 'p', c: inline(para.join('\n')) })
  }
  return out
}

const PUNCT = /[!-/:-@[-`{-~]/

export function parseInline(s: string, depth = 0, opts: MarkdownOptions = {}): Inline[] {
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
    if (ch === '@' && opts.mention && !/[\p{L}\p{N}]/u.test(s[i - 1] ?? '')) {
      const m = /^@([\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*)/u.exec(s.slice(i))
      if (m && opts.mention(m[1])) {
        flush()
        out.push({ t: 'mention', v: m[1] })
        i += m[0].length
        continue
      }
    }
    // `![name](address)` from the web is a link named "name": nothing is loaded.
    const at = ch === '!' && s[i + 1] === '[' ? i + 1 : ch === '[' ? i : -1
    if (at >= 0 && depth < 4) {
      const close = s.indexOf('](', at + 1)
      const end = close > 0 ? s.indexOf(')', close + 2) : -1
      if (close > 0 && end > 0 && !s.slice(at + 1, close).includes('[')) {
        const target = s.slice(close + 2, end).trim()
        const task = TASK_HREF.exec(target)
        const href = safeHref(target)
        const label = parseInline(s.slice(at + 1, close), depth + 1, opts)
        flush()
        if (task) out.push({ t: 'task', id: task[1], c: label })
        else if (href) out.push({ t: 'link', href, c: label })
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
    if (ch === '~' && s[i + 1] === '~' && depth < 4) {
      const end = s.indexOf('~~', i + 2)
      if (end > i + 2 && !/\s/.test(s[i + 2]) && !/\s/.test(s[end - 1])) {
        flush()
        out.push({ t: 'strike', c: parseInline(s.slice(i + 2, end), depth + 1, opts) })
        i = end + 2
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
        out.push({ t: dbl ? 'strong' : 'em', c: parseInline(s.slice(start, end), depth + 1, opts) })
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
