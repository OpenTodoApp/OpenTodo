// @vitest-environment happy-dom
// The sidebar's spaces (OpenSpec change notes-space, app-shell "Sidebar spaces").
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { setFavourite } from '../lib/favourites'
import { createNote } from '../lib/noteOps'
import { createProject, resetDeviceId } from '../lib/ops'
import { currentSpace, setSpace, SPACE_KEY, spaceOfView } from '../lib/sidebarSpace'
import type { User } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { Sidebar } from './Sidebar'
import { resetSidebarLayout } from './sidebarLayout'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetSidebarLayout()
  resetPanel()
  setSpace('tasks')
  history.replaceState(null, '', '/')
})

const segment = (c: HTMLElement, id: 'tasks' | 'notes') => c.querySelector<HTMLButtonElement>(`[data-space-switch] [data-segment="${id}"]`)!

describe('spaceOfView (D3)', () => {
  it('maps notes to Notes, task screens to Tasks and keeps neutral screens', () => {
    expect(spaceOfView('notes')).toBe('notes')
    for (const v of ['inbox', 'today', 'project', 'task', 'label', 'view', 'day', 'loop', 'focus', 'review', 'anytime']) expect(spaceOfView(v)).toBe('tasks')
    for (const v of ['settings', 'help', 'import', 'theme-editor', 'ask', 'trash']) expect(spaceOfView(v)).toBeNull()
  })

  it('is remembered on the device and holds for the visit without storage', () => {
    setSpace('notes')
    expect(localStorage.getItem(SPACE_KEY)).toBe('notes')
    expect(currentSpace()).toBe('notes')
  })
})

describe('the switch', () => {
  it('Switch to Notes: opens /notes and shows All notes instead of the task destinations', async () => {
    const r = await render(<Sidebar route={{ view: 'today' }} user={user} />)
    await waitFor(() => !!segment(r.container, 'notes'), 'the switch')
    expect(segment(r.container, 'tasks').getAttribute('aria-checked')).toBe('true')
    expect(r.container.querySelector('[data-destination="inbox"]')).not.toBeNull()
    await click(segment(r.container, 'notes'))
    expect(location.pathname).toBe('/notes')
    expect(currentSpace()).toBe('notes')
    await r.unmount()
  })

  it('the Notes space lists All notes, Pinned in the favourites order and Recent', async () => {
    await createProject({ name: 'Home' })
    const wifi = await createNote({ title: 'Wi-Fi' })
    const packing = await createNote({ title: 'Packing list' })
    await createNote({ title: 'Trip' })
    await setFavourite('note', packing, true)
    await setFavourite('note', wifi, true)
    const r = await render(<Sidebar route={{ view: 'notes' }} user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-testid="sidebar-notes-recent"]'), 'the Notes groups')
    expect(r.container.querySelector('[data-destination="notes"]')!.getAttribute('aria-current')).toBe('page')
    expect(r.container.querySelector('[data-destination="inbox"]')).toBeNull()
    expect(r.container.querySelector('[data-project-id]')).toBeNull()
    const pinned = [...r.container.querySelectorAll('[data-testid="sidebar-notes-pinned"] [data-space-note]')].map((e) => e.textContent)
    expect(pinned).toEqual(['Packing list', 'Wi-Fi'])
    const recent = [...r.container.querySelectorAll('[data-testid="sidebar-notes-recent"] [data-space-note]')].map((e) => e.textContent)
    expect(recent).toEqual(['Trip'])
    await r.unmount()
  })

  it('Settings keeps the space; a task screen shows Tasks', async () => {
    setSpace('notes')
    const r = await render(<Sidebar route={{ view: 'settings' }} user={user} />)
    await waitFor(() => !!segment(r.container, 'notes'), 'the switch')
    expect(segment(r.container, 'notes').getAttribute('aria-checked')).toBe('true')
    await r.rerender(<Sidebar route={{ view: 'project', id: 'p1' }} user={user} />)
    await waitFor(() => segment(r.container, 'tasks').getAttribute('aria-checked') === 'true')
    expect(currentSpace()).toBe('tasks')
    await r.unmount()
  })

  it('pinned notes leave the Tasks space Favourites group', async () => {
    const wifi = await createNote({ title: 'Wi-Fi' })
    await setFavourite('note', wifi, true)
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-destination="inbox"]'))
    expect(r.container.querySelector('[data-testid="sidebar-favourites"]')).toBeNull()
    await r.unmount()
  })
})
