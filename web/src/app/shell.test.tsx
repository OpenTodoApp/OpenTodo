// @vitest-environment happy-dom
// Every view opens a task the same way (OpenSpec change task-full-page, superseding
// ux-overhaul D1's panel slot for tasks): as its page at /task/<id>, with Esc
// returning to the view it was opened from.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { createView } from '../lib/views'
import { flush, key, render, waitFor } from '../ui/test-utils'
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

const pageFor = () => document.querySelector('[data-task-page]')?.getAttribute('data-task-page') ?? null
const rowOf = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].find((r) => r.textContent?.includes(title))!

async function openByClick(title: string) {
  const row = rowOf(title)
  const open = row.querySelector<HTMLButtonElement>('button.min-w-0')!
  await flush()
  open.click()
  await waitFor(() => pageFor() !== null)
}

describe('every view opens a task as its page', () => {
  it('opens from the Inbox, a project, the Filter view and a saved view; Esc returns to each', async () => {
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
    await waitFor(() => pageFor() === inboxTask)
    expect(location.pathname).toBe(`/task/${inboxTask}`)
    expect(document.querySelectorAll('aside[data-detail-variant="panel"]')).toHaveLength(0)

    // Escape returns to the list.
    await key(document.body, 'Escape')
    await waitFor(() => pageFor() === null && location.pathname === '/')

    // Project view.
    navigate({ view: 'project', id: project })
    await waitFor(() => r.container.textContent!.includes('Paint the fence'))
    await openByClick('Paint the fence')
    expect(pageFor()).toBe(projectTask)
    await key(document.body, 'Escape')
    await waitFor(() => location.pathname === `/project/${project}`)

    // The Filter view: its query comes back with it.
    navigate({ view: 'filter', q: 'p1' })
    await waitFor(() => r.container.textContent!.includes('Renew passport') && r.container.textContent!.includes('Paint the fence'))
    await openByClick('Paint the fence')
    await key(document.body, 'Escape')
    await waitFor(() => location.pathname === '/filter' && new URLSearchParams(location.search).get('q') === 'p1')

    // Saved view.
    navigate({ view: 'view', id: view })
    await waitFor(() => r.container.textContent!.includes('Renew passport'))
    await openByClick('Renew passport')
    expect(pageFor()).toBe(inboxTask)
    await r.unmount()
  })

  it('opens the task named in an older ?task= address as its page', async () => {
    const id = await createTask({ title: 'Call the bank', due: { date: '2099-01-05' } })
    navigate({ view: 'upcoming' })
    history.replaceState(null, '', `/upcoming?task=${id}`)
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => pageFor() === id)
    expect(location.pathname).toBe(`/task/${id}`)
    await r.unmount()
  })

  it('a task deleted while its page is open says so', async () => {
    const id = await createTask({ title: 'Old chore' })
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Old chore'))
    await openByClick('Old chore')
    expect(pageFor()).toBe(id)
    const { deleteTask } = await import('../lib/ops')
    await deleteTask(id)
    await waitFor(() => pageFor() === null && r.container.textContent!.includes('This task no longer exists.'))
    await r.unmount()
  })
})
