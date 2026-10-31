// The standalone notes of the current workspace (OpenSpec change notes-overview,
// design D3): one shared live snapshot of the `notes` table, partitioned like the
// tasks (a note with a project follows its project, one without its own
// `workspace_id`). Imported only by the lazy Notes page and its callers, so the
// first load carries none of it.
import { db } from './db'
import { liveSnapshot } from './liveSnapshot'
import { tasksIn, readWorkspaceState } from './workspaces'
import type { Note } from './types'

const NO_NOTES: Note[] = []

const noteRows = liveSnapshot('notes', async () => {
  const [state, projects, notes] = await Promise.all([readWorkspaceState(), db.projects.toArray(), db.notes.toArray()])
  return tasksIn(state, projects, notes)
})

/** Every note row of the current workspace, deleted ones too (the list leaves them out); undefined until loaded. */
export function useNoteRowsLoaded(): Note[] | undefined {
  return noteRows.use()
}

/** Like useNoteRowsLoaded, empty while loading. */
export function useNoteRows(): Note[] {
  return noteRows.use() ?? NO_NOTES
}

/** One note, live; undefined while loading, null when it does not exist. */
export function useNoteRow(id: string | null | undefined): Note | null | undefined {
  const rows = noteRows.use()
  if (!id) return null
  if (!rows) return undefined
  return rows.find((n) => n.id === id) ?? null
}
