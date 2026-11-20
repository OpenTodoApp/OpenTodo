// @vitest-environment happy-dom
// The paperclip in the notes list (GitHub issue 1477, "a paperclip on notes with
// attachments"): a standalone note with files and a task whose note is listed show a
// paperclip and the number of their files after the title, live; a note without files
// shows none, and a removed file is no longer counted.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setMeta, useDatabase } from '../../lib/db'
import { createNote } from '../../lib/noteOps'
import { applyOps, createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import type { Op } from '../../lib/types'
import { flush, minWidthPx, render, waitFor } from '../../ui/test-utils'
import { NotesPage } from './NotesPage'

const original = window.matchMedia
let run = 0
beforeEach(async () => {
  window.matchMedia = ((q: string) => ({
    matches: minWidthPx(q) <= 1280, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  useDatabase(`note-row-files-${run++}`)
  resetDeviceId()
  setCurrentUserId('me')
  await setMeta('userId', 'me')
  localStorage.clear()
  history.replaceState(null, '', '/notes')
})
afterEach(() => {
  window.matchMedia = original
  document.body.innerHTML = ''
})

let ts = 100
async function file(id: string, owner: { note_id: string } | { task_id: string }, deleted = false) {
  const op = (field: string, value: unknown): Op => ({ id: `${id}-${field}-${ts}`, entity: 'attachment', entityId: id, field, value, ts: ts++, device: 'other' })
  const [field, value] = Object.entries(owner)[0]
  await applyOps([op(field, value), op('author_id', 'me'), op('name', `${id}.pdf`), op('mime', 'application/pdf'), op('size', 10), op('sha256', 'ab'), op('created_at', 5), op('uploaded_at', 9),
    ...(deleted ? [op('deleted_at', 50)] : [])])
}

const row = (root: ParentNode, title: string) =>
  [...root.querySelectorAll<HTMLElement>('[data-note-key]')].find((r) => r.querySelector('[data-note-title]')?.textContent === title)

describe('the paperclip in the notes list', () => {
  it('a note and a task note with files show their number; one without shows none', async () => {
    const recipe = await createNote({ title: 'Recipe', description: 'Flour and eggs.' })
    await createNote({ title: 'Ideas', description: 'Nothing attached.' })
    const trip = await createTask({ title: 'Plan the trip', description: 'Ferry at 9.' })
    await file('r1', { note_id: recipe })
    await file('r2', { note_id: recipe })
    await file('t1', { task_id: trip })
    await file('r3', { note_id: recipe }, true)
    const r = await render(<NotesPage />)
    await flush()
    await waitFor(() => !!row(r.container, 'Recipe')?.querySelector('[data-note-attachments]'), 'the paperclip')
    const clip = (title: string) => row(r.container, title)?.querySelector('[data-note-attachments]')
    expect(clip('Recipe')!.getAttribute('data-note-attachments')).toBe('2')
    expect(clip('Recipe')!.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('2 attachments')
    await waitFor(() => clip('Plan the trip')?.getAttribute('data-note-attachments') === '1', 'the task note\'s paperclip')
    expect(row(r.container, 'Ideas')).toBeTruthy()
    expect(clip('Ideas')).toBeNull()
    // Live: a file added later shows at once.
    await file('r4', { note_id: recipe })
    await waitFor(() => clip('Recipe')?.getAttribute('data-note-attachments') === '3', 'the new file')
    await r.unmount()
  })
})
