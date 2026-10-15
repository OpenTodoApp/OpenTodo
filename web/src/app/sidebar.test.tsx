// @vitest-environment happy-dom
// The sidebar scrolls as one (OpenSpec change ux-overhaul, app-shell "Sidebar
// structure"): the name and primary destinations are pinned at the top, Help and
// the account at the bottom, and views, projects and labels share one scroller.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPromoted } from '../lib/appearance'
import { rememberCalendarMode } from '../lib/calendarMode'
import { db } from '../lib/db'
import { ensureFeedBaselines } from '../lib/feed'
import { createLabel } from '../lib/labels'
import { applyOps, createProject, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import type { Membership, Op, User } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { Sidebar } from './Sidebar'
import { resetSidebarLayout, setSidebarWidth, sidebarLayout, toggleSidebarCollapsed } from './sidebarLayout'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetSidebarLayout()
  resetPanel()
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); resetSidebarLayout() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('one scroller', () => {
  it('only the middle part scrolls; labels live in it, the account row and the primary navigation outside it', async () => {
    for (let i = 0; i < 40; i++) await createProject({ name: `Project ${i}` })
    await createLabel({ name: 'errand' })
    const r = await render(<aside data-sidebar><Sidebar route={{ view: 'inbox' }} user={user} /></aside>)
    await waitFor(() => r.container.textContent!.includes('Project 39') && r.container.textContent!.includes('errand'))
    const side = r.container.querySelector('[data-sidebar]')!
    const scrollers = [...side.querySelectorAll('*')].filter((el) => /\boverflow-y-auto\b/.test(el.className))
    expect(scrollers).toHaveLength(1)
    const scroller = scrollers[0]
    expect(scroller.getAttribute('data-sidebar-scroll')).not.toBeNull()
    // Labels are not nested in the Projects list and share the one scroller.
    const labels = side.querySelector('nav[aria-label="Labels"]')!
    expect(labels).toBeTruthy()
    expect(scroller.contains(labels)).toBe(true)
    expect(side.querySelector('nav[aria-label="Projects"]')!.contains(labels)).toBe(false)
    // Pinned ends: Inbox and the account row are outside the scroller.
    const inbox = [...side.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('Inbox'))!
    const account = [...side.querySelectorAll('button')].find((b) => b.textContent?.includes('Ada'))!
    const help = [...side.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Help')!
    expect(scroller.contains(inbox)).toBe(false)
    expect(scroller.contains(account)).toBe(false)
    expect(scroller.contains(help)).toBe(false)
    expect(side.querySelector('[data-sidebar-footer]')!.contains(account)).toBe(true)
    await r.unmount()
  })
})

const primaryOf = (root: ParentNode) => [...root.querySelectorAll('nav[data-sidebar-primary] [data-sidebar-item]')].map((b) => b.getAttribute('data-destination'))
const moreOf = (root: ParentNode) => root.querySelector('[data-testid="sidebar-more"]')!
const moreItems = (root: ParentNode) => [...moreOf(root).querySelectorAll('[data-sidebar-item]')].map((b) => b.getAttribute('data-destination'))
const moreToggle = (root: ParentNode) => moreOf(root).querySelector<HTMLButtonElement>('button[aria-expanded]')!

describe('primary destinations and More (ux-overhaul 4.1)', () => {
  it('shows Inbox, Today, Upcoming and Calendar, then a closed More group; Assigned and Updates only once a project is shared', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    expect(primaryOf(r.container)).toEqual(['inbox', 'today', 'upcoming', 'day'])
    expect(moreToggle(r.container).getAttribute('aria-expanded')).toBe('false')
    expect(moreItems(r.container)).toEqual([])
    await click(moreToggle(r.container))
    expect(moreItems(r.container)).toEqual(['anytime', 'someday', 'completed', 'trash', 'filter'])
    expect(localStorage.getItem('ot.sidebar.more')).toBe('1')
    // A shared project brings Assigned to me and Updates.
    await db.memberships.put({ projectId: 'p1', role: 'editor', ownerId: 'alice', members: [] } as Membership)
    await waitFor(() => moreItems(r.container).includes('assigned'))
    expect(moreItems(r.container)).toEqual(['anytime', 'someday', 'assigned', 'completed', 'feed', 'trash', 'filter'])
    expect(primaryOf(r.container)).toHaveLength(4)
    await r.unmount()
  })

  it('a promoted destination leaves More for the primary list, and Calendar opens the mode last used', async () => {
    await setPromoted(null, 'completed', true)
    rememberCalendarMode('week')
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => primaryOf(r.container).includes('completed'))
    expect(primaryOf(r.container)).toEqual(['inbox', 'today', 'upcoming', 'week', 'completed'])
    await click(moreToggle(r.container))
    expect(moreItems(r.container)).not.toContain('completed')
    // Day and Week are one active item.
    await r.rerender(<Sidebar route={{ view: 'day' }} user={user} />)
    await flush(20)
    expect(r.container.querySelector('[data-destination="week"]')?.getAttribute('aria-current')).toBe('page')
    await r.unmount()
  })

  it('carries the unread count on the closed More header, and on Updates once it is open', async () => {
    await setCurrentUserId('alice')
    await db.memberships.put({ projectId: 'p1', role: 'editor', ownerId: 'alice', members: [] } as Membership)
    await ensureFeedBaselines(1000)
    const byBob: Op[] = [
      { id: 'o1', entity: 'task', entityId: 'task-1', field: 'project_id', value: 'p1', ts: 2000, device: 'bob', actor: 'bob' },
      { id: 'o2', entity: 'task', entityId: 'task-1', field: 'title', value: 'Buy milk', ts: 2000, device: 'bob', actor: 'bob' },
      { id: 'o3', entity: 'task', entityId: 'task-1', field: 'created_at', value: 2000, ts: 2000, device: 'bob', actor: 'bob' },
    ]
    await applyOps(byBob)
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => moreOf(r.container).querySelector('button[aria-expanded="false"] [data-unread-count]') !== null)
    expect(moreOf(r.container).querySelector('[data-unread-count]')?.getAttribute('data-unread-count')).toBe('1')
    await click(moreToggle(r.container))
    await waitFor(() => moreOf(r.container).querySelector('[data-destination="feed"] [data-unread-count]') !== null)
    expect(moreOf(r.container).querySelector('button[aria-expanded="true"] [data-unread-count]')).toBeNull()
    await r.unmount()
  })
})

describe('resize and collapse (ux-overhaul 4.9)', () => {
  it('keeps the width between 15 and 22.5 rem in half-rem steps, per device', () => {
    expect(sidebarLayout()).toEqual({ width: 16, collapsed: false })
    setSidebarWidth(10)
    expect(sidebarLayout().width).toBe(15)
    setSidebarWidth(30)
    expect(sidebarLayout().width).toBe(22.5)
    setSidebarWidth(16.3)
    expect(sidebarLayout().width).toBe(16.5)
    expect(localStorage.getItem('ot.sidebar.width')).toBe('16.5')
    toggleSidebarCollapsed()
    expect(sidebarLayout().collapsed).toBe(true)
    expect(localStorage.getItem('ot.sidebar.collapsed')).toBe('1')
    toggleSidebarCollapsed()
    expect(sidebarLayout().collapsed).toBe(false)
  })

  it('collapsed to icons, the rail keeps every destination with its name for assistive technology and no group headings', async () => {
    await createProject({ name: 'Home' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} collapsed onToggleCollapse={() => {}} />)
    await waitFor(() => r.container.querySelector('[data-project-id]') !== null)
    expect(r.container.querySelector('[data-sidebar-collapsed]')).toBeTruthy()
    expect(primaryOf(r.container)).toEqual(['inbox', 'today', 'upcoming', 'day'])
    const inbox = r.container.querySelector('[data-destination="inbox"]')!
    expect(inbox.querySelector('.sr-only')?.textContent).toBe('Inbox')
    expect(inbox.querySelector('[data-count]')).toBeNull()
    expect(r.container.querySelector('[data-sidebar-collapse]')?.getAttribute('aria-pressed')).toBe('true')
    expect(r.container.querySelector('[data-sidebar-collapse]')?.getAttribute('aria-label')).toBe('Expand sidebar')
    expect(r.container.textContent).not.toContain('Projects')
    expect(r.container.textContent).not.toContain('OpenTodo')
    await r.unmount()
  })

  it('[ toggles the rail from 1024 px and the separator resizes with the arrow keys', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: /1024/.test(q), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      navigate({ view: 'inbox' })
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => document.querySelector('aside[data-sidebar]') !== null)
      const aside = () => document.querySelector('aside[data-sidebar]')!
      expect(aside().getAttribute('data-sidebar-width')).toBe('16')
      const sep = document.querySelector('[role="separator"][aria-label="Resize sidebar"]')!
      expect(sep.getAttribute('aria-valuenow')).toBe('16')
      await key(sep, 'ArrowRight')
      await waitFor(() => aside().getAttribute('data-sidebar-width') === '16.5')
      await key(sep, 'End')
      await waitFor(() => aside().getAttribute('data-sidebar-width') === '22.5')

      await key(document.body, '[')
      await waitFor(() => aside().getAttribute('data-sidebar-width') === 'collapsed')
      expect(document.querySelector('[role="separator"][aria-label="Resize sidebar"]')).toBeNull()
      await key(document.body, '[')
      await waitFor(() => aside().getAttribute('data-sidebar-width') === '22.5')
      // The calendar keeps [ for its range.
      navigate({ view: 'day' })
      await flush(50)
      await key(document.body, '[')
      await flush(50)
      expect(aside().getAttribute('data-sidebar-width')).toBe('22.5')
      await r.unmount()
    } finally {
      window.matchMedia = original
    }
  })
})
