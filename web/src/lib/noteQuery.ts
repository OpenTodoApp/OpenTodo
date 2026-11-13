// The Notes page's search tokens (OpenSpec change notes-space, design D6): filter
// tokens beside the words of the search field, each a chip naming what it filters
// by id. Pure functions over the rows the page holds, so they work offline and over
// an encrypted account's decrypted copy; nothing here reads IndexedDB or the network.
// Client-only (D8): the server's note search takes its own project and label parameters.
import { instantToLocalDue } from './dates'
import type { NoteEntry, NoteFilters, NoteSource } from './noteList'
import { normalizeText } from './noteSearch'

/** A committed token: a chip in the field. Names are kept for a chip whose item was deleted. */
export type NoteToken =
  | { key: 'in'; id: string; name: string }
  | { key: 'label'; id: string; name: string }
  | { key: 'kind'; value: NoteSource }
  | { key: 'linked'; id: string; name: string }
  | { key: 'orphan' }
  | { key: 'pinned' }
  /** Templates only (note-templates). */
  | { key: 'template' }
  | { key: 'changed'; value: string }

export type TokenKey = NoteToken['key']

/** What a token can name: the current workspace's projects, labels and standalone notes. */
export interface TokenWorld {
  projects: readonly { id: string; name: string; parent_id?: string | null; deleted_at?: number | null }[]
  labels: readonly { id: string; name: string; deleted_at?: number | null }[]
  notes: readonly { id: string; title?: string; deleted_at?: number | null }[]
}

/** The written form of each key, in the order suggestions offer them. */
export const KEY_WORDS: readonly { word: string; key: TokenKey }[] = [
  { word: 'in:', key: 'in' }, { word: 'label:', key: 'label' }, { word: 'kind:', key: 'kind' }, { word: 'linked:', key: 'linked' },
  { word: 'changed:', key: 'changed' }, { word: 'pinned', key: 'pinned' }, { word: 'orphan', key: 'orphan' }, { word: 'template', key: 'template' },
]

const KINDS: Record<string, NoteSource> = { note: 'note', notes: 'note', standalone: 'note', task: 'task', tasks: 'task', project: 'project', projects: 'project' }
export const KIND_VALUES: readonly NoteSource[] = ['note', 'task', 'project']

const norm = (s: string) => normalizeText(s).replace(/\s+/g, ' ').trim()
const unquote = (s: string) => (s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s.startsWith('"') ? s.slice(1) : s)

/** Splits a token's raw text into its key and value; null for a plain word. `#x` is `in:x`, `@x` is `label:x`. */
export function keyOf(raw: string): { key: TokenKey; value: string } | null {
  if (raw.startsWith('#') && raw.length > 0) return { key: 'in', value: unquote(raw.slice(1)) }
  if (raw.startsWith('@')) return { key: 'label', value: unquote(raw.slice(1)) }
  const m = /^([a-z]+):(.*)$/i.exec(raw)
  if (m) {
    const k = m[1].toLowerCase()
    const key = k === 'in' ? 'in' : k === 'label' ? 'label' : k === 'kind' ? 'kind' : k === 'linked' ? 'linked' : k === 'changed' ? 'changed' : null
    return key ? { key, value: unquote(m[2]) } : null
  }
  const w = raw.toLowerCase()
  if (w === 'pinned') return { key: 'pinned', value: '' }
  if (w === 'template' || w === 'templates') return { key: 'template', value: '' }
  if (w === 'orphan' || w === 'unlinked') return { key: 'orphan', value: '' }
  return null
}

/** A `changed:` value in its written form, or null when it is not one: `<7d`, `>2w`, `>3m`, today, yesterday, `[<>]YYYY-MM-DD`. */
export function changedValue(v: string): string | null {
  const s = v.trim().toLowerCase()
  if (s === 'today' || s === 'yesterday') return s
  if (/^[<>]\d{1,4}[dwm]$/.test(s)) return s
  const d = /^([<>]?)(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (d) {
    const at = new Date(Date.UTC(+d[2], +d[3] - 1, +d[4]))
    if (at.getUTCFullYear() === +d[2] && at.getUTCMonth() === +d[3] - 1 && at.getUTCDate() === +d[4]) return s
  }
  return null
}

const byName = <T extends { id: string; deleted_at?: number | null }>(rows: readonly T[], name: (r: T) => string, value: string): T | undefined => {
  const want = norm(value)
  return want ? rows.find((r) => !r.deleted_at && norm(name(r)) === want) : undefined
}

/** The chip a complete token's raw text makes, or null (a plain word, or a name nothing has). */
export function tokenOf(raw: string, w: TokenWorld): NoteToken | null {
  const k = keyOf(raw)
  if (!k) return null
  switch (k.key) {
    case 'pinned': case 'orphan': case 'template': return { key: k.key }
    case 'kind': { const value = KINDS[k.value.toLowerCase()]; return value ? { key: 'kind', value } : null }
    case 'changed': { const value = changedValue(k.value); return value ? { key: 'changed', value } : null }
    case 'in': { const p = byName(w.projects, (p) => p.name, k.value); return p ? { key: 'in', id: p.id, name: p.name } : null }
    case 'label': { const l = byName(w.labels, (l) => l.name, k.value); return l ? { key: 'label', id: l.id, name: l.name } : null }
    case 'linked': { const n = byName(w.notes, (n) => n.title ?? '', k.value); return n ? { key: 'linked', id: n.id, name: n.title ?? '' } : null }
  }
}

/** The field's text cut into words, quotes kept together; each with where it starts. */
export function segments(text: string): { raw: string; start: number; end: number }[] {
  const out: { raw: string; start: number; end: number }[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (i >= text.length) break
    const start = i
    let quoted = false
    while (i < text.length && (quoted || !/\s/.test(text[i]))) {
      if (text[i] === '"') quoted = !quoted
      i++
    }
    out.push({ raw: text.slice(start, i), start, end: i })
  }
  return out
}

/**
 * Moves the complete tokens out of the text into chips: every segment followed by
 * white space (or every segment, `all`, for a paste) that names something. Words and
 * tokens that name nothing stay as text, and the last segment stays while it is typed.
 */
export function commitTokens(text: string, w: TokenWorld, all = false): { text: string; tokens: NoteToken[] } {
  const tokens: NoteToken[] = []
  let rest = ''
  let from = 0
  for (const s of segments(text)) {
    const complete = all || s.end < text.length
    const tok = complete ? tokenOf(s.raw, w) : null
    if (tok) {
      rest += text.slice(from, s.start)
      from = s.end
      // The white space after a chip goes with it.
      while (from < text.length && /\s/.test(text[from])) from++
      tokens.push(tok)
    }
  }
  rest += text.slice(from)
  return { text: tokens.length ? rest.replace(/^\s+/, '') : text, tokens }
}

/** Adds chips, without one that is already there. */
export function addTokens(list: readonly NoteToken[], more: readonly NoteToken[]): NoteToken[] {
  const out = [...list]
  for (const t of more) if (!out.some((x) => sameToken(x, t))) out.push(t)
  return out
}

export function sameToken(a: NoteToken, b: NoteToken): boolean {
  if (a.key !== b.key) return false
  if ('id' in a && 'id' in b) return a.id === b.id
  if ('value' in a && 'value' in b) return a.value === b.value
  return true
}

/** The segment being typed at the end of the text, when it is the start of a token: what to suggest. */
export type Typing =
  | { kind: 'value'; key: Exclude<TokenKey, 'pinned' | 'orphan' | 'template'>; value: string; raw: string }
  | { kind: 'key'; words: string[]; raw: string }

export function typingOf(text: string): Typing | null {
  if (/\s$/.test(text)) return null
  const last = segments(text).at(-1)
  if (!last) return null
  const k = keyOf(last.raw)
  if (k && k.key !== 'pinned' && k.key !== 'orphan' && k.key !== 'template') return { kind: 'value', key: k.key, value: k.value, raw: last.raw }
  const w = last.raw.toLowerCase()
  if (w.length < 2 || !/^[a-z]+$/.test(w)) return null
  const words = KEY_WORDS.map((x) => x.word).filter((x) => x.startsWith(w) && x !== w)
  return words.length ? { kind: 'key', words, raw: last.raw } : null
}

/** The text with the segment being typed replaced by `by`. */
export function replaceTyping(text: string, typing: Typing, by: string): string {
  return text.slice(0, text.length - typing.raw.length) + by
}

/** The ids of a project and all its sub-projects. */
export function subtree(projects: TokenWorld['projects'], id: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const p of projects) if (p.parent_id) children.set(p.parent_id, [...(children.get(p.parent_id) ?? []), p.id])
  const out = new Set<string>()
  const walk = (x: string) => { if (out.has(x)) return; out.add(x); for (const c of children.get(x) ?? []) walk(c) }
  walk(id)
  return out
}

/** What matching needs beside the entries. */
export interface MatchContext {
  projects: TokenWorld['projects']
  pinnedIds: readonly string[]
  /** `<kind>:<id>` of every target something links to (orphan); null while the link index is built. */
  linked: ReadonlySet<string> | null
  /** The `<kind>:<id>` keys linked with a note either way (linked:); null while the index is built. */
  linkedWith: (noteId: string) => ReadonlySet<string> | null
  now: number
  /** The viewer's day of an instant (YYYY-MM-DD). */
  dayOf?: (ms: number) => string
}

const DAY = 86_400_000
const UNIT: Record<string, number> = { d: DAY, w: 7 * DAY, m: 30 * DAY }

function changedTest(value: string, ctx: MatchContext): (e: NoteEntry) => boolean {
  const dayOf = ctx.dayOf ?? ((ms: number) => instantToLocalDue(ms).date)
  const rel = /^([<>])(\d+)([dwm])$/.exec(value)
  if (rel) {
    const edge = ctx.now - Number(rel[2]) * UNIT[rel[3]]
    return rel[1] === '<' ? (e) => e.updated >= edge : (e) => e.updated < edge
  }
  const today = dayOf(ctx.now)
  if (value === 'today') return (e) => dayOf(e.updated) === today
  if (value === 'yesterday') {
    // The calendar day before today's, whatever the zone and the clock changes.
    const y = new Date(Date.parse(`${today}T00:00:00Z`) - DAY).toISOString().slice(0, 10)
    return (e) => dayOf(e.updated) === y
  }
  const op = value[0] === '<' || value[0] === '>' ? value[0] : ''
  const day = op ? value.slice(1) : value
  return op === '<' ? (e) => dayOf(e.updated) < day : op === '>' ? (e) => dayOf(e.updated) > day : (e) => dayOf(e.updated) === day
}

/**
 * The test the chips make (D6): keys combine with AND, chips of one key with OR.
 * Everything a chip needs (a project's sub-projects, a note's links) is worked out
 * once here, never per entry. Null while a chip waits for the link index.
 */
export function compileTokens(tokens: readonly NoteToken[], ctx: MatchContext): ((e: NoteEntry) => boolean) | null {
  const groups = new Map<TokenKey, ((e: NoteEntry) => boolean)[]>()
  const add = (k: TokenKey, f: (e: NoteEntry) => boolean) => groups.set(k, [...(groups.get(k) ?? []), f])
  for (const t of tokens) {
    switch (t.key) {
      case 'in': { const ids = subtree(ctx.projects, t.id); add('in', (e) => !!e.projectId && ids.has(e.projectId)); break }
      case 'label': add('label', (e) => e.labels.includes(t.id)); break
      case 'kind': add('kind', (e) => e.source === t.value); break
      case 'pinned': { const ids = new Set(ctx.pinnedIds); add('pinned', (e) => e.source === 'note' && ids.has(e.id)); break }
      case 'template': add('template', (e) => e.source === 'note' && !!e.template); break
      case 'orphan': {
        const linked = ctx.linked
        if (!linked) return null
        add('orphan', (e) => e.source === 'note' && !linked.has(e.key))
        break
      }
      case 'linked': {
        const keys = ctx.linkedWith(t.id)
        if (!keys) return null
        const self = `note:${t.id}`
        add('linked', (e) => e.key !== self && keys.has(e.key))
        break
      }
      case 'changed': add('changed', changedTest(t.value, ctx)); break
    }
  }
  const all = [...groups.values()]
  if (all.length === 0) return () => true
  return (e) => all.every((any) => any.some((f) => f(e)))
}

/** The entries the chips keep, in the same order; null while a chip waits for the link index. */
export function filterByTokens(entries: readonly NoteEntry[], tokens: readonly NoteToken[], ctx: MatchContext): NoteEntry[] | null {
  if (tokens.length === 0) return entries as NoteEntry[]
  const test = compileTokens(tokens, ctx)
  return test ? entries.filter(test) : null
}

/** Whether a chip's project, label or note is gone (it then reads struck out and matches nothing). */
export function missing(t: NoteToken, w: TokenWorld): boolean {
  const live = <T extends { id: string; deleted_at?: number | null }>(rows: readonly T[], id: string) => rows.some((r) => r.id === id && !r.deleted_at)
  return t.key === 'in' ? !live(w.projects, t.id) : t.key === 'label' ? !live(w.labels, t.id) : t.key === 'linked' ? !live(w.notes, t.id) : false
}

/** A chip in words: its key as written and its value under the item's current name. */
export function chipText(t: NoteToken, w: TokenWorld): { key: string; value: string } {
  const current = <T extends { id: string; deleted_at?: number | null }>(rows: readonly T[], id: string, name: (r: T) => string, kept: string) => {
    const r = rows.find((x) => x.id === id)
    return r ? name(r) : kept
  }
  switch (t.key) {
    case 'in': return { key: 'in:', value: current(w.projects, t.id, (p) => p.name, t.name) }
    case 'label': return { key: '@', value: current(w.labels, t.id, (l) => l.name, t.name) }
    case 'linked': return { key: 'linked:', value: current(w.notes, t.id, (n) => n.title ?? '', t.name) }
    case 'kind': return { key: 'kind:', value: t.value }
    case 'changed': return { key: 'changed:', value: t.value }
    default: return { key: t.key, value: '' }
  }
}

/** The filters an earlier version stored on the device, as chips (D6). */
export function tokensFromFilters(f: NoteFilters, w: TokenWorld): NoteToken[] {
  const out: NoteToken[] = []
  if (f.source === 'unlinked') out.push({ key: 'orphan' })
  else if (f.source !== 'all') out.push({ key: 'kind', value: f.source })
  const p = f.projectId ? w.projects.find((x) => x.id === f.projectId) : undefined
  if (f.projectId) out.push({ key: 'in', id: f.projectId, name: p?.name ?? '' })
  const l = f.labelId ? w.labels.find((x) => x.id === f.labelId) : undefined
  if (f.labelId) out.push({ key: 'label', id: f.labelId, name: l?.name ?? '' })
  return out
}

/** Reads stored chips; anything that is not a chip is left out. */
export function parseStoredTokens(v: unknown): NoteToken[] | null {
  if (!Array.isArray(v)) return null
  const out: NoteToken[] = []
  for (const x of v as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object') continue
    const s = (k: string) => (typeof x[k] === 'string' ? (x[k] as string) : null)
    if ((x.key === 'in' || x.key === 'label' || x.key === 'linked') && s('id')) out.push({ key: x.key, id: s('id')!, name: s('name') ?? '' })
    else if (x.key === 'kind' && KIND_VALUES.includes(x.value as NoteSource)) out.push({ key: 'kind', value: x.value as NoteSource })
    else if (x.key === 'changed' && s('value') && changedValue(s('value')!)) out.push({ key: 'changed', value: changedValue(s('value')!)! })
    else if (x.key === 'orphan' || x.key === 'pinned' || x.key === 'template') out.push({ key: x.key })
  }
  return out
}
