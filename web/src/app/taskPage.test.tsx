// @vitest-environment happy-dom
// The sticky panel header and the expanded task page (OpenSpec change ux-overhaul,
// web-app "Task panel layout", app-shell "Panel width and expansion").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
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
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); resetPanel() })

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const panel = () => document.querySelector<HTMLElement>('aside[data-detail-for]')

describe('panel header', () => {
  it('holds the checkbox and the title outside the scroller, and the checkbox completes the task', async () => {
    const project = await createProject({ name: 'Home' })
    const id = await createTask({ title: 'Paint the fence', project_id: project, priority: 2 })
    navigate({ view: 'project', id: project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Paint the fence'))
    r.container.querySelector<HTMLElement>('[data-task-id] button.min-w-0')!.click()
    await waitFor(() => !!panel())
    const header = panel()!.querySelector('[data-panel-header]')!
    const title = header.querySelector<HTMLInputElement>('input[aria-label="Title"]')!
    expect(title.value).toBe('Paint the fence')
    expect(header.querySelector('[data-panel-complete]')).toBeTruthy()
    // The header is not inside the panel's scroller.
    expect(header.closest('.overflow-y-auto')).toBeNull()
    expect([...panel()!.querySelectorAll('button')].some((b) => b.textContent === 'Complete')).toBe(false)
    await click(header.querySelector<HTMLButtonElement>('[data-panel-complete]')!)
    await waitFor(() => !!document.querySelector('[data-panel-complete][aria-pressed="true"]') || !panel())
    expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
    await r.unmount()
  })

  it('Expand opens the task as a page at /task/<id>; Back returns to the list with the panel open', async () => {
    const project = await createProject({ name: 'Home' })
    const id = await createTask({ title: 'Paint the fence', project_id: project })
    navigate({ view: 'project', id: project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Paint the fence'))
    r.container.querySelector<HTMLElement>('[data-task-id] button.min-w-0')!.click()
    await waitFor(() => !!panel())
    await click(panel()!.querySelector<HTMLButtonElement>('button[aria-label="Task actions"]')!)
    const expand = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent?.startsWith('Expand'))!
    await click(expand)
    await waitFor(() => location.pathname === `/task/${id}`)
    await waitFor(() => !!document.querySelector('aside[data-detail-variant="page"]'))
    // One detail on screen: the page, no panel in the slot.
    expect(document.querySelectorAll('aside[data-detail-for]')).toHaveLength(1)
    expect(document.querySelector(`[data-task-page="${id}"]`)).toBeTruthy()
    expect(document.querySelector('button[aria-label="Close"]')).toBeNull()
    await click(document.querySelector<HTMLButtonElement>('[data-task-back]')!)
    await waitFor(() => location.pathname === `/project/${project}`)
    await waitFor(() => !!document.querySelector('aside[data-detail-variant="panel"]'))
    expect(panel()!.getAttribute('data-detail-for')).toBe(id)
    await r.unmount()
  })

  it('a reload of /task/<id> renders the page', async () => {
    const id = await createTask({ title: 'Call the bank' })
    navigate({ view: 'task', id })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('aside[data-detail-variant="page"]'))
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Title"]')!.value).toBe('Call the bank')
    await r.unmount()
  })
})
