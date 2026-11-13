// The Notes list's sort order (OpenSpec change notes-sort): Last changed, Created or
// Title, each with a direction, kept on this device only (never synced, never an op).
// Pure comparators over the entries the page already holds.
import { readJSON, writeJSON } from './deviceStorage'
import type { NoteEntry } from './noteList'

export type NoteSortBy = 'changed' | 'created' | 'title'
/** `natural` is newest first for the two times and A to Z for Title. */
export interface NoteSort { by: NoteSortBy; reversed: boolean }

export const NOTE_SORTS: readonly NoteSortBy[] = ['changed', 'created', 'title']
export const DEFAULT_NOTE_SORT: NoteSort = { by: 'changed', reversed: false }
/** The order on this device (D3). */
export const NOTE_SORT_KEY = 'ot.notes.sort'

function accept(v: unknown): NoteSort | null {
  if (!v || typeof v !== 'object') return null
  const { by, reversed } = v as Partial<NoteSort>
  return NOTE_SORTS.includes(by as NoteSortBy) ? { by: by as NoteSortBy, reversed: reversed === true } : null
}

export function readNoteSort(): NoteSort {
  return readJSON(NOTE_SORT_KEY, DEFAULT_NOTE_SORT, accept)
}

/** Stores the order; storage refused, the caller's state holds it for the visit. */
export function writeNoteSort(sort: NoteSort): boolean {
  return writeJSON(NOTE_SORT_KEY, sort)
}

/** Picking an order (D1): the checked one flips its direction, another starts in its natural one. */
export function pickNoteSort(current: NoteSort, by: NoteSortBy): NoteSort {
  return current.by === by ? { by, reversed: !current.reversed } : { by, reversed: false }
}

const byChanged = (a: NoteEntry, b: NoteEntry) => b.updated - a.updated || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

/**
 * The entries in `sort`'s order (D2), as a new array. Ties fall back to the last
 * change, then the key; untitled notes stay last in either direction of Title.
 */
export function sortNotes(entries: readonly NoteEntry[], sort: NoteSort, language?: string): NoteEntry[] {
  const out = [...entries]
  const dir = sort.reversed ? -1 : 1
  if (sort.by === 'changed') return out.sort((a, b) => dir * byChanged(a, b))
  if (sort.by === 'created') return out.sort((a, b) => dir * ((b.created ?? 0) - (a.created ?? 0)) || byChanged(a, b))
  const collator = new Intl.Collator(language, { numeric: true, sensitivity: 'accent' })
  return out.sort((a, b) => {
    const x = a.title.trim()
    const y = b.title.trim()
    if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1) || byChanged(a, b)
    return dir * collator.compare(x, y) || byChanged(a, b)
  })
}
