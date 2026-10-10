// Mergeable rich-text notes (OpenSpec change `collaborative-rich-text`).
//
// This module is loaded lazily (see richtextLoader.ts): it pulls in Yjs, which
// must not grow the initial bundle. It is field-agnostic: task.notes_doc today,
// comment bodies later.
//
// Value format ("document envelope", docs/sync.md "Mergeable documents"):
//   ""                                  no document yet (the note is `description`)
//   "ydoc:v1:" + base64(Yjs update)     the full document state, update format v1
// The server checks only the envelope shape, never the content. Other envelopes
// (e.g. an end-to-end encrypted "enc:v1:…") are opaque here: decodeDoc returns
// null and callers fall back to the plain-text projection.
//
// Document layout inside the Yjs doc:
//   root XmlFragment "b:<ts 15 digits>:<device>"   one body per fold-back
// The visible body is the root fragment with the greatest name. A body starts
// as the default "b:000000000000000:" (a note first written in the editor), and
// every fold-back of a plain-text `description` write creates the body named
// after that write's clock. Inside a body, elements mirror the editor schema
// (paragraph, heading{level}, bullet_list, ordered_list{order},
// list_item{checked}); text blocks hold one XmlText whose formatting attributes
// are marks (strong, em, strike, code: {}; link: {href}). A hard line break is a
// "\n" character. Unknown elements, attributes and marks (from newer clients) are
// kept by every merge and never rewritten unless the user edits that text.
import * as Y from 'yjs'
import { MAX_DOC_CHARS } from './docfields'

export { MAX_DOC_CHARS }
export const DOC_PREFIX = 'ydoc:v1:'
/** The editor warns from here on (90 % of the cap). */
export const WARN_DOC_CHARS = Math.floor(MAX_DOC_CHARS * 0.9)

const BODY = 'b:'
export const DEFAULT_BODY = `${BODY}${'0'.repeat(15)}:`

// ---- neutral model (what a client of this build displays) ----

export type Marks = Record<string, Record<string, unknown>>
/** A run of text with its marks; "\n" inside text is a hard line break. */
export interface Run {
  text: string
  marks: Marks
}
export interface RNode {
  type: 'paragraph' | 'heading' | 'bullet_list' | 'ordered_list' | 'list_item'
  attrs: Record<string, unknown>
  /** Child blocks (lists, list items). */
  content?: RNode[]
  /** Inline content (paragraph, heading). */
  runs?: Run[]
}

/** Marks in nesting order: a link wraps bold wraps italic wraps strike wraps code. */
export const KNOWN_MARKS = ['link', 'strong', 'em', 'strike', 'code'] as const
const TEXTBLOCKS = new Set(['paragraph', 'heading'])
const CONTAINERS = new Set(['bullet_list', 'ordered_list', 'list_item'])
const KNOWN_ATTRS: Record<string, string[]> = { heading: ['level'], ordered_list: ['order'], list_item: ['checked'] }

// ---- envelope ----

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** A fresh document (garbage collection on: deleted text shrinks to a few bytes). */
export function newDoc(clientID?: number): Y.Doc {
  const doc = new Y.Doc({ gc: true })
  if (clientID !== undefined) doc.clientID = clientID
  return doc
}

/** The raw Yjs update inside an envelope, null for "" and for anything unreadable. */
export function docBytes(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !value.startsWith(DOC_PREFIX)) return null
  try {
    return fromBase64(value.slice(DOC_PREFIX.length))
  } catch {
    return null
  }
}

/** True for "", false for a value this build cannot decode (corrupt, encrypted, newer format). */
export function isReadable(value: unknown): boolean {
  if (value === '' || value === undefined || value === null) return true
  return decodeDoc(value) !== null
}

/**
 * Decode an envelope into a Y.Doc. "" (or a missing value) is an empty document;
 * an unreadable value is null so callers can fall back to `description`.
 */
export function decodeDoc(value: unknown): Y.Doc | null {
  const doc = newDoc()
  if (value === '' || value === undefined || value === null) return doc
  const bytes = docBytes(value)
  if (!bytes) return null
  try {
    Y.applyUpdate(doc, bytes)
    // Reading the visible body proves the structure is usable.
    toModel(activeBody(doc))
    return doc
  } catch {
    return null
  }
}

export function encodeDoc(doc: Y.Doc): string {
  return DOC_PREFIX + toBase64(Y.encodeStateAsUpdate(doc))
}

/**
 * The union of two documents (Yjs merge: commutative, associative, idempotent).
 * An unreadable side contributes nothing; "" stays "" when both are empty.
 */
export function mergeDocs(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  const da = decodeDoc(a)
  const bb = docBytes(b)
  if (!da) return decodeDoc(b) ? b : a
  if (!bb || !decodeDoc(b)) return a
  Y.applyUpdate(da, bb)
  return encodeDoc(da)
}

/**
 * Whether `extra` holds anything `base` lacks: an insertion (including a format
 * change) or a deletion. Applying `extra` to a copy of `base` and watching the
 * transaction catches both; comparing state vectors alone would miss deletions.
 */
export function adds(base: string, extra: string): boolean {
  if (!extra) return false
  const bb = docBytes(extra)
  if (!bb) return false
  const d = decodeDoc(base) ?? newDoc()
  let grew = false
  d.on('afterTransaction', (tr: Y.Transaction) => {
    if (tr.deleteSet.clients.size > 0) grew = true
    for (const [client, clock] of tr.afterState) if ((tr.beforeState.get(client) ?? 0) !== clock) grew = true
  })
  try {
    Y.applyUpdate(d, bb)
  } catch {
    return false
  }
  return grew
}

// ---- bodies ----

/** Root name of the body folded from a plain-text write with clock (ts, device). */
export function bodyName(ts: number, device: string): string {
  return `${BODY}${String(Math.max(0, Math.floor(ts))).padStart(15, '0')}:${device}`
}

/** The name of the visible body: the greatest "b:" root, or the default one. */
export function activeBodyName(doc: Y.Doc): string {
  let best = DEFAULT_BODY
  for (const name of doc.share.keys()) if (name.startsWith(BODY) && name > best) best = name
  return best
}

export function activeBody(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment(activeBodyName(doc))
}

/** FNV-1a of the body name: the client id that writes a fold-back, the same on every device. */
function foldClient(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h || 1
}

/**
 * Fold a plain-text (Markdown) write back into the document (design D2): the
 * text, parsed, becomes a new body named after the write's clock, and the content
 * of every older body is deleted. The new body is written by a client id derived
 * from its name into an empty fragment, so every device that folds the same write
 * produces byte-identical structures and the copies merge into one. Returns the
 * new envelope.
 */
export function foldText(value: string, text: string, ts: number, device: string): string {
  const doc = decodeDoc(value) ?? newDoc()
  const name = bodyName(ts, device)
  const client = foldClient(name)
  if (Y.getState(doc.store, client) === 0) {
    const tmp = newDoc(client)
    tmp.transact(() => insertModel(tmp.getXmlFragment(name), 0, parseMarkdown(text)))
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(tmp))
  }
  doc.transact(() => {
    for (const key of [...doc.share.keys()]) {
      if (!key.startsWith(BODY) || key >= name) continue
      const old = doc.getXmlFragment(key)
      if (old.length > 0) old.delete(0, old.length)
    }
  })
  return encodeDoc(doc)
}

/** The Markdown projection of a document envelope ("" for "" or unreadable). */
export function projectDoc(value: string): string {
  const doc = decodeDoc(value)
  return doc ? renderMarkdown(toModel(activeBody(doc))) : ''
}

// ---- Yjs <-> model ----

function knownMarks(attrs: Record<string, unknown> | undefined): Marks {
  const out: Marks = {}
  if (!attrs) return out
  for (const m of KNOWN_MARKS) {
    const v = attrs[m]
    if (v === null || v === undefined || v === false) continue
    if (m === 'link') {
      const href = typeof v === 'object' && typeof (v as { href?: unknown }).href === 'string' ? (v as { href: string }).href : ''
      if (href) out.link = { href }
    } else out[m] = {}
  }
  return out
}

function runsOf(texts: Y.XmlText[]): Run[] {
  const runs: Run[] = []
  for (const t of texts) {
    for (const d of t.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
      if (typeof d.insert !== 'string' || !d.insert) continue
      pushRun(runs, d.insert, knownMarks(d.attributes))
    }
  }
  return runs
}

function sameMarks(a: Marks, b: Marks): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) {
    if (!(k in b)) return false
    if (k === 'link' && a.link.href !== b.link.href) return false
  }
  return true
}

function pushRun(runs: Run[], text: string, marks: Marks): void {
  const last = runs[runs.length - 1]
  if (last && sameMarks(last.marks, marks)) last.text += text
  else runs.push({ text, marks })
}

function plainText(el: Y.XmlElement | Y.XmlText): string {
  if (el instanceof Y.XmlText) return runsOf([el]).map((r) => r.text).join('')
  return el.toArray().map((c) => plainText(c as Y.XmlElement | Y.XmlText)).filter(Boolean).join('\n')
}

function attrsOf(type: string, el: Y.XmlElement): Record<string, unknown> {
  const all = el.getAttributes() as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (type === 'heading') out.level = clampInt(all.level, 1, 6, 1)
  if (type === 'ordered_list') out.order = clampInt(all.order, 1, 1e9, 1)
  if (type === 'list_item') out.checked = typeof all.checked === 'boolean' ? all.checked : null
  return out
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}

/**
 * How this build displays one stored child: known nodes as they are, unknown
 * nodes (from newer clients) as a paragraph with their text. Unknown marks and
 * attributes are not part of the display model.
 */
export function nodeModel(child: Y.XmlElement | Y.XmlText): RNode {
  if (child instanceof Y.XmlText) return { type: 'paragraph', attrs: {}, runs: runsOf([child]) }
  const type = child.nodeName
  const kids = child.toArray() as (Y.XmlElement | Y.XmlText)[]
  if (TEXTBLOCKS.has(type)) {
    return { type: type as RNode['type'], attrs: attrsOf(type, child), runs: runsOf(kids.filter((k): k is Y.XmlText => k instanceof Y.XmlText)) }
  }
  if (CONTAINERS.has(type)) {
    const content = kids.map(nodeModel)
    if (type === 'list_item') {
      if (content.length === 0 || content[0].type !== 'paragraph') content.unshift({ type: 'paragraph', attrs: {}, runs: [] })
      return { type: 'list_item', attrs: attrsOf(type, child), content }
    }
    // A list holds items only; anything else is wrapped so the shape stays valid.
    return { type: type as RNode['type'], attrs: attrsOf(type, child), content: content.map((n) => (n.type === 'list_item' ? n : { type: 'list_item', attrs: { checked: null }, content: [n.type === 'paragraph' ? n : { type: 'paragraph', attrs: {}, runs: [] }] })) }
  }
  // Unknown node type: its text, shown as a paragraph.
  const isText = kids.every((k) => k instanceof Y.XmlText)
  return { type: 'paragraph', attrs: {}, runs: isText ? runsOf(kids as Y.XmlText[]) : plainRuns(plainText(child)) }
}

function plainRuns(text: string): Run[] {
  return text ? [{ text, marks: {} }] : []
}

/** The display model of a body. */
export function toModel(body: Y.XmlFragment | Y.XmlElement): RNode[] {
  return (body.toArray() as (Y.XmlElement | Y.XmlText)[]).map(nodeModel)
}

function attrsFor(marks: Marks): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const m of KNOWN_MARKS) out[m] = marks[m] ? (m === 'link' ? { href: marks.link.href } : {}) : null
  return out
}

function fillElement(el: Y.XmlElement, node: RNode): void {
  for (const [k, v] of Object.entries(node.attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v as string)
  if (TEXTBLOCKS.has(node.type)) {
    const t = new Y.XmlText()
    el.insert(0, [t])
    let pos = 0
    for (const r of node.runs ?? []) {
      if (!r.text) continue
      t.insert(pos, r.text, attrsFor(r.marks))
      pos += r.text.length
    }
  } else insertModel(el, 0, node.content ?? [])
}

/** Insert model nodes into an integrated parent at `index` (deterministic sequence of edits). */
export function insertModel(parent: Y.XmlFragment | Y.XmlElement, index: number, nodes: RNode[]): void {
  nodes.forEach((node, i) => {
    const el = new Y.XmlElement(node.type)
    parent.insert(index + i, [el])
    fillElement(el, node)
  })
}

// ---- editor -> Yjs: minimal update ----

function canon(n: RNode): string {
  return JSON.stringify(n)
}

/** Normalise a model coming from the editor so it compares with nodeModel output. */
export function normalizeModel(nodes: RNode[]): RNode[] {
  return nodes.map((n) => {
    if (TEXTBLOCKS.has(n.type)) {
      const runs: Run[] = []
      for (const r of n.runs ?? []) if (r.text) pushRun(runs, r.text, knownMarks(r.marks as Record<string, unknown>))
      const attrs: Record<string, unknown> = n.type === 'heading' ? { level: clampInt(n.attrs.level, 1, 6, 1) } : {}
      return { type: n.type, attrs, runs }
    }
    const attrs: Record<string, unknown> = n.type === 'ordered_list' ? { order: clampInt(n.attrs.order, 1, 1e9, 1) }
      : n.type === 'list_item' ? { checked: typeof n.attrs.checked === 'boolean' ? n.attrs.checked : null } : {}
    return { type: n.type, attrs, content: normalizeModel(n.content ?? []) }
  })
}

/**
 * Change a body so it displays `target`, touching as little as possible: equal
 * leading and trailing blocks are kept, a changed block is updated in place
 * (attributes, then a character diff of its text and a format pass), and only
 * the remainder is deleted or inserted. Unknown marks, attributes and nodes the
 * edit did not reach are left exactly as they were. Call inside a transaction.
 */
export function updateBody(parent: Y.XmlFragment | Y.XmlElement, target: RNode[]): void {
  target = normalizeModel(target)
  const ys = parent.toArray() as (Y.XmlElement | Y.XmlText)[]
  const cur = ys.map((y) => canon(nodeModel(y)))
  const tgt = target.map(canon)
  let s = 0
  while (s < ys.length && s < target.length && cur[s] === tgt[s]) s++
  let e = 0
  while (e < ys.length - s && e < target.length - s && cur[ys.length - 1 - e] === tgt[target.length - 1 - e]) e++
  const yMid = ys.slice(s, ys.length - e)
  const tMid = target.slice(s, target.length - e)
  const common = Math.min(yMid.length, tMid.length)
  for (let i = 0; i < common; i++) {
    const y = yMid[i]
    if (!updateNode(y, tMid[i])) {
      parent.delete(s + i, 1)
      insertModel(parent, s + i, [tMid[i]])
    }
  }
  if (yMid.length > common) parent.delete(s + common, yMid.length - common)
  if (tMid.length > common) insertModel(parent, s + common, tMid.slice(common))
}

/** Update one stored node in place; false when it must be replaced. */
function updateNode(y: Y.XmlElement | Y.XmlText, t: RNode): boolean {
  if (y instanceof Y.XmlText) {
    if (t.type !== 'paragraph') return false
    updateText(y, t.runs ?? [])
    return true
  }
  const name = y.nodeName
  const known = TEXTBLOCKS.has(name) || CONTAINERS.has(name)
  if (known && name !== t.type) return false
  const kids = y.toArray() as (Y.XmlElement | Y.XmlText)[]
  if (!known) {
    // An unknown node edited as a paragraph: keep the element (and its unknown
    // attributes) when it is a plain text holder, otherwise replace it.
    if (t.type !== 'paragraph' || !kids.every((k) => k instanceof Y.XmlText)) return false
  }
  for (const k of KNOWN_ATTRS[t.type] ?? []) {
    const want = t.attrs[k] ?? null
    const have = y.getAttribute(k) ?? null
    if (want === null && have !== null) y.removeAttribute(k)
    else if (want !== null && want !== have) y.setAttribute(k, want as string)
  }
  if (TEXTBLOCKS.has(t.type)) {
    let text = kids.find((k): k is Y.XmlText => k instanceof Y.XmlText)
    if (!text) {
      text = new Y.XmlText()
      y.insert(0, [text])
    }
    // Stray children of a text block (an older bug, another client) go.
    const extra = y.toArray().filter((k) => k !== text)
    for (const k of extra) {
      const at = y.toArray().indexOf(k)
      if (at >= 0) y.delete(at, 1)
    }
    updateText(text, t.runs ?? [])
  } else updateBody(y, t.content ?? [])
  return true
}

interface Ch {
  c: string
  m: string
  marks: Marks
}

function chars(runs: { text: string; marks: Marks }[]): Ch[] {
  const out: Ch[] = []
  for (const r of runs) {
    const m = JSON.stringify(attrsFor(r.marks))
    for (const c of r.text) for (let i = 0; i < c.length; i++) out.push({ c: c[i], m, marks: r.marks })
  }
  return out
}

const isHigh = (c: string | undefined) => !!c && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdbff
const isLow = (c: string | undefined) => !!c && c.charCodeAt(0) >= 0xdc00 && c.charCodeAt(0) <= 0xdfff

function updateText(text: Y.XmlText, target: Run[]): void {
  const cur: Ch[] = []
  for (const d of text.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
    if (typeof d.insert === 'string') {
      const marks = knownMarks(d.attributes)
      const m = JSON.stringify(attrsFor(marks))
      for (let i = 0; i < d.insert.length; i++) cur.push({ c: d.insert[i], m, marks })
    } else cur.push({ c: '\u0000', m: '', marks: {} }) // an embed: never equal to typed text
  }
  const tgt = chars(target)
  let p = 0
  while (p < cur.length && p < tgt.length && cur[p].c === tgt[p].c) p++
  if (p > 0 && p < Math.max(cur.length, tgt.length) && isHigh(cur[p - 1]?.c)) p-- // never split a surrogate pair
  let q = 0
  while (q < cur.length - p && q < tgt.length - p && cur[cur.length - 1 - q].c === tgt[tgt.length - 1 - q].c) q++
  if (q > 0 && isLow(cur[cur.length - q]?.c)) q--
  // Formatting differences in the kept prefix and suffix (lengths unchanged).
  const format = (from: number, to: number, offset: number) => {
    let i = from
    while (i < to) {
      if (cur[i].m === tgt[i + offset].m) {
        i++
        continue
      }
      let j = i + 1
      while (j < to && cur[j].m === cur[i].m && tgt[j + offset].m === tgt[i + offset].m) j++
      const want = attrsFor(tgt[i + offset].marks)
      const have = attrsFor(cur[i].marks)
      const diff: Record<string, unknown> = {}
      for (const k of KNOWN_MARKS) if (JSON.stringify(want[k]) !== JSON.stringify(have[k])) diff[k] = want[k]
      text.format(i, j - i, diff)
      i = j
    }
  }
  format(0, p, 0)
  format(cur.length - q, cur.length, tgt.length - cur.length)
  const del = cur.length - p - q
  if (del > 0) text.delete(p, del)
  let pos = p
  let i = p
  const end = tgt.length - q
  while (i < end) {
    let j = i + 1
    while (j < end && tgt[j].m === tgt[i].m) j++
    const s = tgt.slice(i, j).map((x) => x.c).join('')
    text.insert(pos, s, attrsFor(tgt[i].marks))
    pos += s.length
    i = j
  }
}

// ---- Markdown projection ----

const PUNCT = '\\`*_{}[]()#+-.!~>|<'

function escapeText(s: string, inLink: boolean): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const prev = s[i - 1] ?? ' '
    const next = s[i + 1] ?? ' '
    if (c === '\\' || c === '`' || c === '*' || c === '[' || (inLink && c === ']')) out += `\\${c}`
    else if (c === '~' && (next === '~' || prev === '~' || i === 0 || i === s.length - 1)) out += '\\~'
    else if (c === '_' && (!/[\p{L}\p{N}]/u.test(prev) || !/[\p{L}\p{N}]/u.test(next))) out += '\\_'
    else out += c
  }
  return out
}

const BLOCK_START = /^(\s*)(#{1,6}(?=\s|$)|[-+*](?=\s|$)|\d{1,9}(?=[.)](\s|$))|>)/

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

/** Inline Markdown for runs; newlines become "\n" + indent with line starts escaped. */
export function renderInline(runs: Run[], indent = ''): string {
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
    const want = KNOWN_MARKS.filter((m) => m !== 'code' && r.marks[m]).map((m) => ({ mark: m as string, href: m === 'link' ? String(r.marks.link.href) : undefined }))
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
      if (r.marks.code) out += codeSpan(line)
      else {
        const esc = escapeText(line, inLink)
        out += atLineStart ? escapeLineStart(esc) : esc
      }
      atLineStart = false
    })
  }
  close(0)
  return resolveEmphasis(out)
}

function hasText(n: RNode): boolean {
  if (n.runs) return n.runs.some((r) => r.text.trim() !== '')
  return (n.content ?? []).some(hasText)
}

function renderBlocks(nodes: RNode[], indent: string): string[] {
  const out: string[] = []
  for (const n of nodes) {
    switch (n.type) {
      case 'heading': {
        if (!hasText(n)) break
        const text = renderInline((n.runs ?? []).map((r) => ({ ...r, text: r.text.replace(/\n/g, ' ') })), indent)
        out.push(`${'#'.repeat(clampInt(n.attrs.level, 1, 6, 1))} ${text}`)
        break
      }
      case 'bullet_list':
      case 'ordered_list': {
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
        if (items.length) out.push(items.join(`\n${indent}`))
        break
      }
      case 'list_item':
        out.push(...renderBlocks(n.content ?? [], indent))
        break
      default: {
        if (!hasText(n)) break
        out.push(renderInline(n.runs ?? [], indent))
      }
    }
  }
  return out
}

/**
 * The Markdown text of a body: `#` headings, `**bold**`, `_italic_`, `~~strike~~`,
 * `` `code` ``, `[text](url)`, `-` and `1.` lists, `- [ ]`/`- [x]` check items;
 * a hard line break is a newline. Empty blocks are left out. Deterministic, so
 * every device projects the same text from the same merged document.
 */
export function renderMarkdown(nodes: RNode[]): string {
  return renderBlocks(nodes, '').map((b) => b.replace(/[ \t]+$/gm, '')).join('\n\n')
}

// ---- Markdown parsing (for plain-text writes and legacy notes) ----

const LIST = /^( {0,3})([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
const TASK = /^\[( |x|X)\](?:[ \t]+(.*))?$/

const blank = (l: string) => l.trim() === ''
const nextFilled = (lines: string[], from: number) => {
  let k = from
  while (k < lines.length && blank(lines[k])) k++
  return k
}
const indentOf = (l: string) => l.length - l.replace(/^ +/, '').length

/** Parse Markdown (the supported subset) into the display model. Unknown syntax stays literal text. */
export function parseMarkdown(src: string): RNode[] {
  return parseBlocks(src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), 0)
}

function parseBlocks(lines: string[], depth: number): RNode[] {
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
      out.push({ type: 'heading', attrs: { level: h[1].length }, runs: parseInline((h[2] ?? '').trim()) })
      i++
      continue
    }
    const first = LIST.exec(line)
    if (first && depth < 16) {
      const ordered = /\d/.test(first[2])
      const items: RNode[] = []
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
        while (j < body.length && !blank(body[j]) && !LIST.exec(body[j]) && !HEADING.exec(body[j])) head.push(body[j++])
        const content: RNode[] = [{ type: 'paragraph', attrs: {}, runs: parseInline(head.map((x) => x.trim()).join('\n')) }]
        content.push(...parseBlocks(body.slice(j), depth + 1))
        items.push({ type: 'list_item', attrs: { checked }, content })
      }
      out.push(ordered ? { type: 'ordered_list', attrs: { order: clampInt(first[2].slice(0, -1), 1, 1e9, 1) }, content: items } : { type: 'bullet_list', attrs: {}, content: items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && !blank(lines[i]) && (para.length === 0 || (!LIST.exec(lines[i]) && !HEADING.exec(lines[i])))) para.push(lines[i++].trim())
    out.push({ type: 'paragraph', attrs: {}, runs: parseInline(para.join('\n')) })
  }
  return out
}

function withMark(marks: Marks, mark: string, attrs: Record<string, unknown> = {}): Marks {
  return { ...marks, [mark]: attrs }
}

const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

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

/** Parse inline Markdown into runs. Unmatched delimiters are literal. */
export function parseInline(s: string, marks: Marks = {}, depth = 0): Run[] {
  const runs: Run[] = []
  let buf = ''
  const flush = () => {
    if (buf) pushRun(runs, buf, marks)
    buf = ''
  }
  const nest = (inner: string, m: Marks) => {
    flush()
    for (const r of depth < 12 ? parseInline(inner, m, depth + 1) : [{ text: inner, marks: m }]) pushRun(runs, r.text, r.marks)
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
