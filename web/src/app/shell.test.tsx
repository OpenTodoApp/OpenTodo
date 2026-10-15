// @vitest-environment happy-dom
// The shell owns the task panel (OpenSpec change ux-overhaul, app-shell "The panel
// slot has an address", design D1): every view opens a task into the same slot,
// the address carries the task id, and a route change closes a panel opened
// elsewhere.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { createView } from '../lib/views'
import { flush, key, render } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  resetPanel()
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const panels = () => document.querySelectorAll('aside[data-detail-for]')
const panelFor = () => panels()[0]?.getAttribute('data-detail-for') ?? null
const rowOf = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].find((r) => r.textContent?.includes(title))!

async function openByClick(title: string) {
  const row = rowOf(title)
  const open = row.querySelector<HTMLButtonElement>('button.min-w-0')!
  await flush()
  open.click()
  await waitFor(() => panels().length > 0)
}

describe('one panel slot for every view', () => {
  it('opens from the Inbox, a project, the Filter view and a saved view, one panel at a time', async () => {
    const project = await createProject({ name: 'Home' })
    const inboxTask = await createTask({ title: 'Renew passport', priority: 1 })
    const projectTask = await createTask({ title: 'Paint the fence', project_id: project, priority: 1 })
    const view = await createView({ name: 'Urgent', query: 'p1', pinned: true })
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Renew passport'))

    // Inbox: Enter on the selected row.
    await key(document.body, 'j')
    await key(document.body, 'Enter')
    await waitFor(() => panelFor() === inboxTask)
    expect(panels().length).toBe(1)
    expect(new URLSearchParams(location.search).get('task')).toBe(inboxTask)

    // Escape closes it and clears the address.
    await key(document.body, 'Escape')
    await waitFor(() => panels().length === 0)
    expect(new URLSearchParams(location.search).get('task')).toBeNull()

    // Project view.
    navigate({ view: 'project', id: project })
    await waitFor(() => r.container.textContent!.includes('Paint the fence'))
    await openByClick('Paint the fence')
    expect(panelFor()).toBe(projectTask)
    expect(panels().length).toBe(1)

    // Leaving the page closes a panel opened there.
    navigate({ view: 'filter', q: 'p1' })
    await waitFor(() => panels().length === 0)
    await waitFor(() => r.container.textContent!.includes('Renew passport') && r.container.textContent!.includes('Paint the fence'))
    await openByClick('Paint the fence')
    expect(panels().length).toBe(1)

    // Saved view.
    navigate({ view: 'view', id: view })
    await waitFor(() => panels().length === 0)
    await waitFor(() => r.container.textContent!.includes('Renew passport'))
    await openByClick('Renew passport')
    expect(panelFor()).toBe(inboxTask)
    expect(panels().length).toBe(1)
    await r.unmount()
  })

  it('reopens the task named in the address on a page other than the root', async () => {
    const id = await createTask({ title: 'Call the bank', due: { date: '2099-01-05' } })
    // A reload: the page is Upcoming and the address still carries the task.
    navigate({ view: 'upcoming' })
    history.replaceState(null, '', `/upcoming?task=${id}`)
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => panelFor() === id)
    expect(location.pathname).toBe('/upcoming')
    await r.unmount()
  })

  it('a deleted task leaves the slot', async () => {
    const id = await createTask({ title: 'Old chore' })
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Old chore'))
    await openByClick('Old chore')
    expect(panelFor()).toBe(id)
    const { deleteTask } = await import('../lib/ops')
    await deleteTask(id)
    await waitFor(() => panels().length === 0)
    await r.unmount()
  })
})
