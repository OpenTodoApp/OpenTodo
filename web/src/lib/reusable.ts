// Reusable lists (OpenSpec reusable-lists, design D2 and D4): the title
// normalization, the match quick add looks for before creating an item, and the
// duplicates a device collapses. Pure functions with no data access. The Go port
// is internal/reuse (used by POST /api/v1/tasks with reuse and the agent tools);
// both are pinned by reusable.vectors.json.
//
// Known difference: the server decomposes the blocks internal/notesearch's fold
// table covers (Latin, Greek, Cyrillic, punctuation, ligatures, fullwidth
// forms); this side uses full NFKD.

import type { Project, Task } from './types'

const MARKS = /\p{M}/gu
// JavaScript's \s, plus U+0085 (NEL), which Go's unicode.IsSpace counts and \s does not.
const SPACES = /[\s\u0085]+/g
const ASCII = /^[\x00-\x7f]*$/

/**
 * A title for comparison: NFKD, combining marks dropped, lower-cased with the
 * root locale ("ς" written "σ"), trimmed, runs of white space collapsed to one
 * space, and one trailing full stop dropped. "" never matches anything.
 */
export function normalizeTitle(s: string): string {
  let t = ASCII.test(s) ? s.toLowerCase() : s.normalize('NFKD').replace(MARKS, '').toLowerCase().replace(/ς/g, 'σ')
  t = t.replace(SPACES, ' ').trim()
  if (t.endsWith('.')) t = t.slice(0, -1).trimEnd()
  return t
}

/** The fields the rules read; a full Task row fits. */
export type ReusableTask = Pick<Task, 'id' | 'title' | 'project_id' | 'parent_id' | 'completed_at' | 'deleted_at'> &
  Partial<Pick<Task, 'description' | 'recurrence' | 'series_id' | 'skipped'>>

export interface ReuseMatch<T extends ReusableTask = ReusableTask> {
  task: T
  /** "completed" is reopened, "open" is left alone. */
  state: 'open' | 'completed'
}

/** A project in the reusable-list mode. */
export function isReusable(p: Pick<Project, 'reusable'> | null | undefined): boolean {
  return p?.reusable === true
}

/** A reusable list that sorts new items into aisle sections (aisles reads false while reusable is off). */
export function sortsIntoAisles(p: Pick<Project, 'reusable' | 'aisles'> | null | undefined): boolean {
  return p?.reusable === true && p.aisles === true
}

/** A live top-level item of the project; occurrence records and skips are history, not items. */
function candidate(t: ReusableTask, projectId: string): boolean {
  return t.project_id === projectId && !t.deleted_at && !t.parent_id && !t.series_id && !t.skipped
}

const byId = (a: ReusableTask, b: ReusableTask) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * The item an add of `title` to the project matches: the open match with the
 * smallest id, else the most recently completed match (ties to the smaller id),
 * else null.
 */
export function findMatch<T extends ReusableTask>(projectId: string, title: string, tasks: readonly T[]): ReuseMatch<T> | null {
  const key = normalizeTitle(title)
  if (!key) return null
  let open: T | null = null
  let done: T | null = null
  for (const t of tasks) {
    if (!candidate(t, projectId) || normalizeTitle(t.title) !== key) continue
    if (t.completed_at == null) {
      if (!open || byId(t, open) < 0) open = t
    } else if (!done || t.completed_at > (done.completed_at ?? 0) || (t.completed_at === done.completed_at && byId(t, done) < 0)) {
      done = t
    }
  }
  if (open) return { task: open, state: 'open' }
  if (done) return { task: done, state: 'completed' }
  return null
}

/**
 * The ids a device tombstones to collapse duplicates (D4): among the project's
 * live, open, top-level items, every group of two or more with the same
 * normalized title where none has notes, subtasks, a recurrence rule or
 * anything in `attached` (ids with comments, attachments, reminders or time
 * entries) loses every item but the one with the smallest id. Sorted by id.
 */
export function duplicateLosers(projectId: string, tasks: readonly ReusableTask[], attached: ReadonlySet<string> = new Set()): string[] {
  const parents = new Set<string>()
  for (const t of tasks) if (t.parent_id && !t.deleted_at) parents.add(t.parent_id)
  const groups = new Map<string, ReusableTask[]>()
  for (const t of tasks) {
    if (!candidate(t, projectId) || t.completed_at != null) continue
    const key = normalizeTitle(t.title)
    if (!key) continue
    const g = groups.get(key)
    if (g) g.push(t)
    else groups.set(key, [t])
  }
  const losers: string[] = []
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const plain = g.every((t) => !(t.description ?? '').trim() && !t.recurrence && !parents.has(t.id) && !attached.has(t.id))
    if (!plain) continue
    g.sort(byId)
    for (const t of g.slice(1)) losers.push(t.id)
  }
  return losers.sort()
}

/**
 * The deleted items of a reusable list that read as a merged duplicate in its
 * activity (D4): a top-level item in the Trash while a live item with the same
 * normalized title and a smaller id is still in the list, the one a collapse
 * keeps.
 */
export function mergedDuplicates(projectId: string, tasks: readonly ReusableTask[]): Set<string> {
  const keep = new Map<string, string>()
  for (const t of tasks) {
    if (!candidate(t, projectId)) continue
    const key = normalizeTitle(t.title)
    const cur = keep.get(key)
    if (key && (!cur || t.id < cur)) keep.set(key, t.id)
  }
  const out = new Set<string>()
  for (const t of tasks) {
    if (t.project_id !== projectId || !t.deleted_at || t.parent_id) continue
    const survivor = keep.get(normalizeTitle(t.title))
    if (survivor && survivor < t.id) out.add(t.id)
  }
  return out
}
