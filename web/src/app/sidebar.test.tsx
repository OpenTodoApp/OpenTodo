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
import { setCollapsedProjects } from '../lib/projects'
import { createView } from '../lib/views'
import { applyOps, createProject, createTask, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import type { Membership, Op, User } from '../lib/types'
import { click, flush, key, render, type } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { sidebarFind } from './signals'
import { Shell } from './Shell'
import { Sidebar } from './Sidebar'
import { resetSidebarLayout, setSidebarWidth, sidebarLayout, toggleSidebarCollapsed } from './sidebarLayout'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

// happy-dom reports a 1024 px window with a fine pointer (the desktop sidebar). A touch
// screen (sidebar-compact-desktop): pointer queries answer coarse, widths as before.
const realMatchMedia = window.matchMedia
function touchScreen() {
  window.matchMedia = ((q: string) => {
    const matches = /pointer:\s*fine/.test(q) ? false : /pointer:\s*coarse/.test(q) ? true : realMatchMedia.call(window, q).matches
    return { matches, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
  }) as typeof window.matchMedia
}
afterEach(() => { window.matchMedia = realMatchMedia })

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
  it('only the middle part scrolls; More and labels live in it, the account row and the primary navigation outside it', async () => {
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
    // On a desktop More is a menu among the primary destinations (sidebar-compact-desktop).
    expect(scroller.contains(side.querySelector('[data-sidebar-more-menu]'))).toBe(false)
    expect(side.querySelector('nav[data-sidebar-primary] [data-sidebar-more-menu]')).not.toBeNull()
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
  // The inline More group is the touch layout (sidebar-compact-desktop); the desktop menu is tested below.
  beforeEach(touchScreen)

  it('on a touch screen the More group scrolls with the groups, so opening it on a short phone screen cannot squeeze the scroller away (sidebar-drawer-scroll)', async () => {
    const r = await render(<aside data-sidebar><Sidebar route={{ view: 'inbox' }} user={user} /></aside>)
    await flush(50)
    expect(r.container.querySelector('[data-sidebar-scroll]')!.contains(moreOf(r.container))).toBe(true)
    expect(r.container.querySelector('[data-sidebar-more-menu]')).toBeNull()
    await r.unmount()
  })

  it('shows Inbox, Today, Upcoming and Calendar, then a closed More group; Assigned and Updates only once a project is shared', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    expect(primaryOf(r.container)).toEqual(['inbox', 'today', 'upcoming', 'day'])
    expect(moreToggle(r.container).getAttribute('aria-expanded')).toBe('false')
    expect(moreItems(r.container)).toEqual([])
    await click(moreToggle(r.container))
    expect(moreItems(r.container)).toEqual(['anytime', 'someday', 'completed', 'review', 'stats', 'trash', 'filter'])
    expect(localStorage.getItem('ot.sidebar.more')).toBe('1')
    // A shared project brings Assigned to me and Updates.
    await db.memberships.put({ projectId: 'p1', role: 'editor', ownerId: 'alice', members: [] } as Membership)
    await waitFor(() => moreItems(r.container).includes('assigned'))
    expect(moreItems(r.container)).toEqual(['anytime', 'someday', 'assigned', 'completed', 'review', 'stats', 'feed', 'trash', 'filter'])
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

describe('the desktop sidebar (sidebar-compact-desktop)', () => {
  const menuItems = () => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((b) => b.getAttribute('data-menu-label'))
  const moreButton = (root: ParentNode) => root.querySelector<HTMLButtonElement>('[data-sidebar-more-menu] button[aria-haspopup="menu"]')!

  it('opens More as a menu after the primary destinations; a chosen item navigates; the review due marker is on the row', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    expect(r.container.querySelector('[data-testid="sidebar-more"]')).toBeNull()
    const trigger = moreButton(r.container)
    expect(trigger.getAttribute('aria-label')).toBe('More')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    // Never reviewed: the review is due, and the closed More row says so.
    expect(trigger.querySelector('[data-review-due-more]')).not.toBeNull()
    await click(trigger)
    await waitFor(() => menuItems().length > 0)
    expect(menuItems()).toEqual(['Anytime', 'Someday', 'Completed', 'Review', 'Statistics', 'Trash', 'Filter'])
    expect(document.querySelector('[data-menu-label="Review"]')?.textContent).toContain('Review due')
    await click(document.querySelector<HTMLElement>('[data-menu-label="Someday"]')!)
    await waitFor(() => window.location.pathname === '/someday')
    expect(document.querySelector('[role="menu"]')).toBeNull()
    // While a More destination is open, the More row is marked as the current place.
    await r.rerender(<Sidebar route={{ view: 'someday' }} user={user} />)
    expect(moreButton(r.container).className).toContain('bg-accent-soft')
    await r.unmount()
  })

  it('puts Search beside the name and Help in one footer row with the other controls, each with its name', async () => {
    const r = await render(<Sidebar route={{ view: 'help' }} user={user} onSearch={() => {}} onShortcuts={() => {}} onToggleCollapse={() => {}} />)
    await flush(50)
    const search = r.container.querySelector('[data-palette-button]')!
    expect(search.getAttribute('aria-label')).toBe('Search and commands')
    expect(search.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K')
    expect(r.container.querySelector('[data-sidebar-footer]')!.contains(search)).toBe(false)
    const row = r.container.querySelector('[data-sidebar-footer] [data-footer-icons]')!
    const names = [...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(expect.arrayContaining(['Help', 'Notifications', 'Keyboard shortcuts', 'Collapse sidebar']))
    expect(row.querySelector('[data-help-button]')?.getAttribute('aria-current')).toBe('page')
    await r.unmount()
  })

  it('keeps Help as a full row on a phone, and the rail keeps Search in its footer', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} />)
      await flush(50)
      const help = r.container.querySelector('[data-sidebar-footer] [data-help-button]')!
      expect(help.hasAttribute('data-sidebar-item')).toBe(true)
      expect(help.textContent).toContain('Help')
      await r.unmount()
    } finally { window.matchMedia = original }
    const rail = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} collapsed onToggleCollapse={() => {}} />)
    await flush(50)
    expect(rail.container.querySelector('[data-sidebar-footer] [data-palette-button]')).not.toBeNull()
    await rail.unmount()
  })

  it('shows no Filters or Labels group while there is nothing in it, and brings each back with its first item', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    const groups = () => [...r.container.querySelectorAll('[data-sidebar-group]')].map((g) => g.getAttribute('data-sidebar-group'))
    expect(groups()).toEqual(['Projects'])
    expect(r.container.textContent).not.toContain('Save a filter')
    expect(r.container.textContent).not.toContain('No labels yet')
    await createView({ name: 'Errands', query: 'today' })
    await waitFor(() => groups().includes('Filters'))
    await createLabel({ name: 'errand' })
    await waitFor(() => groups().includes('Labels'))
    expect(groups()).toEqual(['Filters', 'Projects', 'Labels'])
    await r.unmount()
  })

  it('rows are 32 px with a fine pointer and keep 36 px for touch; the scroller has the thin scrollbar and fade markers', async () => {
    await createProject({ name: 'Home' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector('[data-project-id]') !== null)
    const cls = r.container.querySelector('[data-destination="inbox"]')!.className
    expect(cls).toContain('min-h-9')
    expect(cls).toContain('pointer-fine:min-h-8')
    expect(r.container.querySelector('[data-sidebar-scroll]')!.classList.contains('ui-scroller')).toBe(true)
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

// ---- sidebar-groups: collapsible groups, tree defaults, find in the sidebar ----

/** Thirty projects in nine roots, as the exploration seeded them. */
async function seedTree(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  const add = async (name: string, parent?: string) => { ids[name] = await createProject({ name, parent_id: parent ? ids[parent] : null }) }
  await add('Work'); await add('Website launch', 'Work'); await add('Design', 'Website launch'); await add('Content', 'Website launch')
  await add('Q4 planning', 'Work'); await add('Hiring', 'Work'); await add('Backend engineer', 'Hiring'); await add('Designer', 'Hiring')
  await add('Customer calls', 'Work'); await add('Acme', 'Customer calls'); await add('Globex', 'Customer calls')
  await add('Home'); await add('Kitchen renovation', 'Home'); await add('Garden', 'Home'); await add('Car', 'Home')
  await add('Health'); await add('Running', 'Health'); await add('Finances'); await add('Taxes 2026', 'Finances'); await add('Investments', 'Finances')
  await add('Reading list'); await add('Side project'); await add('Docs', 'Side project'); await add('Mobile app', 'Side project')
  await add('Travel'); await add('Lisbon in May', 'Travel'); await add('Family'); await add('School', 'Family'); await add('Birthdays', 'Family'); await add('Someday maybe')
  return ids
}
const projectRows = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-project-id]')].map((b) => b.querySelector('.truncate')?.textContent ?? '')
const groupOf = (root: ParentNode, title: string) => root.querySelector(`[data-sidebar-group="${title}"]`)!
const headingOf = (root: ParentNode, title: string) => groupOf(root, title).querySelector<HTMLButtonElement>('button[aria-expanded]')!
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes(label))!

describe('collapsible groups (sidebar-groups 1.2)', () => {
  it('Filters folds with its count on the heading, remembers it on the device, and keeps its All action', async () => {
    await createProject({ name: 'Home' })
    for (let i = 1; i <= 6; i++) await createView({ name: `Filter ${i}`, query: 'p1', pinned: true })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelectorAll('[data-view-id]').length === 6)
    expect(groupOf(r.container, 'Filters').querySelector('[data-group-count]')).toBeNull()
    await click(headingOf(r.container, 'Filters'))
    await flush(20)
    expect(r.container.querySelectorAll('[data-view-id]')).toHaveLength(0)
    expect(groupOf(r.container, 'Filters').querySelector('[data-group-count]')?.textContent).toBe('6')
    expect(headingOf(r.container, 'Filters').textContent).toContain('Filters')
    expect(localStorage.getItem('ot.sidebar.group.filters')).toBe('0')
    // Projects starts right under the folded heading; the All action still works.
    expect(groupOf(r.container, 'Projects').querySelector('[data-project-id]')).not.toBeNull()
    await click(groupOf(r.container, 'Filters').querySelector('button[aria-label="All filters"]')!)
    expect(location.pathname).toBe('/views')
    await r.unmount()
    const again = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    expect(again.container.querySelectorAll('[data-view-id]')).toHaveLength(0)
    expect(headingOf(again.container, 'Filters').getAttribute('aria-expanded')).toBe('false')
    // Other devices are not told: nothing synced, only localStorage.
    expect(await db.outbox.count()).toBeGreaterThan(0)
    expect((await db.outbox.toArray()).some((o) => JSON.stringify(o).includes('ot.sidebar'))).toBe(false)
    await again.unmount()
  })

  it('every group folds; a folded group takes one line, and adding a label reopens Labels', async () => {
    await createProject({ name: 'Home' })
    await createLabel({ name: 'errand' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector('[data-label-row]') !== null)
    for (const g of ['Projects', 'Labels']) await click(headingOf(r.container, g))
    await flush(20)
    expect(r.container.querySelector('[data-project-id]')).toBeNull()
    expect(r.container.querySelector('[data-label-row]')).toBeNull()
    expect(groupOf(r.container, 'Projects').querySelector('[data-group-count]')?.textContent).toBe('1')
    expect(groupOf(r.container, 'Labels').querySelector('[data-group-count]')?.textContent).toBe('1')
    await click(groupOf(r.container, 'Labels').querySelector('button[aria-label="New label"]')!)
    await flush(20)
    expect(headingOf(r.container, 'Labels').getAttribute('aria-expanded')).toBe('true')
    expect(r.container.querySelector('[data-label-row]')).not.toBeNull()
    await r.unmount()
  })
})

describe('tree defaults and bulk toggles (sidebar-groups 2.2)', () => {
  it('a new device shows the roots only with subtree counts; Collapse all and Expand all; navigation reveals only the ancestors', async () => {
    const ids = await seedTree()
    await createTask({ title: 'Mock-ups', project_id: ids.Designer })
    await createTask({ title: 'Plan', project_id: ids.Work })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelectorAll('[data-project-id]').length === 9)
    expect(projectRows(r.container)).toEqual(['Work', 'Home', 'Health', 'Finances', 'Reading list', 'Side project', 'Travel', 'Family', 'Someday maybe'])
    // "Work" counts its whole subtree while collapsed (the counts follow the tasks, read on their own).
    await waitFor(() => r.container.querySelector(`[data-project-id="${ids.Work}"] [data-count]`)?.textContent === '2')
    // Expand all, then Collapse all, from the Projects header menu.
    await click(groupOf(r.container, 'Projects').querySelector('button[aria-label="Add or fold projects"]')!)
    await waitFor(() => !!menuItem('Expand all'))
    await click(menuItem('Expand all'))
    await waitFor(() => r.container.querySelectorAll('[data-project-id]').length === 30)
    expect(r.container.querySelector(`[data-project-id="${ids.Work}"] [data-count]`)?.textContent).toBe('1')
    await click(groupOf(r.container, 'Projects').querySelector('button[aria-label="Add or fold projects"]')!)
    await waitFor(() => !!menuItem('Collapse all'))
    await click(menuItem('Collapse all'))
    await waitFor(() => r.container.querySelectorAll('[data-project-id]').length === 9)
    // Opening a nested project (the palette, a link) expands its ancestors and nothing else.
    await r.rerender(<Sidebar route={{ view: 'project', id: ids.Designer }} user={user} />)
    await waitFor(() => r.container.querySelector(`[data-project-id="${ids.Designer}"]`) !== null)
    expect(projectRows(r.container)).toEqual(['Work', 'Website launch', 'Q4 planning', 'Hiring', 'Backend engineer', 'Designer', 'Customer calls', 'Home', 'Health', 'Finances', 'Reading list', 'Side project', 'Travel', 'Family', 'Someday maybe'])
    await r.unmount()
  })

  it('a device that already stored a collapse state keeps it', async () => {
    const ids = await seedTree()
    await setCollapsedProjects(new Set([ids.Home]))
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelectorAll('[data-project-id]').length > 9)
    expect(projectRows(r.container)).toContain('Designer')
    expect(projectRows(r.container)).not.toContain('Garden')
    await r.unmount()
  })
})

describe('find in the sidebar (sidebar-groups 3.2)', () => {
  const field = (root: ParentNode) => root.querySelector<HTMLInputElement>('input[aria-label="Find in the sidebar"]')
  const opener = (root: ParentNode) => root.querySelector<HTMLButtonElement>('button[aria-label="Find in the sidebar"]')!

  it('narrows the tree to the match and its ancestors; Enter opens the first match', async () => {
    const ids = await seedTree()
    await createLabel({ name: 'errand' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelectorAll('[data-project-id]').length === 9)
    expect(field(r.container)).toBeNull()
    await click(opener(r.container))
    await waitFor(() => field(r.container) !== null)
    expect(document.activeElement).toBe(field(r.container))
    await type(field(r.container)!, 'des')
    await waitFor(() => projectRows(r.container).length === 5)
    expect(projectRows(r.container)).toEqual(['Work', 'Website launch', 'Design', 'Hiring', 'Designer'])
    expect(r.container.querySelector('[data-sidebar-group="Labels"]')).toBeNull()
    expect(r.container.querySelector('[data-find-active]')?.getAttribute('data-project-id')).toBe(ids.Design)
    await key(field(r.container)!, 'ArrowDown')
    expect(r.container.querySelector('[data-find-active]')?.getAttribute('data-project-id')).toBe(ids.Designer)
    await key(field(r.container)!, 'Enter')
    expect(location.pathname).toBe(`/project/${ids.Designer}`)
    expect(field(r.container)).toBeNull()
    await r.unmount()
  })

  it('matches across groups and hides groups without matches', async () => {
    await createProject({ name: 'Home' })
    await createLabel({ name: 'waiting' })
    await createView({ name: 'Waiting for', query: '@waiting', pinned: true })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector('[data-view-id]') !== null && r.container.querySelector('[data-label-row]') !== null)
    await click(opener(r.container))
    await waitFor(() => field(r.container) !== null)
    await type(field(r.container)!, 'wait')
    await waitFor(() => r.container.querySelectorAll('[data-project-id]').length === 0)
    // Projects keeps its header (it holds the field's opener) but lists nothing.
    expect(groupOf(r.container, 'Projects')).toBeTruthy()
    expect(r.container.querySelectorAll('[data-view-id]')).toHaveLength(1)
    expect(r.container.querySelectorAll('[data-label-row]')).toHaveLength(1)
    expect(groupOf(r.container, 'Labels')).toBeTruthy()
    expect(groupOf(r.container, 'Filters')).toBeTruthy()
    await type(field(r.container)!, 'zzz')
    await waitFor(() => r.container.querySelector('[role="status"]')?.textContent === 'Nothing matches.')
    await r.unmount()
  })

  it('Escape clears, restores a collapsed group and returns focus to the opener', async () => {
    await createProject({ name: 'Home' })
    await createLabel({ name: 'errand' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector('[data-label-row]') !== null)
    await click(headingOf(r.container, 'Labels'))
    await flush(20)
    expect(r.container.querySelector('[data-label-row]')).toBeNull()
    await click(opener(r.container))
    await waitFor(() => field(r.container) !== null)
    await type(field(r.container)!, 'err')
    await waitFor(() => r.container.querySelector('[data-label-row]') !== null)
    expect(localStorage.getItem('ot.sidebar.group.labels')).toBe('0')
    await key(field(r.container)!, 'Escape')
    await flush(20)
    expect(field(r.container)).toBeNull()
    expect(r.container.querySelector('[data-label-row]')).toBeNull()
    expect(headingOf(r.container, 'Labels').getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(opener(r.container))
    await r.unmount()
  })

  it('g / opens the field from the shell, expanding the icon rail first', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: /1024/.test(q), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      await createProject({ name: 'Home' })
      navigate({ view: 'inbox' })
      toggleSidebarCollapsed()
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => document.querySelector('aside[data-sidebar]')?.getAttribute('data-sidebar-width') === 'collapsed')
      await flush(100)
      await key(document.body, 'g')
      await key(document.body, '/')
      await waitFor(() => document.querySelector('input[aria-label="Find in the sidebar"]') !== null)
      expect(document.querySelector('aside[data-sidebar]')?.getAttribute('data-sidebar-width')).toBe('16')
      await waitFor(() => document.activeElement === document.querySelector('input[aria-label="Find in the sidebar"]'))
      await r.unmount()
    } finally {
      window.matchMedia = original
    }
  })
})

describe('find in the drawer and the budget (sidebar-groups 3.4)', () => {
  it('on a phone the drawer opens the field, and choosing a match closes the drawer and opens the destination', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const original = window.matchMedia
    // Nothing matches: below 768 px, a coarse pointer is not needed for the drawer.
    window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      const work = await createProject({ name: 'Work' })
      const hiring = await createProject({ name: 'Hiring', parent_id: work })
      const designer = await createProject({ name: 'Designer', parent_id: hiring })
      navigate({ view: 'inbox' })
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => document.querySelector('aside[data-sidebar]') !== null)
      const aside = () => document.querySelector('aside[data-sidebar]')!
      expect(aside().className).toContain('-translate-x-full')
      await click([...document.querySelectorAll('[data-tab]')].find((t) => t.textContent === 'More')!)
      await waitFor(() => aside().className.includes('translate-x-0'))
      // The palette command (and `g /`) open the field inside the drawer.
      sidebarFind.request('open')
      await waitFor(() => document.querySelector('input[aria-label="Find in the sidebar"]') !== null)
      const field = document.querySelector<HTMLInputElement>('input[aria-label="Find in the sidebar"]')!
      expect(aside().querySelector('[data-sidebar-scroll]')!.contains(field)).toBe(true)
      await type(field, 'desi')
      await waitFor(() => document.querySelector(`[data-project-id="${designer}"]`) !== null)
      await key(field, 'Enter')
      await waitFor(() => location.pathname === `/project/${designer}`)
      await waitFor(() => aside().className.includes('-translate-x-full'))
      await r.unmount()
    } finally {
      window.matchMedia = original
    }
  })

  it('the find field adds no scroller: the sidebar still scrolls as one', async () => {
    for (let i = 0; i < 20; i++) await createProject({ name: `Project ${i}` })
    await createLabel({ name: 'errand' })
    const r = await render(<aside data-sidebar><Sidebar route={{ view: 'inbox' }} user={user} /></aside>)
    await waitFor(() => r.container.textContent!.includes('Project 19'))
    await click(r.container.querySelector('button[aria-label="Find in the sidebar"]')!)
    await waitFor(() => r.container.querySelector('input[aria-label="Find in the sidebar"]') !== null)
    await type(r.container.querySelector<HTMLInputElement>('input[aria-label="Find in the sidebar"]')!, 'project 1')
    await flush(50)
    const scrollers = [...r.container.querySelectorAll('*')].filter((el) => /\boverflow-y-auto\b/.test(el.className))
    expect(scrollers).toHaveLength(1)
    expect(scrollers[0].contains(r.container.querySelector('[data-sidebar-find]'))).toBe(true)
    await r.unmount()
  })
})
