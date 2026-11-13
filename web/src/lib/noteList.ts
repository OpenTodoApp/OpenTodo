// The Notes page's list (OpenSpec change notes-overview, design D3) and its
// on-device search index (D4). Pure functions over the rows the app already
// holds; nothing here reads IndexedDB or the network, so the page and the
// palette work offline and on an encrypted account's decrypted copy.
import { compareHits, matchPrepared, normalizeText, parseQuery, snippetPlain, stripMarkdown, type NoteHit, type PreparedNote, type SnippetSegment } from './noteSearch'
import { pendingAppends } from './noteAppends'
import type { Clock, Note, Project, Task } from './types'

/** Where a note lives: a task's note, a project's note or a standalone note. */
export type NoteSource = 'task' | 'project' | 'note'

/** One row of the Notes page. */
export interface NoteEntry {
  /** `<source>:<id>`, unique across the three sources. */
  key: string
  source: NoteSource
  id: string
  /** The task's title, the project's name or the note's title ("" for an untitled note). */
  title: string
  /** The note as Markdown: the projection followed by pending appends. */
  text: string
  projectId: string | null
  labels: string[]
  /** When the note itself last changed (Unix ms): the greatest clock of its note fields. */
  updated: number
  /** When the note's home was created (Unix ms): the note, the task or the project (notes-sort D2). */
  created?: number
  /** A completed task or an archived project. */
  marker?: 'completed' | 'archived'
  /** A standalone note marked as a template (note-templates). */
  template?: boolean
}

/** How many rows a page shows, and how many Show more adds. */
export const NOTES_PAGE = 50

/** The fields whose change makes a task's or project's note "updated" (D3). */
const NOTE_FIELDS = ['notes_doc', 'description']
/** For a standalone note, its title, labels and project count too. */
const STANDALONE_FIELDS = ['title', 'notes_doc', 'description', 'labels', 'project_id']

/** The greatest clock among `fields` and the pending appends of a row. */
export function updatedOf(clock: Clock | undefined, fields: readonly string[]): number {
  let best = 0
  for (const [f, c] of Object.entries(clock ?? {})) {
    if (fields.includes(f) || f.startsWith('appends.')) best = Math.max(best, c.ts)
  }
  return best
}

/** A note's text as plain-text readers show it: the projection, then pending appends. */
export function noteText(row: { description?: string; appends?: Record<string, string>; _clock?: Clock }): string {
  const parts = [(row.description ?? '').replace(/\n+$/, '')].filter((s) => s.trim() !== '')
  for (const a of pendingAppends(row)) parts.push(a.text.replace(/\n+$/, ''))
  return parts.join('\n\n')
}

/**
 * Every note of the given rows, newest change first, ties by key: task notes
 * (tasks not deleted, in a project not deleted or none, with a non-empty note),
 * project notes (projects not deleted with a non-empty note) and standalone
 * notes (not deleted). Completed tasks and archived projects are marked.
 */
export function noteEntries(tasks: readonly Task[], projects: readonly Project[], notes: readonly Note[]): NoteEntry[] {
  const out: NoteEntry[] = []
  const deletedProjects = new Set(projects.filter((p) => p.deleted_at).map((p) => p.id))
  for (const t of tasks) {
    if (t.deleted_at || (t.project_id && deletedProjects.has(t.project_id))) continue
    const e = taskNoteEntry(t)
    if (e) out.push(e)
  }
  for (const p of projects) {
    if (p.deleted_at) continue
    const text = noteText(p)
    if (!text.trim()) continue
    out.push({ key: `project:${p.id}`, source: 'project', id: p.id, title: p.name, text, projectId: p.id, labels: [],
      updated: updatedOf(p._clock, NOTE_FIELDS), created: p.created_at, ...(p.archived ? { marker: 'archived' as const } : {}) })
  }
  for (const n of notes) {
    if (n.deleted_at) continue
    out.push({ key: `note:${n.id}`, source: 'note', id: n.id, title: n.title ?? '', text: noteText(n), projectId: n.project_id ?? null,
      labels: n.labels ?? [], updated: updatedOf(n._clock, STANDALONE_FIELDS) || n.created_at || 0, created: n.created_at, ...(n.template ? { template: true } : {}) })
  }
  return out.sort(byRecency)
}

/**
 * Whether two lists of entries show the same notes the same way: then the page
 * keeps the list it has, and a write elsewhere (a task's due date, a sync page)
 * does not filter and search the notes again.
 */
export function sameEntries(a: readonly NoteEntry[], b: readonly NoteEntry[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.key !== y.key || x.title !== y.title || x.text !== y.text || x.updated !== y.updated || x.created !== y.created || x.marker !== y.marker || x.template !== y.template
      || x.projectId !== y.projectId || x.labels.length !== y.labels.length || x.labels.some((l, j) => l !== y.labels[j])) return false
  }
  return true
}

/**
 * A task's note entry, kept per task row (list-rendering-at-scale D6): rows a write
 * did not touch are the same objects, so the 10,000 tasks behind the command bar's
 * notes are read again only where they changed.
 */
const taskEntries = new WeakMap<Task, NoteEntry | null>()
function taskNoteEntry(t: Task): NoteEntry | null {
  const known = taskEntries.get(t)
  if (known !== undefined) return known
  const text = noteText(t)
  const e: NoteEntry | null = text.trim()
    ? { key: `task:${t.id}`, source: 'task', id: t.id, title: t.title, text, projectId: t.project_id, labels: t.labels ?? [],
      updated: updatedOf(t._clock, NOTE_FIELDS), created: t.created_at, ...(t.completed_at ? { marker: 'completed' as const } : {}) }
    : null
  taskEntries.set(t, e)
  return e
}

function byRecency(a: NoteEntry, b: NoteEntry): number {
  return b.updated - a.updated || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

/** The page's filters as an earlier version stored them (D3, notes-home D5); read once and turned into chips (notes-space D6). */
export interface NoteFilters {
  source: 'all' | NoteSource | 'unlinked'
  projectId: string | null
  labelId: string | null
}

export const NO_NOTE_FILTERS: NoteFilters = { source: 'all', projectId: null, labelId: null }

/**
 * The default list in two groups (notes-home D4): the pinned standalone notes in the
 * favourites order, then every other entry in the list's order. Pinned ids that
 * name no listed note (in the Trash, another workspace) are left out.
 */
export function homeGroups(entries: readonly NoteEntry[], pinnedIds: readonly string[]): { pinned: NoteEntry[]; recent: NoteEntry[] } {
  if (pinnedIds.length === 0) return { pinned: [], recent: entries as NoteEntry[] }
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const pinned: NoteEntry[] = []
  for (const id of pinnedIds) {
    const e = byKey.get(`note:${id}`)
    if (e && !pinned.includes(e)) pinned.push(e)
  }
  if (pinned.length === 0) return { pinned, recent: entries as NoteEntry[] }
  const keys = new Set(pinned.map((e) => e.key))
  return { pinned, recent: entries.filter((e) => !keys.has(e.key)) }
}

/** A search result: the entry and its snippet of the text around the first match. */
export interface NoteResult extends NoteHit<NoteEntry> {
  snippet: SnippetSegment[]
}

/**
 * The in-memory search index (D4): each note's normalised title and body,
 * built lazily on the first search and refreshed only for notes whose text
 * changed, so a keystroke reads nothing from IndexedDB. Drop it when the
 * account locks.
 */
export class NoteIndex {
  private prepared = new Map<string, { title: string; text: string; p: PreparedNote; plain: string }>()

  constructor(private lang?: string) {}

  /**
   * The prepared form of an entry and its plain text (the Markdown stripped, kept
   * for snippets), recomputed only when its title or text changed.
   */
  private entry(e: NoteEntry): { p: PreparedNote; plain: string } {
    const cur = this.prepared.get(e.key)
    if (cur && cur.title === e.title && cur.text === e.text) return cur
    // prepareNote's two steps, keeping the stripped text: a snippet used to strip
    // the whole note again for every row shown (notes-compaction-at-scale: 50 rows
    // of 10 KB notes took about 18 ms of a 20 ms keystroke).
    const plain = stripMarkdown(e.text)
    const next = { title: e.title, text: e.text, p: { title: normalizeText(e.title, this.lang), body: normalizeText(plain, this.lang) }, plain }
    this.prepared.set(e.key, next)
    return next
  }

  private prepare(e: NoteEntry): PreparedNote {
    return this.entry(e).p
  }

  /**
   * The entries matching `query`, ranked: title matches first, then matched words, then recency.
   * Only the first `snippets` results get their snippet (a list shows a page of them;
   * the rest have none until it shows more).
   */
  search(entries: readonly NoteEntry[], query: string, snippetLength = 140, snippets = Infinity): NoteResult[] {
    const terms = parseQuery(query, this.lang)
    if (terms.length === 0) return []
    const hits: NoteHit<NoteEntry & { key: string }>[] = []
    for (const e of entries) {
      const m = matchPrepared(this.prepare(e), terms)
      if (m.matched) hits.push({ note: e, ...m })
    }
    hits.sort(compareHits)
    return hits.map((h, i) => ({ ...h, snippet: i < snippets ? snippetPlain(this.entry(h.note).plain, terms, snippetLength, this.lang) : [] }))
  }

  /**
   * Prepares up to `limit` of the entries not prepared yet; true while some are
   * left. The Notes page calls it in idle moments, so the first keystroke of a
   * search finds the index ready (performance-10k: preparing 500 long notes on
   * that keystroke took most of a second on a phone).
   */
  warm(entries: readonly NoteEntry[], limit = 25): boolean {
    // Each call goes on where the last one stopped in the same list: starting at the
    // top again read every prepared note once per call, and a few notes a call over
    // 2,000 notes did not finish before the first keystroke (list-rendering-at-scale).
    let at = this.warming?.entries === entries ? this.warming.at : 0
    let done = 0
    for (; at < entries.length; at++) {
      const e = entries[at]
      const cur = this.prepared.get(e.key)
      if (cur && cur.title === e.title && cur.text === e.text) continue
      if (done++ === limit) {
        this.warming = { entries, at }
        return true
      }
      this.prepare(e)
    }
    this.warming = { entries, at }
    return false
  }

  /** Where warm stopped, in which list. */
  private warming: { entries: readonly NoteEntry[]; at: number } | null = null

  /** Forget notes that are no longer listed (and their text). */
  prune(entries: readonly NoteEntry[]): void {
    const keep = new Set(entries.map((e) => e.key))
    for (const k of this.prepared.keys()) if (!keep.has(k)) this.prepared.delete(k)
  }

  /** How many notes the index holds (tests). */
  get size(): number {
    return this.prepared.size
  }

  /** Drop every cached text (the account locked). */
  clear(): void {
    this.prepared.clear()
  }
}
