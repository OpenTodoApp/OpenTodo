// Unlinked mentions (OpenSpec change unlinked-mentions): the notes whose text names an
// item's title without linking to it (D1, D2), and Link, which turns one mention into
// a link in the source's document (D3). Pure matching over the rows the device holds,
// with each source's plain lines cached until its text changes; nothing is stored.
import type { Node as PMNode } from 'prosemirror-model'
import { normalizeText, snippetPlain, stripMarkdown, type SnippetSegment } from './noteSearch'
import { noteText, updatedOf } from './noteList'
import type { LinkKind } from './noteLinkGrammar'
import type { Note, Project, Task } from './types'

/** One row of Unlinked mentions. */
export interface Mention {
  kind: LinkKind
  id: string
  title: string
  projectId: string | null
  updated: number
  /** The line around the first mention, the title marked. */
  snippet: SnippetSegment[]
}

/** Titles shorter than this, normalised, are never matched (D2). */
export const MIN_TITLE = 3

const WORD = /[\p{L}\p{N}]/u
/** Scripts written without spaces between words: a substring there (D1, the fallback). */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}]/u

/** Whether `title` (normalised) occurs in `text` (normalised) as whole words; the index of the first, or -1. */
export function wholeWordAt(text: string, title: string, from = 0): number {
  if (!title) return -1
  const unspaced = UNSPACED.test(title)
  for (let i = text.indexOf(title, from); i >= 0; i = text.indexOf(title, i + 1)) {
    if (unspaced) return i
    const before = i > 0 ? text[i - 1] : ''
    const after = text[i + title.length] ?? ''
    if (!WORD.test(before) && !WORD.test(after)) return i
  }
  return -1
}

/**
 * A note's Markdown as plain lines to match (D1, D2): code blocks and inline code left
 * out, the text of every link (to anything) and images removed, Markdown stripped.
 */
export function mentionLines(md: string): string[] {
  const out: string[] = []
  let fence = false
  for (const raw of md.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(raw)) { fence = !fence; continue }
    if (fence) continue
    const line = raw
      .replace(/`[^`]*`/g, ' ')
      .replace(/!?\[(?:\\.|[^\]\\])*\]\([^)]*\)/g, ' ')
    const plain = stripMarkdown(line)
    if (plain.trim()) out.push(plain)
  }
  return out
}

const cache = new Map<string, { text: string; lines: { plain: string; norm: string }[] }>()

/** The cached plain and normalised lines of a source, rebuilt only when its text changed. */
function linesOf(key: string, text: string, lang?: string): { plain: string; norm: string }[] {
  const hit = cache.get(key)
  if (hit && hit.text === text) return hit.lines
  const lines = mentionLines(text).map((plain) => ({ plain, norm: normalizeText(plain, lang) }))
  cache.set(key, { text, lines })
  return lines
}

/** Forget the cache (the account locked, tests). */
export function clearMentionCache(): void {
  cache.clear()
}

/** The title a mention is matched by, or '' when it is never matched (short, or untitled). */
export function matchTitle(title: string, lang?: string): string {
  const n = normalizeText(title.trim(), lang).replace(/\s+/g, ' ')
  return [...n].length >= MIN_TITLE ? n : ''
}

const STANDALONE_FIELDS = ['title', 'notes_doc', 'description', 'labels', 'project_id']
const NOTE_FIELDS = ['notes_doc', 'description']

/**
 * The sources whose text mentions `title` and that do not link to the item (D1, D2):
 * task notes, project notes and standalone notes the device holds, never the item's
 * own, most recently changed first.
 */
export function findMentions(o: {
  kind: LinkKind; id: string; title: string
  tasks: readonly Task[]; projects: readonly Project[]; notes: readonly Note[]
  /** The sources linking to the item (`<kind>:<id>`): they are Linked references. */
  linking: ReadonlySet<string>
  lang?: string
}): Mention[] {
  const want = matchTitle(o.title, o.lang)
  if (!want) return []
  const self = `${o.kind}:${o.id}`
  const goneProjects = new Set(o.projects.filter((p) => p.deleted_at).map((p) => p.id))
  const out: Mention[] = []
  const visit = (kind: LinkKind, id: string, row: Task | Project | Note, title: string, projectId: string | null, updated: number) => {
    const key = `${kind}:${id}`
    if (key === self || o.linking.has(key)) return
    const text = noteText(row)
    if (!text.trim()) return
    for (const l of linesOf(key, text, o.lang)) {
      if (wholeWordAt(l.norm, want) < 0) continue
      out.push({ kind, id, title, projectId, updated, snippet: snippetPlain(l.plain, [want], 140, o.lang) })
      return
    }
  }
  for (const t of o.tasks) {
    if (t.deleted_at || (t.project_id && goneProjects.has(t.project_id))) continue
    visit('task', t.id, t, t.title, t.project_id, updatedOf(t._clock, NOTE_FIELDS))
  }
  for (const p of o.projects) if (!p.deleted_at) visit('project', p.id, p, p.name, null, updatedOf(p._clock, NOTE_FIELDS))
  for (const n of o.notes) {
    if (n.deleted_at || (n.project_id && goneProjects.has(n.project_id))) continue
    visit('note', n.id, n, n.title ?? '', n.project_id ?? null, updatedOf(n._clock, STANDALONE_FIELDS) || n.created_at || 0)
  }
  return out.sort((a, b) => b.updated - a.updated || (a.id < b.id ? -1 : 1))
}

/**
 * Where the first plain mention of `want` (normalised) is in a ProseMirror document
 * (D3): inside one text node, outside code blocks, inline code and links, as whole
 * words; null when none is left.
 */
export function mentionRange(doc: PMNode, want: string, lang?: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null
  doc.descendants((node, pos, parent) => {
    if (found) return false
    if (node.type.name === 'code_block') return false
    if (!node.isText || !node.text) return true
    if (parent?.type.name === 'code_block' || node.marks.some((m) => m.type.name === 'code' || m.type.name === 'link' || m.type.name === 'mention')) return false
    // The normalised text with each normalised character's original offset.
    const text = node.text
    let norm = ''
    const at: number[] = []
    let offset = 0
    for (const c of text) {
      const n = normalizeText(c, lang)
      for (let k = 0; k < n.length; k++) at.push(offset)
      norm += n
      offset += c.length
    }
    at.push(offset)
    const i = wholeWordAt(norm, want)
    if (i < 0) return false
    const startOff = at[i]
    const endOff = i + want.length < at.length ? at[i + want.length] : text.length
    found = { from: pos + startOff, to: pos + endOff }
    return false
  })
  return found
}
