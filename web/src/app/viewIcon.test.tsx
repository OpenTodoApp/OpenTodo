// @vitest-environment happy-dom
// View icon (OpenSpec change sidebar-polish 4.2, custom-views "View icon"): an
// additive field picked from the icon catalogue through "Icon…" in the view menu,
// written as one op offline, shown wherever the view is listed; the default icon of
// the view's kind for none and for a name this device does not know.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { applyOps, resetDeviceId } from '../lib/ops'
import type { Op, User } from '../lib/types'
import { createView } from '../lib/views'
import { click, render, waitFor } from '../ui/test-utils'
import { buildEntries } from './palette'
import { Sidebar } from './Sidebar'
import { ViewMenu, ViewsView } from './ViewsView'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const iconItem = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent?.includes('Icon…'))

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  localStorage.setItem('ot.sidebar.group.filters', '1')
  // Offline: nothing answers.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('view icon', () => {
  it('Choose an icon: "Icon…" in the view menu writes one op and the Views group and overview show it at once', async () => {
    const id = await createView({ name: 'Waiting', query: 'p1', pinned: false })
    const side = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    const sideIcon = () => side.container.querySelector(`[data-view-id="${id}"] svg[data-icon]`)?.getAttribute('data-icon')
    await waitFor(() => sideIcon() === 'list', 'the default icon')
    const overview = await render(<ViewsView />)
    await waitFor(() => overview.container.querySelector('li svg[data-icon]')?.getAttribute('data-icon') === 'list', 'the overview row')

    const menu = await render(<ViewMenu view={(await db.views.get(id))!} />)
    await click(menu.container.querySelector('button[aria-label="Menu for view Waiting"]')!)
    await waitFor(() => !!iconItem(), 'the Icon… item')
    await click(iconItem()!)
    await waitFor(() => !!document.querySelector('[data-icon-option="hourglass"]'), 'the hourglass option')
    expect(document.querySelector('[data-icon-option="none"]')?.getAttribute('aria-selected')).toBe('true')
    await click(document.querySelector('[data-icon-option="hourglass"]')!)
    await waitFor(async () => (await db.views.get(id))?.icon === 'hourglass', 'stored')
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id && o.field === 'icon')
    expect(ops.map((o) => o.value)).toEqual(['hourglass'])
    await waitFor(() => sideIcon() === 'hourglass', 'the sidebar row')
    await waitFor(() => overview.container.querySelector('li svg[data-icon]')?.getAttribute('data-icon') === 'hourglass', 'the overview row')
    await menu.unmount()
    await overview.unmount()
    await side.unmount()
  })

  it('Unknown icon from a newer client: the default icon of its kind, and the stored name is kept', async () => {
    const id = await createView({ name: 'Board', kind: 'dashboard', pinned: true })
    await applyOps([{ id: 'n1', entity: 'view', entityId: id, field: 'icon', value: 'from-a-newer-release', ts: Date.now() + 1000, device: 'newer' } as Op])
    const side = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => side.container.querySelector(`[data-view-id="${id}"] svg[data-icon]`)?.getAttribute('data-icon') === 'kanban', 'the default board icon')
    // Pinned: its favourite shows the same fallback.
    expect(side.container.querySelector(`[data-favourite="view:${id}"] svg[data-icon]`)?.getAttribute('data-icon')).toBe('kanban')
    expect((await db.views.get(id))?.icon).toBe('from-a-newer-release')
    expect((await db.outbox.toArray()).filter((o) => o.field === 'icon')).toEqual([])
    await side.unmount()
  })

  it('the palette carries the icon of a view result', async () => {
    const id = await createView({ name: 'Waiting', query: 'p1', pinned: false })
    await applyOps([{ id: 'i1', entity: 'view', entityId: id, field: 'icon', value: 'hourglass', ts: Date.now() + 1000, device: 'laptop' } as Op])
    const views = await db.views.toArray()
    const entry = buildEntries({ tasks: [], projects: [], labels: [], views, user }).find((e) => e.key === `view:${id}`)!
    expect(entry.catalogueIcon).toBe('hourglass')
  })
})
