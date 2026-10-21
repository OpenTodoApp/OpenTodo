// @vitest-environment happy-dom
// Dropping a task on the sidebar (OpenSpec change ux-feedback-2, tasks 3.1–3.4;
// project-organization "Drop a task on a project", labels "Drop a task on a label"):
// the ring on the target and no list drop line, Escape, the move and the label as
// one batch with Undo, the bulk selection, viewers' projects, and board cards.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setFavourite } from '../lib/favourites'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { saveViewMode } from '../lib/sections'
import type { Task, User } from '../lib/types'
import { addLabelUndoable, moveManyUndoable } from '../lib/undoActions'
import { undoBatch } from '../lib/undo'
import { flush, render } from '../ui/test-utils'
import { hideBulkToast } from './bulk/toastStore'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0))
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  hideBulkToast()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  resetPanel()
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const shell = async (route: Parameters<typeof navigate>[0]) => { navigate(route); return render(<Shell user={user} onLogout={() => {}} />) }
const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
const target = (value: string) => document.querySelector<HTMLElement>(`[data-task-drop="${value}"]`)!
const toast = () => document.querySelector('[data-bulk-toast]')?.textContent ?? ''
const task = async (id: string) => (await db.tasks.get(id)) as Task

/** Press on `el`, move over `over`, then release there (or press Escape first). */
async function drag(el: Element, over: Element, opts: { escape?: boolean } = {}) {
  document.elementFromPoint = () => over
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
  })
  const active = over.closest('[data-task-drop]')?.hasAttribute('data-drop-active') ?? false
  const line = !!document.querySelector('[data-drop-indicator]')
  await act(async () => {
    if (opts.escape) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
  })
  return { active, line }
}

describe('drop a task on a project', () => {
  it('Drop on a project: the project rings, the list shows no drop line, and the task moves with an Undo toast', async () => {
    const home = await createProject({ name: 'Home renovation' })
    const id = await createTask({ title: 'Buy paint' })
    const r = await shell({ view: 'inbox' })
    await waitFor(() => !!row(id) && !!target(`project:${home}`))
    const { active, line } = await drag(row(id), target(`project:${home}`))
    expect([active, line]).toEqual([true, false])
    await waitFor(() => toast().includes('Moved to Home renovation'))
    expect(toast()).toContain('Undo')
    expect((await task(id)).project_id).toBe(home)
    await r.unmount()
  })

  it('Escape cancels the drag and nothing moves', async () => {
    const home = await createProject({ name: 'Home' })
    const id = await createTask({ title: 'Stay put' })
    const r = await shell({ view: 'inbox' })
    await waitFor(() => !!row(id) && !!target(`project:${home}`))
    await drag(row(id), target(`project:${home}`), { escape: true })
    await flush(50)
    expect((await task(id)).project_id ?? null).toBeNull()
    await r.unmount()
  })

  it('works from a list that is not ordered by hand (Today), and onto the Inbox', async () => {
    const work = await createProject({ name: 'Work' })
    const id = await createTask({ title: 'Report', project_id: work, due: { date: '2026-10-21' } })
    const r = await shell({ view: 'today' })
    await waitFor(() => !!row(id) && !!target('inbox'))
    const { active } = await drag(row(id), target('inbox'))
    expect(active).toBe(true)
    await waitFor(() => toast().includes('Moved to Inbox'))
    expect((await task(id)).project_id ?? null).toBeNull()
    await r.unmount()
  })

  it('Viewer of a shared project: no drop ring and releasing there changes nothing', async () => {
    const shared = await createProject({ name: 'Family' })
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'someone', members: [] })
    const mine = await createProject({ name: 'Mine' })
    const id = await createTask({ title: 'Keep me' })
    const r = await shell({ view: 'inbox' })
    await waitFor(() => !!document.querySelector(`[data-project-row="${shared}"]`) && !!target(`project:${mine}`))
    const viewerRow = document.querySelector(`[data-project-row="${shared}"]`)!
    expect(viewerRow.hasAttribute('data-task-drop')).toBe(false)
    const { active } = await drag(row(id), viewerRow)
    expect(active).toBe(false)
    await flush(50)
    expect((await task(id)).project_id ?? null).toBeNull()
    await r.unmount()
  })

  it('Several selected tasks move as one batch and one Undo moves all three back', async () => {
    const work = await createProject({ name: 'Work' })
    const ids = await Promise.all(['One', 'Two', 'Three'].map((title) => createTask({ title })))
    const r = await moveManyUndoable(ids, work, 'Work')
    for (const id of ids) expect((await task(id)).project_id).toBe(work)
    expect(r.label).toBe('Moved to Work')
    const u = await undoBatch(r.entry!.id)
    expect(u.restored).toBe(3)
    for (const id of ids) expect((await task(id)).project_id ?? null).toBeNull()
  })

  it('Board cards drop on a sidebar project too', async () => {
    const q4 = await createProject({ name: 'Q4' })
    const other = await createProject({ name: 'Other' })
    await saveViewMode(q4, 'board')
    const id = await createTask({ title: 'Card', project_id: q4 })
    const r = await shell({ view: 'project', id: q4 })
    await waitFor(() => !!document.querySelector(`[data-task-id="${id}"]`) && !!target(`project:${other}`))
    await drag(row(id), target(`project:${other}`))
    await waitFor(() => toast().includes('Moved to Other'))
    expect((await task(id)).project_id).toBe(other)
    await r.unmount()
  })
})

describe('drop a task on a label', () => {
  it('Add a label by dropping on a pinned label: the task keeps its labels and its place', async () => {
    const errand = await createLabel({ name: 'errand' })
    const call = await createLabel({ name: 'call' })
    await setFavourite('label', errand, true)
    const id = await createTask({ title: 'Call the plumber', labels: [call] })
    const r = await shell({ view: 'inbox' })
    await waitFor(() => !!row(id) && !!target(`label:${errand}`))
    await drag(row(id), target(`label:${errand}`))
    await waitFor(() => toast().includes('Added errand'))
    expect((await task(id)).labels).toEqual([call, errand])
    expect((await task(id)).project_id ?? null).toBeNull()
    await r.unmount()
  })

  it('Already labelled: nothing is written and the toast says so', async () => {
    const errand = await createLabel({ name: 'errand' })
    const id = await createTask({ title: 'Has it', labels: [errand] })
    const before = await db.outbox.count()
    const r = await addLabelUndoable([id], errand, 'errand')
    expect([r.entry, r.label]).toEqual([null, 'Already has errand'])
    expect(await db.outbox.count()).toBe(before)
  })

  it('Two selected tasks get the label as one batch', async () => {
    const waiting = await createLabel({ name: 'waiting' })
    const ids = await Promise.all(['A', 'B'].map((title) => createTask({ title })))
    const r = await addLabelUndoable(ids, waiting, 'waiting')
    for (const id of ids) expect((await task(id)).labels).toEqual([waiting])
    expect(r.entry?.count).toBe(2)
  })
})
