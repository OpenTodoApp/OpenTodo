// Actions on several standalone notes at once (OpenSpec change notes-bulk-actions, D3
// and D4): move to a project, labels, pin, turn into tasks and trash, each one batch
// through the op log with one Undo entry, applied locally first and converging per
// note and field like single edits. Rows are read just before writing.
import type { ProposedChange } from './assistantTypes'
import { db } from './db'
import { USER_PREFS_ID } from './userPrefs'
import { parseFavourites } from './favourites'
import { t } from './i18n'
import { copyNoteChange, foldNote, getDeviceId } from './ops'
import { planNoteToTask } from './noteOps'
import { membershipMap, scopeOf } from './sharing'
import type { Note } from './types'
import { applyBatch } from './undo'
import { keepWorkspaceFor } from './workspaces'

/** What a bulk action did: the toast's sentence and its Undo entry. */
export interface NoteBulkResult { label: string; undoId: string | null }

const notesWord = (n: number) => t('{n, plural, one {# note} other {# notes}}', { n })

/** The ticked notes still there, in the given order. */
async function liveNotes(ids: readonly string[]): Promise<Note[]> {
  const rows = await db.notes.bulkGet([...ids])
  return rows.filter((n): n is Note => !!n && !n.deleted_at)
}

async function batch(changes: ProposedChange[], label: string): Promise<NoteBulkResult> {
  await getDeviceId()
  const entry = await applyBatch(changes, { source: 'bulk', label })
  return { label, undoId: entry?.id ?? null }
}

/** The ticked notes a move to `projectId` would copy into another sharing scope (the review of D3). */
export async function notesChangingScope(ids: readonly string[], projectId: string | null): Promise<Note[]> {
  const memberships = await membershipMap()
  const to = scopeOf(projectId, memberships)
  return (await liveNotes(ids)).filter((n) => (n.project_id ?? null) !== projectId && scopeOf(n.project_id, memberships) !== to)
}

/**
 * Move to project (D3): `project_id` per note; a note whose new project is in another
 * sharing scope is copied there and the original moved to the Trash, as for one note.
 * Leaving its project, a note keeps the workspace it was in.
 */
export async function moveNotes(ids: readonly string[], projectId: string | null, projectName: string): Promise<NoteBulkResult> {
  const notes = (await liveNotes(ids)).filter((n) => (n.project_id ?? null) !== projectId)
  const memberships = await membershipMap()
  const keep = projectId ? () => undefined : await keepWorkspaceFor()
  const now = Date.now()
  const changes: ProposedChange[] = []
  for (const n of notes) {
    const kept = keep(n)
    const workspace = projectId ? null : kept === undefined ? n.workspace_id ?? null : kept
    if (scopeOf(n.project_id, memberships) !== scopeOf(projectId, memberships)) {
      changes.push({ ...copyNoteChange(n, projectId, workspace), create: true }, { entity: 'note', entityId: n.id, patch: { deleted_at: now }, base: { deleted_at: null } })
    } else {
      changes.push({ entity: 'note', entityId: n.id, patch: projectId ? { project_id: projectId } : { project_id: null, workspace_id: workspace } })
    }
  }
  const label = projectId
    ? t('{notes} moved to {project}', { notes: notesWord(notes.length), project: projectName })
    : t('{notes} moved out of their projects', { notes: notesWord(notes.length) })
  return batch(changes, label)
}

/**
 * Labels (D3, the rule of task bulk labels): a label every ticked note carries is
 * removed from each; otherwise it is added to each note lacking it. Each note's labels
 * are read just before writing and written whole.
 */
export async function labelNotes(ids: readonly string[], labelId: string, labelName: string): Promise<NoteBulkResult> {
  const notes = await liveNotes(ids)
  const all = notes.length > 0 && notes.every((n) => (n.labels ?? []).includes(labelId))
  const changes: ProposedChange[] = []
  for (const n of notes) {
    const labels = n.labels ?? []
    if (all) changes.push({ entity: 'note', entityId: n.id, patch: { labels: labels.filter((l) => l !== labelId) } })
    else if (!labels.includes(labelId)) changes.push({ entity: 'note', entityId: n.id, patch: { labels: [...labels, labelId] } })
  }
  const label = all
    ? t('{label} removed from {notes}', { label: labelName, notes: notesWord(notes.length) })
    : t('{label} added to {notes}', { label: labelName, notes: notesWord(changes.length) })
  return batch(changes, label)
}

/** Whether every one of the notes is pinned (then the action is Unpin). */
export function allPinned(ids: readonly string[], favourites: string | undefined): boolean {
  const list = parseFavourites(favourites)
  return ids.length > 0 && ids.every((id) => list.includes(`note:${id}`))
}

/** Pin or Unpin (D3): the favourites list written once, new pins after the pins before. */
export async function pinNotes(ids: readonly string[], on: boolean): Promise<NoteBulkResult> {
  const notes = await liveNotes(ids)
  const list = parseFavourites((await db.userPrefs.get(USER_PREFS_ID))?.favourites)
  const entries = notes.map((n) => `note:${n.id}`)
  const next = on ? [...list, ...entries.filter((e) => !list.includes(e))] : list.filter((e) => !entries.includes(e))
  const changes: ProposedChange[] = next.join(',') === list.join(',') ? [] : [{ entity: 'user_prefs', entityId: USER_PREFS_ID, patch: { favourites: next.join(',') } }]
  const label = on ? t('{notes} pinned', { notes: notesWord(notes.length) }) : t('{notes} unpinned', { notes: notesWord(notes.length) })
  return batch(changes, label)
}

/** Turn into tasks (D3): each note as the single Turn into task does, all in one batch. */
export async function notesToTasks(ids: readonly string[]): Promise<NoteBulkResult> {
  const now = Date.now()
  const changes: ProposedChange[] = []
  let n = 0
  for (const id of ids) {
    await foldNote('note', id)
    const planned = await planNoteToTask(id, now).catch(() => null)
    if (!planned) continue
    changes.push(...planned)
    n++
  }
  return batch(changes, t('{n, plural, one {# note turned into a task} other {# notes turned into tasks}}', { n }))
}

/** Move to Trash (D3): `deleted_at` per note. */
export async function trashNotes(ids: readonly string[]): Promise<NoteBulkResult> {
  const notes = await liveNotes(ids)
  const now = Date.now()
  const changes: ProposedChange[] = notes.map((n) => ({ entity: 'note', entityId: n.id, patch: { deleted_at: now }, base: { deleted_at: null } }))
  return batch(changes, t('{notes} moved to the Trash', { notes: notesWord(notes.length) }))
}
