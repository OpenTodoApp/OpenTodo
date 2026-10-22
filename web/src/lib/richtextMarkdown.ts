// The Markdown projection of the rich-text model (OpenSpec changes
// `collaborative-rich-text` and `editor-everywhere`): renderMarkdown writes the
// `description` of a note and the body of a comment written in the editor;
// parseMarkdown reads plain-text writes, legacy notes and comment bodies back
// into the model. The subset round-trips: parse(render(model)) is the model and
// render(parse(text)) is the text for text this renderer wrote (design D1).
// Anything outside the subset (raw HTML, footnotes, …) stays literal text.
import { clampInt, KNOWN_MARKS, pushRun, type Marks, type RNode, type Run } from './richtext'

/** Table limits (design D4): the editor refuses to grow a table past them. */
export const MAX_TABLE_COLS = 10
export const MAX_TABLE_ROWS = 100

const PUNCT = '\\`*_{}[]()#+-.!~>|<'

function escapeText(s: string, inLink: boolean, pipe = false): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const prev = s[i - 1] ?? ' '
    const next = s[i + 1] ?? ' '
    // A footnote reference `[^1]` (outside the subset) is kept as typed.
    const footnote = c === '[' && !inLink && /^\[\^[^\]\s[]+\](?!\()/.test(s.slice(i))
    if (c === '\\' || c === '`' || c === '*' || (c === '[' && !footnote) || (inLink && c === ']') || (pipe && c === '|')) out += `\\${c}`
    else if (c === '~' && (next === '~' || prev === '~' || i === 0 || i === s.length - 1)) out += '\\~'
    else if (c === '_' && (!/[\p{L}\p{N}]/u.test(prev) || !/[\p{L}\p{N}]/u.test(next))) out += '\\_'
    else out += c
  }
  return out
}

const BLOCK_START = /^(\s*)(#{1,6}(?=\s|$)|[-+*](?=\s|$)|\d{1,9}(?=[.)](\s|$))|>|\|)/

/** Backslash the first marker of a line that would otherwise start a block. */
function escapeLineStart(line: string): string {
  const m = BLOCK_START.exec(line)
  if (!m) return line
  const at = m[1].length
  if (/\d/.test(line[at])) {
    const dot = at + m[2].length
    return `${line.slice(0, dot)}\\${line.slice(dot)}`
  }
  return `${line.slice(0, at)}\\${line.slice(at)}`
}

function codeSpan(s: string): string {
  let n = 1
  while (s.includes('`'.repeat(n))) n++
  const fence = '`'.repeat(n)
  const pad = s.startsWith('`') || s.endsWith('`') || (s.startsWith(' ') && s.endsWith(' ') && s.trim() !== '') ? ' ' : ''
  return `${fence}${pad}${s}${pad}${fence}`
}

function encodeHref(href: string): string {
  return href.replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
}

// Emphasis is written as \u0001…\u0002 first and resolved once its neighbours are
// known: `_x_` normally, `*x*` when a letter or digit touches it (intraword).
const EM_OPEN = '\u0001'
const EM_CLOSE = '\u0002'
const OPEN: Record<string, string> = { strong: '**', em: EM_OPEN, strike: '~~', code: '' }
const CLOSE: Record<string, string> = { ...OPEN, em: EM_CLOSE }
// A code block line ending in spaces carries this until the trailing-space trim is done.
const KEEP = '\u0003'

const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

function resolveEmphasis(s: string): string {
  if (!s.includes(EM_OPEN)) return s
  const out = [...s]
  const open: number[] = []
  out.forEach((c, i) => {
    if (c === EM_OPEN) open.push(i)
    else if (c === EM_CLOSE) {
      const at = open.pop() as number
      const d = isWord(out[at - 1]) || isWord(out[i + 1]) ? '*' : '_'
      out[at] = d
      out[i] = d
    }
  })
  return out.join('')
}

/**
 * Inline Markdown for runs; newlines become "\n" + indent with line starts
 * escaped. In a table cell (`pipe`) every `|` is escaped, also inside code.
 */
export function renderInline(runs: Run[], indent = '', pipe = false): string {
  let out = ''
  const stack: { mark: string; href?: string }[] = []
  const close = (to: number) => {
    while (stack.length > to) {
      const top = stack.pop() as { mark: string; href?: string }
      out += top.mark === 'link' ? `](${encodeHref(top.href ?? '')})` : CLOSE[top.mark]
    }
  }
  let atLineStart = true
  for (const r of runs) {
    if (!r.text) continue
    const want = KNOWN_MARKS.filter((m) => m !== 'code' && m !== 'mention' && r.marks[m]).map((m) => ({ mark: m as string, href: m === 'link' ? String(r.marks.link.href) : undefined }))
    let k = 0
    while (k < stack.length && k < want.length && stack[k].mark === want[k].mark && stack[k].href === want[k].href) k++
    close(k)
    for (const w of want.slice(k)) {
      out += w.mark === 'link' ? '[' : OPEN[w.mark]
      stack.push(w)
      atLineStart = false
    }
    const inLink = stack.some((x) => x.mark === 'link')
    const lines = r.text.split('\n')
    lines.forEach((line, li) => {
      if (li > 0) {
        out += `\n${indent}`
        atLineStart = true
      }
      if (!line) return
      if (r.marks.code) out += codeSpan(pipe ? line.replace(/\|/g, '\\|') : line)
      else {
        const esc = escapeText(line, inLink, pipe)
        out += atLineStart ? escapeLineStart(esc) : esc
      }
      atLineStart = false
    })
  }
  close(0)
  return resolveEmphasis(out)
}

function hasText(n: RNode): boolean {
  if (n.type === 'image' || n.type === 'code_block') return true
  if (n.type === 'table') return (n.content ?? []).length > 0
  if (n.runs) return n.runs.some((r) => r.text.trim() !== '')
  return (n.content ?? []).some(hasText)
}

const ALIGN_RULE: Record<string, string> = { left: ':---', center: ':---:', right: '---:' }

function renderTable(n: RNode, indent: string): string {
  const rows = n.content ?? []
  const cols = Math.max(1, ...rows.map((r) => (r.content ?? []).length))
  const cell = (c: RNode | undefined) => (c ? renderInline((c.runs ?? []).map((r) => ({ ...r, text: r.text.replace(/\n/g, ' ') })), '', true) : '')
  const line = (r: RNode) => `| ${Array.from({ length: cols }, (_, i) => cell(r.content?.[i])).join(' | ')} |`
  const head = rows[0]?.content ?? []
  const rule = `| ${Array.from({ length: cols }, (_, i) => ALIGN_RULE[head[i]?.attrs.align as string] ?? '---').join(' | ')} |`
  return [line(rows[0]), rule, ...rows.slice(1).map(line)].join(`\n${indent}`)
}

function renderCode(n: RNode, indent: string): string {
  const text = (n.runs ?? []).map((r) => r.text).join('')
  let len = 3
  for (const m of text.match(/`+/g) ?? []) len = Math.max(len, m.length + 1)
  const fence = '`'.repeat(len)
  const lang = typeof n.attrs.lang === 'string' ? n.attrs.lang.replace(/[\s`]/g, '') : ''
  const body = text === '' ? '' : `${text.split('\n').map((l) => (/[ \t]$/.test(l) ? l + KEEP : l)).join(`\n${indent}`)}\n${indent}`
  return `${fence}${lang}\n${indent}${body}${fence}`
}

function renderQuote(n: RNode, indent: string): string | undefined {
  const inner = renderBlocks(n.content ?? [], '').join('\n\n')
  if (!inner) return undefined
  return inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join(`\n${indent}`)
}

function renderList(n: RNode, indent: string): string | undefined {
  const items: string[] = []
  let num = clampInt(n.attrs.order, 1, 1e9, 1)
  for (const item of n.content ?? []) {
    const marker = n.type === 'bullet_list' ? '- ' : `${num++}. `
    const pad = indent + ' '.repeat(marker.length)
    const box = item.attrs.checked === true ? '[x] ' : item.attrs.checked === false ? '[ ] ' : ''
    const [first, ...rest] = item.content ?? []
    const head = first && first.type === 'paragraph' ? renderInline(first.runs ?? [], pad) : ''
    let s = `${marker}${box}${head}`.trimEnd()
    for (const child of first && first.type === 'paragraph' ? rest : item.content ?? []) {
      const [b] = renderBlocks([child], pad)
      if (b === undefined) continue
      // A nested list follows its item's text directly; other blocks after a blank line.
      s += child.type === 'bullet_list' || child.type === 'ordered_list' ? `\n${pad}${b}` : `\n\n${pad}${b}`
    }
    items.push(s)
  }
  return items.length ? items.join(`\n${indent}`) : undefined
}

function renderBlock(n: RNode, indent: string): string | undefined {
  // Empty paragraphs, headings and quotes are left out; an empty list item is kept.
  if (n.type !== 'bullet_list' && n.type !== 'ordered_list' && !hasText(n)) return undefined
  switch (n.type) {
    case 'heading': {
      const text = renderInline((n.runs ?? []).map((r) => ({ ...r, text: r.text.replace(/\n/g, ' ') })), indent)
      return `${'#'.repeat(clampInt(n.attrs.level, 1, 6, 1))} ${text}`
    }
    case 'bullet_list':
    case 'ordered_list':
      return renderList(n, indent)
    case 'blockquote':
      return renderQuote(n, indent)
    case 'code_block':
      return renderCode(n, indent)
    case 'table':
      return renderTable(n, indent)
    case 'image':
      return `![${escapeText(String(n.attrs.alt ?? ''), true)}](attachment:${String(n.attrs.id ?? '')})`
    default:
      return renderInline(n.runs ?? [], indent)
  }
}

function renderBlocks(nodes: RNode[], indent: string): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.type === 'list_item' || n.type === 'table_row') {
      out.push(...renderBlocks(n.content ?? [], indent))
      continue
    }
    const b = renderBlock(n, indent)
    if (b !== undefined) out.push(b)
  }
  return out
}

/**
 * The Markdown text of a body: `#` headings, `**bold**`, `_italic_`, `~~strike~~`,
 * `` `code` ``, `[text](url)`, `-` and `1.` lists, `- [ ]`/`- [x]` check items,
 * `> ` quotes, fenced code blocks, pipe tables, `![alt](attachment:<id>)` images
 * and `@name` mentions; a hard line break is a newline. Empty blocks are left
 * out. Deterministic, so every device projects the same text from the same
 * merged document.
 */
export function renderMarkdown(nodes: RNode[]): string {
  return renderBlocks(nodes, '').map((b) => b.replace(/[ \t]+$/gm, '').replaceAll(KEEP, '')).join('\n\n')
}

// ---- Markdown parsing (for plain-text writes, legacy notes and comment bodies) ----

/** How `@name` resolves to a member while parsing; without it a mention is text. */
export interface ParseOptions {
  mention?: (token: string) => { id: string; name: string } | null
}

const LIST = /^( {0,3})([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
const TASK = /^\[( |x|X)\](?:[ \t]+(.*))?$/
const FENCE = /^( {0,3})(`{3,})([^`]*)$/
const QUOTE = /^ {0,3}> ?(.*)$/
const IMAGE = /^ {0,3}!\[((?:\\.|[^\]\\])*)\]\(attachment:([A-Za-z0-9_-]+)\)[ \t]*$/
const RULE_CELL = /^:?-+:?$/

const blank = (l: string) => l.trim() === ''
const nextFilled = (lines: string[], from: number) => {
  let k = from
  while (k < lines.length && blank(lines[k])) k++
  return k
}
const indentOf = (l: string) => l.length - l.replace(/^ +/, '').length

/** Parse Markdown (the supported subset) into the display model. Unknown syntax stays literal text. */
export function parseMarkdown(src: string, opts: ParseOptions = {}): RNode[] {
  return parseBlocks(src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), 0, opts)
}

/** The cells of a table line, split on unescaped `|`, outer pipes dropped. */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      cur += s[i] + s[i + 1]
      i++
    } else if (s[i] === '|') {
      cells.push(cur)
      cur = ''
    } else cur += s[i]
  }
  if (cur.trim() !== '' || !line.trim().endsWith('|')) cells.push(cur)
  return cells.map((c) => c.trim())
}

function alignOf(rule: string): string | null {
  const l = rule.startsWith(':')
  const r = rule.endsWith(':')
  return l && r ? 'center' : l ? 'left' : r ? 'right' : null
}

/** A pipe table starting at lines[i] (header, rule, rows), or null. */
function parseTable(lines: string[], i: number, depth: number, opts: ParseOptions): { node: RNode; next: number } | null {
  if (i + 1 >= lines.length || !lines[i].includes('|')) return null
  const head = splitRow(lines[i])
  const rule = splitRow(lines[i + 1])
  if (head.length > MAX_TABLE_COLS || rule.length !== head.length || !rule.every((c) => RULE_CELL.test(c))) return null
  const aligns = rule.map(alignOf)
  const row = (cells: string[], type: 'table_header' | 'table_cell'): RNode => ({
    type: 'table_row', attrs: {},
    content: aligns.map((align, c) => ({ type, attrs: { align }, runs: parseInline((cells[c] ?? '').replace(/\\\|/g, '|'), {}, depth, opts) })),
  })
  const rows = [row(head, 'table_header')]
  let j = i + 2
  while (j < lines.length && rows.length < MAX_TABLE_ROWS && !blank(lines[j]) && lines[j].includes('|')) rows.push(row(splitRow(lines[j++]), 'table_cell'))
  return { node: { type: 'table', attrs: {}, content: rows }, next: j }
}

function parseFence(lines: string[], i: number): { node: RNode; next: number } | null {
  const f = FENCE.exec(lines[i])
  if (!f) return null
  const strip = f[1].length
  const body: string[] = []
  let j = i + 1
  for (; j < lines.length; j++) {
    const close = /^ {0,3}(`{3,})[ \t]*$/.exec(lines[j])
    if (close && close[1].length >= f[2].length) {
      j++
      break
    }
    body.push(lines[j].slice(Math.min(strip, indentOf(lines[j]))))
  }
  const text = body.join('\n')
  return { node: { type: 'code_block', attrs: { lang: f[3].trim() }, runs: text ? [{ text, marks: {} }] : [] }, next: j }
}

/** A line that starts a block of its own (it ends a paragraph). */
function startsBlock(lines: string[], i: number): boolean {
  const l = lines[i]
  return !!(LIST.exec(l) || HEADING.exec(l) || FENCE.exec(l) || QUOTE.exec(l) || IMAGE.exec(l) || parseTable(lines, i, 12, {}))
}

function parseListItems(lines: string[], start: number, depth: number, opts: ParseOptions, ordered: boolean): { items: RNode[]; next: number } {
  const items: RNode[] = []
  let i = start
  while (i < lines.length) {
    if (blank(lines[i])) {
      // A loose list: blank lines between items of the same kind.
      const k = nextFilled(lines, i)
      const next = k < lines.length ? LIST.exec(lines[k]) : null
      if (!next || /\d/.test(next[2]) !== ordered) break
      i = k
    }
    const m = LIST.exec(lines[i])
    if (!m || /\d/.test(m[2]) !== ordered) break
    const width = m[1].length + m[2].length + 1
    const body: string[] = [m[3] ?? '']
    i++
    while (i < lines.length) {
      const l = lines[i]
      if (blank(l)) {
        // Blank lines stay inside the item when indented content follows.
        const k = nextFilled(lines, i)
        if (k < lines.length && indentOf(lines[k]) >= 2) {
          for (; i < k; i++) body.push('')
          continue
        }
        break
      }
      const ind = indentOf(l)
      if (ind >= 2) {
        body.push(l.slice(Math.min(ind, width)))
        i++
        continue
      }
      if (LIST.exec(l) || HEADING.exec(l)) break
      // A lazy continuation line joins the item's first paragraph.
      if (body.length > 0 && !blank(body[body.length - 1])) {
        body.push(l.trim())
        i++
        continue
      }
      break
    }
    let checked: boolean | null = null
    const task = TASK.exec(body[0])
    if (task) {
      checked = task[1] !== ' '
      body[0] = task[2] ?? ''
    }
    // The first line is the item's paragraph even when it looks like a block.
    const head = [body[0]]
    let j = 1
    while (j < body.length && !blank(body[j]) && !startsBlock(body, j)) head.push(body[j++])
    const content: RNode[] = [{ type: 'paragraph', attrs: {}, runs: parseInline(head.map((x) => x.trim()).join('\n'), {}, 0, opts) }]
    content.push(...parseBlocks(body.slice(j), depth + 1, opts))
    items.push({ type: 'list_item', attrs: { checked }, content })
  }
  return { items, next: i }
}

function parseBlocks(lines: string[], depth: number, opts: ParseOptions): RNode[] {
  const out: RNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) {
      i++
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      out.push({ type: 'heading', attrs: { level: h[1].length }, runs: parseInline((h[2] ?? '').trim(), {}, 0, opts) })
      i++
      continue
    }
    const fence = parseFence(lines, i)
    if (fence) {
      out.push(fence.node)
      i = fence.next
      continue
    }
    if (QUOTE.test(line) && depth < 16) {
      const inner: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) inner.push((QUOTE.exec(lines[i++]) as RegExpExecArray)[1])
      const content = parseBlocks(inner, depth + 1, opts)
      out.push({ type: 'blockquote', attrs: {}, content: content.length ? content : [{ type: 'paragraph', attrs: {}, runs: [] }] })
      continue
    }
    const img = IMAGE.exec(line)
    if (img) {
      out.push({ type: 'image', attrs: { id: img[2], alt: parseInline(img[1]).map((r) => r.text).join('') } })
      i++
      continue
    }
    const table = parseTable(lines, i, depth, opts)
    if (table) {
      out.push(table.node)
      i = table.next
      continue
    }
    const first = LIST.exec(line)
    if (first && depth < 16) {
      const ordered = /\d/.test(first[2])
      const { items, next } = parseListItems(lines, i, depth, opts, ordered)
      i = next
      out.push(ordered ? { type: 'ordered_list', attrs: { order: clampInt(first[2].slice(0, -1), 1, 1e9, 1) }, content: items } : { type: 'bullet_list', attrs: {}, content: items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && !blank(lines[i]) && (para.length === 0 || !startsBlock(lines, i))) para.push(lines[i++].trim())
    // A backslash at the end of a line is the other spelling of a hard break.
    const joined = para.map((l, k) => (k < para.length - 1 && l.length > 1 && /(^|[^\\])(\\\\)*\\$/.test(l) ? l.slice(0, -1) : l)).join('\n')
    out.push({ type: 'paragraph', attrs: {}, runs: parseInline(joined, {}, 0, opts) })
  }
  return out
}

function withMark(marks: Marks, mark: string, attrs: Record<string, unknown> = {}): Marks {
  return { ...marks, [mark]: attrs }
}

/** Index of the closing delimiter, skipping escapes and code spans; -1 when none. */
function findClose(s: string, from: number, delim: string, check?: (at: number) => boolean): number {
  let i = from
  while (i < s.length) {
    const c = s[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '`') {
      let n = 1
      while (s[i + n] === '`') n++
      const end = s.indexOf('`'.repeat(n), i + n)
      if (end > 0) {
        i = end + n
        continue
      }
    }
    if (s.startsWith(delim, i) && (!check || check(i))) return i
    i++
  }
  return -1
}

const MENTION = /^@([\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*)/u

/** Parse inline Markdown into runs. Unmatched delimiters are literal. */
export function parseInline(s: string, marks: Marks = {}, depth = 0, opts: ParseOptions = {}): Run[] {
  const runs: Run[] = []
  let buf = ''
  const flush = () => {
    if (buf) pushRun(runs, buf, marks)
    buf = ''
  }
  const nest = (inner: string, m: Marks) => {
    flush()
    for (const r of depth < 12 ? parseInline(inner, m, depth + 1, opts) : [{ text: inner, marks: m }]) pushRun(runs, r.text, r.marks)
  }
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length && PUNCT.includes(s[i + 1])) {
      buf += s[i + 1]
      i += 2
      continue
    }
    if (c === '`') {
      let n = 1
      while (s[i + n] === '`') n++
      const fence = '`'.repeat(n)
      let end = s.indexOf(fence, i + n)
      while (end > 0 && s[end + n] === '`') end = s.indexOf(fence, end + n + 1)
      if (end > 0) {
        let code = s.slice(i + n, end)
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1)
        flush()
        pushRun(runs, code, withMark(marks, 'code'))
        i = end + n
        continue
      }
      buf += fence
      i += n
      continue
    }
    if (c === '@' && opts.mention && !marks.mention && !marks.code && !isWord(s[i - 1])) {
      const m = MENTION.exec(s.slice(i))
      const who = m ? opts.mention(m[1]) : null
      if (m && who) {
        flush()
        pushRun(runs, m[0], withMark(marks, 'mention', { id: who.id, name: who.name }))
        i += m[0].length
        continue
      }
    }
    if (s.startsWith('**', i) && !marks.strong) {
      let end = findClose(s, i + 2, '**')
      // In a run like `***` the strong delimiter is the last two stars.
      while (end > 0 && s[end + 2] === '*') end++
      if (end > i + 2) {
        nest(s.slice(i + 2, end), withMark(marks, 'strong'))
        i = end + 2
        continue
      }
    }
    if (s.startsWith('~~', i) && !marks.strike) {
      const end = findClose(s, i + 2, '~~')
      if (end > i + 2) {
        nest(s.slice(i + 2, end), withMark(marks, 'strike'))
        i = end + 2
        continue
      }
    }
    if (c === '*' && s[i + 1] !== '*' && !marks.em) {
      const end = findClose(s, i + 1, '*', (at) => s[at + 1] !== '*' && s[at - 1] !== '*')
      if (end > i + 1) {
        nest(s.slice(i + 1, end), withMark(marks, 'em'))
        i = end + 1
        continue
      }
    }
    if (c === '_' && !isWord(s[i - 1]) && !marks.em) {
      const end = findClose(s, i + 1, '_', (at) => !isWord(s[at + 1]))
      if (end > i + 1) {
        nest(s.slice(i + 1, end), withMark(marks, 'em'))
        i = end + 1
        continue
      }
    }
    if (c === '[' && !marks.link) {
      const close = findClose(s, i + 1, ']')
      if (close > i && s[close + 1] === '(') {
        const paren = s.indexOf(')', close + 2)
        const href = paren > 0 ? s.slice(close + 2, paren).trim() : ''
        if (paren > 0 && href && !/\s/.test(href)) {
          nest(s.slice(i + 1, close), withMark(marks, 'link', { href }))
          i = paren + 1
          continue
        }
      }
    }
    buf += c
    i++
  }
  flush()
  return runs
}
