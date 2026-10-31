// Standalone notes and their conversions (OpenSpec change notes-overview, design
// D2 and D6). Every write is one batch through the op log, so it works offline
// and converges like any edit; the conversions are undoable in one step.
//
// - Turn into task: a task with the note's title, the same document and
//   projection, its project and labels, in the same scope; the note goes to the
//   Trash. Undo removes the task and brings the note back.
// - Move note to a new note: a standalone note titled with the task's title,
//   with the same document and projection, the task's project and labels; the
//   task's note is cleared by DELETING THE CONTENT INSIDE ITS DOCUMENT (a Yjs
//   deletion), never by writing an empty document: a device still holding the
//   old document would merge it back and republish the text. Undo removes the
//   new note and writes the task's earlier text back as a plain-text value,
//   which the pair rule folds into the document as a history restore does.
import type { ProposedChange } from './assistantTypes'
import { db, type AssistantUndo } from './db'
import { t } from './i18n'
import { uuid } from './ids'
import { copyNoteChange, foldNote, getDeviceId, mutate, mutateMany, planTask, type Change } from './ops'
import { activeBody, decodeDoc, encodeDoc } from './richtext'
import { membershipMap, scopeOf } from './sharing'
import type { Note, Task } from './types'
import { applyBatch } from './undo'
import { keepWorkspaceFor, workspaceFields } from './workspaces'

/** What a new note starts with; every field optional. */
export interface NewNote {
  title?: string
  description?: string
  project_id?: string | null
  labels?: string[]
}

/** The change that creates a note, without writing it. */
export async function planNote(fields: NewNote = {}, now = Date.now()): Promise<Change> {
  const projectId = fields.project_id ?? null
  return {
    entity: 'note', entityId: uuid(), patch: {
      title: (fields.title ?? '').trim(), description: fields.description ?? '', project_id: projectId, labels: fields.labels ?? [],
      position: now, created_at: now, deleted_at: null,
      // A note without a project lands in the current workspace (workspaces).
      ...(projectId ? {} : await workspaceFields()),
    },
  }
}

/** Creates a note; returns its id. */
export async function createNote(fields: NewNote = {}): Promise<string> {
  const change = await planNote(fields)
  await mutateMany([change])
  return change.entityId
}

/** A live note row, after folding pending appends and plain-text writes into its document. */
async function liveNote(id: string): Promise<Note> {
  await foldNote('note', id)
  const note = await db.notes.get(id)
  if (!note || note.deleted_at) throw new Error(t('This note no longer exists.'))
  return note
}

/** One undoable batch; returns the undo entry. */
async function undoable(changes: ProposedChange[], label: string): Promise<AssistantUndo | null> {
  await getDeviceId()
  return applyBatch(changes, { source: 'action', label })
}

const tombstone = (entity: 'note' | 'task', id: string, now: number): ProposedChange => ({ entity, entityId: id, patch: { deleted_at: now }, base: { deleted_at: null } })

/** The result of a conversion: the new entity's id and the Undo entry. */
export interface Converted {
  id: string
  entry: AssistantUndo | null
  label: string
}

/** Turns a standalone note into a task in one batch (D6). */
export async function noteToTask(noteId: string, now = Date.now()): Promise<Converted> {
  const note = await liveNote(noteId)
  const { id, change } = await planTask({
    title: note.title.trim() || t('Untitled note'), description: note.description ?? '', project_id: note.project_id, labels: note.labels ?? [],
  })
  if (note.notes_doc) change.patch.notes_doc = note.notes_doc
  // Without a project the task stays in the note's workspace, not the current one.
  if (!note.project_id) change.patch.workspace_id = note.workspace_id ?? null
  const label = t('Turned into a task')
  const entry = await undoable([{ ...change, create: true }, tombstone('note', noteId, now)], label)
  return { id, entry, label }
}

/** The task's document with the content of its visible body deleted, or null when it has none this device can read. */
function clearedDoc(value: string | undefined): string | null {
  const doc = decodeDoc(value ?? '')
  if (!value || !doc) return null
  const body = activeBody(doc)
  doc.transact(() => body.delete(0, body.length))
  return encodeDoc(doc)
}

/** Moves a task's note out into a new standalone note in one batch (D6); null when the task has no note. */
export async function moveTaskNoteOut(taskId: string, now = Date.now()): Promise<Converted | null> {
  await foldNote('task', taskId)
  const task = (await db.tasks.get(taskId)) as Task | undefined
  if (!task || task.deleted_at) throw new Error(t('This task no longer exists.'))
  const text = task.description ?? ''
  if (!text.trim()) return null
  const keep = task.project_id ? undefined : (await keepWorkspaceFor())(task)
  const note: ProposedChange = {
    entity: 'note', entityId: uuid(), create: true, patch: {
      title: task.title, notes_doc: task.notes_doc ?? '', description: text, labels: task.labels ?? [], project_id: task.project_id ?? null,
      position: now, created_at: now, deleted_at: null,
      ...(task.project_id ? {} : keep === undefined ? { workspace_id: task.workspace_id ?? null } : { workspace_id: keep }),
    },
  }
  if (!note.patch.notes_doc) delete note.patch.notes_doc
  const cleared = clearedDoc(task.notes_doc)
  const taskPatch: Record<string, unknown> = cleared ? { notes_doc: cleared, description: '' } : { description: '' }
  const label = t('Moved the note to a new note')
  const entry = await undoable([note, { entity: 'task', entityId: taskId, patch: taskPatch, base: { notes_doc: task.notes_doc ?? '', description: text } }], label)
  // Undo writes the earlier text back as the projection only (a fold, like a history
  // restore): the earlier document merged into the cleared one would stay cleared.
  if (entry) {
    entry.inverse = entry.inverse.map((inv) => (inv.entity === 'task' && inv.entityId === taskId ? { ...inv, patch: { description: text } } : inv))
    await db.assistantUndo.put(entry)
  }
  return { id: note.entityId, entry, label }
}

/** Moves a note to the Trash, undoable. */
export async function trashNote(noteId: string, now = Date.now()): Promise<Converted> {
  const label = t('Moved to Trash')
  return { id: noteId, entry: await undoable([tombstone('note', noteId, now)], label), label }
}

/**
 * Changes a note's project. Within one sharing scope it is one op; into another
 * scope it is a copy there and a tombstone of the original (D2), and the copy's id
 * is returned. Leaving its project, a note keeps the workspace it was in.
 */
export async function setNoteProject(noteId: string, projectId: string | null): Promise<string> {
  const note = await db.notes.get(noteId)
  if (!note || note.deleted_at) throw new Error(t('This note no longer exists.'))
  if ((note.project_id ?? null) === projectId) return noteId
  const keep = projectId ? undefined : (await keepWorkspaceFor())(note)
  const workspace = projectId ? {} : { workspace_id: keep === undefined ? note.workspace_id ?? null : keep }
  const memberships = await membershipMap()
  if (scopeOf(note.project_id, memberships) !== scopeOf(projectId, memberships)) {
    const copy = copyNoteChange(note, projectId, projectId ? null : (workspace.workspace_id ?? null))
    await mutateMany([copy, { entity: 'note', entityId: noteId, patch: { deleted_at: Date.now() } }])
    return copy.entityId
  }
  await mutate('note', noteId, { project_id: projectId, ...workspace })
  return noteId
}

/** Adds or removes one label of a note (one op on its `labels` array). */
export async function toggleNoteLabel(noteId: string, labelId: string): Promise<void> {
  const note = await db.notes.get(noteId)
  if (!note) return
  const labels = note.labels ?? []
  await mutate('note', noteId, { labels: labels.includes(labelId) ? labels.filter((l) => l !== labelId) : [...labels, labelId] })
}
