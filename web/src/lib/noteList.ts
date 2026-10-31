// The Notes page's list (OpenSpec change notes-overview, design D3) and its
// on-device search index (D4). Pure functions over the rows the app already
// holds; nothing here reads IndexedDB or the network, so the page and the
// palette work offline and on an encrypted account's decrypted copy.
import { compareHits, matchPrepared, parseQuery, prepareNote, snippet, type NoteHit, type PreparedNote, type SnippetSegment } from './noteSearch'
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
  /** A completed task or an archived project. */
  marker?: 'completed' | 'archived'
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
    const text = noteText(t)
    if (!text.trim()) continue
    out.push({ key: `task:${t.id}`, source: 'task', id: t.id, title: t.title, text, projectId: t.project_id, labels: t.labels ?? [],
      updated: updatedOf(t._clock, NOTE_FIELDS), ...(t.completed_at ? { marker: 'completed' as const } : {}) })
  }
  for (const p of projects) {
    if (p.deleted_at) continue
    const text = noteText(p)
    if (!text.trim()) continue
    out.push({ key: `project:${p.id}`, source: 'project', id: p.id, title: p.name, text, projectId: p.id, labels: [],
      updated: updatedOf(p._clock, NOTE_FIELDS), ...(p.archived ? { marker: 'archived' as const } : {}) })
  }
  for (const n of notes) {
    if (n.deleted_at) continue
    out.push({ key: `note:${n.id}`, source: 'note', id: n.id, title: n.title ?? '', text: noteText(n), projectId: n.project_id ?? null,
      labels: n.labels ?? [], updated: updatedOf(n._clock, STANDALONE_FIELDS) || n.created_at || 0 })
  }
  return out.sort(byRecency)
}

function byRecency(a: NoteEntry, b: NoteEntry): number {
  return b.updated - a.updated || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

/** The page's filters (D3); remembered per device by the page. */
export interface NoteFilters {
  source: 'all' | NoteSource
  projectId: string | null
  labelId: string | null
}

export const NO_NOTE_FILTERS: NoteFilters = { source: 'all', projectId: null, labelId: null }

/** The entries the filters keep, in the same order. A label filter leaves project notes out (they have no labels). */
export function filterEntries(entries: readonly NoteEntry[], f: NoteFilters): NoteEntry[] {
  return entries.filter((e) => (f.source === 'all' || e.source === f.source)
    && (!f.projectId || e.projectId === f.projectId)
    && (!f.labelId || e.labels.includes(f.labelId)))
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
  private prepared = new Map<string, { title: string; text: string; p: PreparedNote }>()

  constructor(private lang?: string) {}

  /** The prepared form of an entry, recomputed only when its title or text changed. */
  private prepare(e: NoteEntry): PreparedNote {
    const cur = this.prepared.get(e.key)
    if (cur && cur.title === e.title && cur.text === e.text) return cur.p
    const p = prepareNote({ title: e.title, text: e.text }, this.lang)
    this.prepared.set(e.key, { title: e.title, text: e.text, p })
    return p
  }

  /** The entries matching `query`, ranked: title matches first, then matched words, then recency. */
  search(entries: readonly NoteEntry[], query: string, snippetLength = 140): NoteResult[] {
    const terms = parseQuery(query, this.lang)
    if (terms.length === 0) return []
    const hits: NoteHit<NoteEntry & { key: string }>[] = []
    for (const e of entries) {
      const m = matchPrepared(this.prepare(e), terms)
      if (m.matched) hits.push({ note: e, ...m })
    }
    hits.sort(compareHits)
    return hits.map((h) => ({ ...h, snippet: snippet(h.note.text, terms, snippetLength, this.lang) }))
  }

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
