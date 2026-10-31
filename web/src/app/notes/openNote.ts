// Opening a note from a list (OpenSpec change notes-overview, design D7): the
// Notes page and the command palette share it. Kept tiny (the router, the panel
// and the project note's request only) so the palette may import it statically.
import { requestProjectNote } from '../ProjectNote'
import { openTaskPanel } from '../panel'
import { navigate } from '../router'

/** Where a note lives, as the Notes page's entries and the palette's results name it. */
export interface NoteRef {
  source: 'task' | 'project' | 'note'
  id: string
}

/**
 * A task note opens the task (docked beside a split list, else its page, where the
 * note is part of the task); a project note opens the project with its note in edit
 * mode; a standalone note opens at /notes/<id> (the docked panel on a computer, a page
 * on a phone).
 */
export function openNote(ref: NoteRef): void {
  if (ref.source === 'task') openTaskPanel(ref.id)
  else if (ref.source === 'project') {
    navigate({ view: 'project', id: ref.id })
    requestProjectNote(ref.id)
  } else navigate({ view: 'notes', id: ref.id })
}

/** Starts a new note: the Notes page creates it and opens it (/notes?new=1). */
export function newNote(): void {
  navigate({ view: 'notes', create: true })
}
