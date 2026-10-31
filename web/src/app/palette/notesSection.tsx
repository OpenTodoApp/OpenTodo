// The palette's Notes section (OpenSpec change notes-overview, design D5): standalone
// and project notes matching the query by the Notes page's rules (every word, ignoring
// case and accents), from local rows only, with the snippet as their second line; a
// task found by its notes keeps its place among the tasks and gains the snippet.
// The index (lib/noteList.ts) is imported on the first typed query and refreshed from
// the live rows; nothing is ever asked of the server.
import { useEffect, useMemo, useState } from 'react'
import { currentLanguage, t } from '../../lib/i18n'
import { useNoteRows } from '../../lib/noteRows'
import type { SnippetSegment } from '../../lib/noteSearch'
import type { Project, RowEncryption, Task } from '../../lib/types'
import { openNote } from '../notes/openNote'
import type { Entry } from './entries'

type NoteListModule = typeof import('../../lib/noteList')

/** At most this many notes are listed under Notes. */
export const PALETTE_NOTES = 10

/** A row the device could not decrypt is never searched (its text is ciphertext). */
const readable = <R extends object>(rows: readonly R[]): R[] => rows.filter((r) => {
  const raw = (r as { _e2ee?: RowEncryption })._e2ee?.raw
  return !raw?.description && !raw?.title && !raw?.name
})

export interface PaletteNotes {
  /** The Notes section's entries, ranked. */
  entries: Entry[]
  /** Snippets by palette entry key (`task:<id>` for a task found by its notes, `notes:<key>` for a note). */
  snippets: ReadonlyMap<string, SnippetSegment[]>
}

const NONE: PaletteNotes = { entries: [], snippets: new Map() }

/** The Notes section for `query`; empty until the index module has loaded. */
export function usePaletteNotes(query: string, tasks: readonly Task[], projects: readonly Project[]): PaletteNotes {
  const [mod, setMod] = useState<NoteListModule | null>(null)
  const q = query.trim()
  useEffect(() => {
    if (!q || mod) return
    let live = true
    void import('../../lib/noteList').then((m) => { if (live) setMod(m) })
    return () => { live = false }
  }, [q, mod])
  const notes = useNoteRows()
  const index = useMemo(() => (mod ? new mod.NoteIndex(currentLanguage()) : null), [mod])
  const all = useMemo(() => (mod ? mod.noteEntries(readable(tasks), readable(projects), readable(notes)) : []), [mod, tasks, projects, notes])
  return useMemo(() => {
    if (!q || !mod || !index) return NONE
    index.prune(all)
    const snippets = new Map<string, SnippetSegment[]>()
    const entries: Entry[] = []
    for (const r of index.search(all, q)) {
      const e = r.note
      if (e.source === 'task') {
        // Found by its notes: the task's own entry shows the snippet.
        if (r.bodyWords > 0) snippets.set(`task:${e.id}`, r.snippet)
        continue
      }
      if (entries.length >= PALETTE_NOTES) continue
      const key = `notes:${e.key}`
      snippets.set(key, r.snippet)
      entries.push({
        kind: 'note', key, label: e.title || (e.source === 'project' ? t('Project') : t('Untitled note')),
        secondary: r.snippet.map((s) => s.text).join(''), marker: e.source === 'project' ? t('project note') : undefined,
        icon: e.source === 'project' ? 'hash' : 'notebook-pen', group: t('Notes'),
        run: () => openNote({ source: e.source, id: e.id }),
      })
    }
    return { entries, snippets }
  }, [q, mod, index, all])
}

/** A snippet as text, its matches in <mark>; never HTML from the note. */
export function Snippet({ segments, lead }: { segments: readonly SnippetSegment[]; lead?: string }) {
  return (
    <span data-snippet>
      {lead && <span>{lead} · </span>}
      {segments.map((s, i) => (s.mark ? <mark key={i} className="rounded-[2px] bg-accent-soft text-on-accent-soft">{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </span>
  )
}
