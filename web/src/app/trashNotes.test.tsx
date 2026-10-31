// @vitest-environment happy-dom
// OpenSpec change notes-overview, task 4.9 (trash-and-history "Standalone notes in the
// Trash and history"): a deleted standalone note is listed with tasks and projects,
// Restore brings it back, and Delete permanently calls the note's purge route.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const purgeCalls = vi.fn(async (_entity: string, _id: string) => ({ purged: { tasks: 0, projects: 0, reminders: 0 } }))
vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, api: { ...real.api, purge: (e: 'task' | 'project' | 'note', id: string) => purgeCalls(e, id) } }
})

import { db } from '../lib/db'
import { createTask, deleteTask, mutate, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { click, render, waitFor } from '../ui/test-utils'
import { TrashView } from './TrashView'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  await setCurrentUserId('u1')
  purgeCalls.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const row = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-trash-id="${id}"]`)
const button = (el: HTMLElement, name: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === name)!

describe('the Trash with standalone notes (notes-overview 4.9)', () => {
  it('lists a deleted note with a deleted task, untitled ones by "Untitled note", and Restore brings it back', async () => {
    const task = await createTask({ title: 'Buy tickets' })
    await deleteTask(task)
    await mutate('note', 'n-trip', { title: 'Trip', description: 'Take the ferry', deleted_at: Date.now() })
    await mutate('note', 'n-blank', { title: '', description: 'scratch', deleted_at: Date.now() })
    await mutate('note', 'n-live', { title: 'Kept', description: 'not deleted' })
    const r = await render(<TrashView />)
    await waitFor(() => !!row(r.container, 'n-trip') && !!row(r.container, task), 'the note and the task')
    expect(row(r.container, 'n-trip')!.textContent).toContain('Trip')
    expect(row(r.container, 'n-trip')!.textContent).toContain('Note')
    expect(row(r.container, 'n-trip')!.querySelector('svg')).not.toBeNull()
    expect(row(r.container, 'n-blank')!.textContent).toContain('Untitled note')
    expect(row(r.container, 'n-live')).toBeNull()
    await click(button(row(r.container, 'n-trip')!, 'Restore'))
    await waitFor(async () => (await db.notes.get('n-trip'))?.deleted_at === null, 'restored')
    await waitFor(() => !row(r.container, 'n-trip'), 'gone from the Trash')
    expect((await db.notes.get('n-trip'))?.description).toBe('Take the ferry')
    await r.unmount()
  })

  it('Delete permanently asks, then calls the note purge route and drops the local row', async () => {
    await mutate('note', 'n-trip', { title: 'Trip', description: 'Take the ferry', deleted_at: Date.now() })
    const r = await render(<TrashView />)
    await waitFor(() => !!row(r.container, 'n-trip'), 'the note')
    await click(button(row(r.container, 'n-trip')!, 'Delete permanently'))
    const dialog = r.container.querySelector<HTMLElement>('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('Trip')
    await click(button(dialog, 'Delete permanently'))
    await waitFor(() => purgeCalls.mock.calls.length === 1, 'the purge request')
    expect(purgeCalls).toHaveBeenCalledWith('note', 'n-trip')
    await waitFor(async () => (await db.notes.get('n-trip')) === undefined, 'removed locally')
    await waitFor(() => !row(r.container, 'n-trip'), 'gone from the Trash')
    await r.unmount()
  })
})
