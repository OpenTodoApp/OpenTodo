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
import { click, flush, key, render, spokenText, type, visibleText } from '../ui/test-utils'
import { setMethodMode } from '../lib/method/mode'
import { REVIEW_DEFAULTS } from '../lib/ops'
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

/** Labels and Filters start folded on a new device (sidebar-favourites D5): open them as a device that stored it. */
function openGroups(...ids: ('labels' | 'filters')[]) {
  for (const id of ids) localStorage.setItem(`ot.sidebar.group.${id}`, '1')
}

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('one scroller', () => {
  it('only the middle part scrolls; More and labels live in it, the account row and the primary navigation outside it', async () => {
    for (let i = 0; i < 40; i++) await createProject({ name: `Project ${i}` })
    await createLabel({ name: 'errand' })
    openGroups('labels')
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
    const account = side.querySelector('[data-account-menu]')!
    expect(account.textContent).toContain('Ada')
    expect(scroller.contains(inbox)).toBe(false)
    expect(scroller.contains(account)).toBe(false)
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
    expect(moreItems(r.container)).toEqual(['loop', 'next', 'waiting', 'anytime', 'someday', 'completed', 'review', 'stats', 'places', 'rules', 'trash', 'filter'])
    expect(localStorage.getItem('ot.sidebar.more')).toBe('1')
    // A shared project brings Assigned to me and Updates.
    await db.memberships.put({ projectId: 'p1', role: 'editor', ownerId: 'alice', members: [] } as Membership)
    await waitFor(() => moreItems(r.container).includes('assigned'))
    expect(moreItems(r.container)).toEqual(['loop', 'next', 'waiting', 'anytime', 'someday', 'assigned', 'completed', 'review', 'stats', 'feed', 'places', 'rules', 'trash', 'filter'])
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

  it('Companion promotes Next: it joins the primary items, and an entry an older client does not know is kept', async () => {
    await applyOps([{ id: 'x1', entity: 'user_prefs', entityId: 'me', field: 'sidebar_destinations', value: 'next,loop-of-the-future', ts: 5, device: 'laptop' } as Op])
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => primaryOf(r.container).includes('next'))
    expect(primaryOf(r.container)).toEqual(['inbox', 'today', 'upcoming', 'day', 'next'])
    expect((await db.userPrefs.get('me'))?.sidebar_destinations).toBe('next,loop-of-the-future')
    await r.unmount()
  })

  it('Open Loops first sidebar: six destinations by the Places; Upcoming and Calendar join More; promotions are kept for later', async () => {
    await setPromoted(null, 'someday', true)
    await applyOps([{ id: 'm1', entity: 'user_prefs', entityId: 'me', field: 'method_mode', value: 'first', ts: Date.now() + 1000, device: 'laptop' } as Op])
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => primaryOf(r.container)[0] === 'loop')
    expect(primaryOf(r.container)).toEqual(['loop', 'inbox', 'today', 'next', 'waiting', 'review'])
    // Review is a primary item here, so the closed More row does not repeat its marker.
    expect(r.container.querySelector('[data-review-due-more]')).toBeNull()
    expect(r.container.querySelector('[data-destination="review"] [data-review-due]')).not.toBeNull()
    await click(moreToggle(r.container))
    expect(moreItems(r.container).slice(0, 4)).toEqual(['upcoming', 'day', 'anytime', 'someday'])
    expect(moreItems(r.container)).not.toContain('loop')
    // Back to Companion: the promoted Someday is a primary destination again.
    await applyOps([{ id: 'm2', entity: 'user_prefs', entityId: 'me', field: 'method_mode', value: 'companion', ts: Date.now() + 2000, device: 'laptop' } as Op])
    await waitFor(() => primaryOf(r.container).includes('someday'))
    expect(primaryOf(r.container)).toEqual(['inbox', 'today', 'upcoming', 'day', 'someday'])
    await r.unmount()
  })

  it('carries the unread count on Updates, never on the More header (sidebar-v2 D7)', async () => {
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
    await flush(100)
    expect(moreOf(r.container).querySelector('[data-unread-count]')).toBeNull()
    await click(moreToggle(r.container))
    await waitFor(() => moreOf(r.container).querySelector('[data-destination="feed"] [data-unread-count]') !== null)
    expect(moreOf(r.container).querySelector('[data-destination="feed"] [data-unread-count]')?.getAttribute('data-unread-count')).toBe('1')
    expect(moreOf(r.container).querySelector('button[aria-expanded] [data-unread-count]')).toBeNull()
    await r.unmount()
  })
})

describe('the desktop sidebar (sidebar-compact-desktop)', () => {
  const menuItems = () => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((b) => b.getAttribute('data-menu-label'))
  const moreButton = (root: ParentNode) => root.querySelector<HTMLButtonElement>('[data-sidebar-more-menu] button[aria-haspopup="menu"]')!

  it('opens More as a menu from a group-style heading; a chosen item navigates; the review due marker is on Review (sidebar-v2 D7)', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    expect(r.container.querySelector('[data-testid="sidebar-more"]')).toBeNull()
    const trigger = moreButton(r.container)
    expect(trigger.getAttribute('aria-label')).toBeNull()
    // A group heading: the label alone, no icon and no marker, even with the review due.
    expect(trigger.textContent).toBe('More')
    expect(trigger.className).toContain('uppercase')
    expect(trigger.querySelector('[data-icon="ellipsis"]')).toBeNull()
    expect(trigger.querySelector('[data-dot]')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await click(trigger)
    await waitFor(() => menuItems().length > 0)
    expect(menuItems()).toEqual(['Loop home', 'Next', 'Waiting', 'Anytime', 'Someday', 'Completed', 'Review', 'Statistics', 'Locations', 'Rules', 'Trash', 'Filter'])
    // Never reviewed: the dot and the words are on the Review entry.
    const reviewItem = document.querySelector('[data-menu-label="Review"]')!
    expect(reviewItem.textContent).toContain('Review due')
    expect(reviewItem.querySelector('[data-menu-marker] [data-dot]')).not.toBeNull()
    await click(document.querySelector<HTMLElement>('[data-menu-label="Someday"]')!)
    await waitFor(() => window.location.pathname === '/someday')
    expect(document.querySelector('[role="menu"]')).toBeNull()
    // While a More destination is open, the More heading is marked as the current place.
    await r.rerender(<Sidebar route={{ view: 'someday' }} user={user} />)
    expect(moreButton(r.container).getAttribute('aria-current')).toBe('true')
    await r.unmount()
  })

  it('puts Search beside the name; the footer is one row with the account menu, the bell, the sync dot and collapse', async () => {
    const r = await render(<Sidebar route={{ view: 'help' }} user={user} onSearch={() => {}} onShortcuts={() => {}} onToggleCollapse={() => {}} />)
    await flush(50)
    const search = r.container.querySelector('[data-palette-button]')!
    expect(search.getAttribute('aria-label')).toBe('Search and commands')
    expect(search.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K')
    expect(r.container.querySelector('[data-sidebar-footer]')!.contains(search)).toBe(false)
    const row = r.container.querySelector('[data-sidebar-footer] [data-footer-icons]')!
    const names = [...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(expect.arrayContaining(['Notifications']))
    // The toggle moved to the page header (precision-shell D2); the footer keeps it only on the collapsed rail.
    expect(names).not.toContain('Collapse sidebar')
    // Help and Keyboard shortcuts are in the account menu now; the account control is current on Help.
    expect(row.querySelector('[data-help-button]')).toBeNull()
    expect(row.querySelector('[data-account-menu]')?.getAttribute('aria-current')).toBe('page')
    await r.unmount()
  })

  it('on a phone the footer is the same one row (no full-width Help row), and the rail keeps Search in its footer', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} />)
      await flush(50)
      expect(r.container.querySelector('[data-sidebar-footer] [data-help-button]')).toBeNull()
      expect(r.container.querySelectorAll('[data-sidebar-footer] [data-footer-icons]')).toHaveLength(1)
      expect(r.container.querySelector('[data-sidebar-footer] [data-account-menu]')).not.toBeNull()
      await r.unmount()
    } finally { window.matchMedia = original }
    const rail = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} collapsed onToggleCollapse={() => {}} />)
    await flush(50)
    expect(rail.container.querySelector('[data-sidebar-footer] [data-palette-button]')).not.toBeNull()
    expect(rail.container.querySelector('[data-account-menu]')?.getAttribute('aria-label')).toBe('Account menu for Ada')
    await rail.unmount()
  })

  it('shows no Filters or Labels group while there is nothing in it, and brings each back with its first item', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    const groups = () => [...r.container.querySelectorAll('[data-sidebar-group]')].map((g) => g.getAttribute('data-sidebar-group'))
    expect(groups()).toEqual(['Projects'])
    expect(r.container.textContent).not.toContain('Save a filter')
    expect(r.container.textContent).not.toContain('No labels yet')
    await createView({ name: 'Errands', query: 'today', pinned: false })
    await waitFor(() => groups().includes('Filters'))
    await createLabel({ name: 'errand' })
    await waitFor(() => groups().includes('Labels'))
    // The order is Projects, Labels, Filters (sidebar-favourites D5); an unpinned filter adds no Favourites group.
    expect(groups()).toEqual(['Projects', 'Labels', 'Filters'])
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

describe('children read as children (ux-feedback-2 D6)', () => {
  it('16 px per level, guide lines beside every descendant (decoration only), 6 px after an expanded root, the path as a tooltip', async () => {
    const work = await createProject({ name: 'Work' })
    const client = await createProject({ name: 'Client A', parent_id: work })
    const q4 = await createProject({ name: 'Q4 launch', parent_id: client })
    const hiring = await createProject({ name: 'Hiring', parent_id: work })
    const home = await createProject({ name: 'Home' })
    await setCollapsedProjects(new Set())
    const r = await render(<aside data-sidebar><Sidebar route={{ view: 'inbox' }} user={user} /></aside>)
    await waitFor(() => !!r.container.querySelector(`[data-project-row="${q4}"]`))
    const rowOf = (id: string) => r.container.querySelector<HTMLElement>(`[data-project-row="${id}"]`)!
    expect([work, client, q4, hiring, home].map((id) => rowOf(id).style.paddingLeft)).toEqual(['0rem', '1rem', '2rem', '1rem', '0rem'])
    expect([work, client, q4, hiring, home].map((id) => rowOf(id).querySelectorAll('[data-guide-line]').length)).toEqual([0, 1, 2, 1, 0])
    for (const line of r.container.querySelectorAll('[data-guide-line]')) expect(line.getAttribute('aria-hidden')).toBe('true')
    // Hiring ends Work's subtree: 6 px before Home; other rows are 2 px apart.
    expect(rowOf(hiring).className).toContain('mb-1.5')
    expect(rowOf(client).className).toContain('mb-0.5')
    expect(r.container.querySelector(`[data-project-id="${q4}"]`)!.getAttribute('title')).toBe('Work › Client A › Q4 launch')
    expect(r.container.querySelector(`[data-project-id="${work}"]`)!.hasAttribute('title')).toBe(false)
    await r.unmount()
  })

  it('Guide lines stop at the capped indentation on a deep tree', async () => {
    let parent: string | null = null
    const ids: string[] = []
    for (const name of ['L0', 'L1', 'L2', 'L3', 'L4']) { parent = await createProject({ name, parent_id: parent }); ids.push(parent) }
    await setCollapsedProjects(new Set())
    const r = await render(<aside data-sidebar><Sidebar route={{ view: 'inbox' }} user={user} /></aside>)
    await waitFor(() => !!r.container.querySelector(`[data-project-row="${ids[4]}"]`))
    const deepest = r.container.querySelector<HTMLElement>(`[data-project-row="${ids[4]}"]`)!
    expect(deepest.querySelectorAll('[data-guide-line]').length).toBe(3)
    expect(deepest.style.paddingLeft).toBe('3rem')
    expect(r.container.querySelector(`[data-project-id="${ids[4]}"]`)!.getAttribute('title')).toBe('L0 › L1 › L2 › L3 › L4')
    await r.unmount()
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
    openGroups('filters')
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
    openGroups('labels')
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
    openGroups('labels', 'filters')
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
    openGroups('labels')
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

describe('favourites (sidebar-favourites 2.2, 2.3, 3.2)', () => {
  const favRows = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-favourite-row]')].map((row) => {
    const name = row.querySelector('[data-sidebar-item] .truncate')?.textContent ?? ''
    const n = row.querySelector('[data-sidebar-item] [data-count]')?.textContent
    return n ? `${name} ${n}` : name
  })
  const groups = (root: ParentNode) => [...root.querySelectorAll('[data-sidebar-group]')].map((g) => g.getAttribute('data-sidebar-group'))

  it('Mixed kinds in order: each with its own count, Move up from the menu, and each row opens its view', async () => {
    const { pin } = await import('../lib/favourites')
    const site = await createProject({ name: 'Website launch' })
    const design = await createProject({ name: 'Design', parent_id: site })
    for (let i = 0; i < 4; i++) await createTask({ title: `Site ${i}`, project_id: site, priority: 1 })
    await createTask({ title: 'Mock-ups', project_id: design })
    const errand = await createLabel({ name: 'errand' })
    for (let i = 0; i < 3; i++) await createTask({ title: `Errand ${i}`, labels: [errand] })
    const deep = await createView({ name: 'Deep work', query: 'p1', pinned: false })
    await pin('project', site)
    await pin('view', deep)
    await pin('label', errand)
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => favRows(r.container).length === 3)
    // The Website launch count is its whole subtree's (5), whatever the tree's fold state.
    await waitFor(() => favRows(r.container).join('|') === 'Website launch 5|Deep work 4|errand 3')
    expect(groups(r.container)).toEqual(['Favourites', 'Projects', 'Labels', 'Filters'])
    // Move "Deep work" to the top from its menu in the Favourites group.
    const deepRow = r.container.querySelector(`[data-favourite-row="view:${deep}"]`)!
    await click(deepRow.querySelector('button[aria-label="Menu for view Deep work"]')!)
    await waitFor(() => !!menuItem('Move up'))
    await click(menuItem('Move up'))
    await waitFor(() => favRows(r.container).join('|') === 'Deep work 4|Website launch 5|errand 3')
    // Its position among the saved filters is unchanged: only the preference was written.
    expect((await db.outbox.toArray()).filter((o) => o.entity === 'view' && o.field === 'position')).toHaveLength(1)
    await click(r.container.querySelector(`[data-favourite="label:${errand}"]`)!)
    expect(location.pathname).toBe(`/label/${errand}`)
    await click(r.container.querySelector(`[data-favourite="view:${deep}"]`)!)
    expect(location.pathname).toBe(`/view/${deep}`)
    await click(r.container.querySelector(`[data-favourite="project:${site}"]`)!)
    expect(location.pathname).toBe(`/project/${site}`)
    // Alt+↓ moves a row by keyboard and keeps the focus on it.
    const row = r.container.querySelector<HTMLElement>(`[data-favourite="view:${deep}"]`)!
    row.focus()
    await key(row, 'ArrowDown', { altKey: true })
    await waitFor(() => favRows(r.container)[1] === 'Deep work 4')
    await waitFor(() => document.activeElement?.getAttribute('data-favourite') === `view:${deep}`)
    await r.unmount()
  })

  it('Pinned item removed: an archive on another device takes it out without a reload, a restore brings it back', async () => {
    const { pin } = await import('../lib/favourites')
    const garden = await createProject({ name: 'Garden' })
    await pin('project', garden)
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => favRows(r.container).includes('Garden'))
    const ts = Date.now() + 10_000
    await applyOps([{ id: 'x1', entity: 'project', entityId: garden, field: 'archived', value: true, ts, device: '~other' } as unknown as Op])
    await waitFor(() => r.container.querySelector('[data-sidebar-group="Favourites"]') === null)
    await applyOps([{ id: 'x2', entity: 'project', entityId: garden, field: 'archived', value: false, ts: ts + 1, device: '~other' } as unknown as Op])
    await waitFor(() => favRows(r.container).includes('Garden'))
    await r.unmount()
  })

  it('Pinned offline: a pinned label shows at once, is queued for sync and survives a reload', async () => {
    const errand = await createLabel({ name: 'errand' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector('[data-sidebar-group="Labels"]') !== null)
    // Labels is folded on this new device: open it, then pin from the row's menu.
    await click(headingOf(r.container, 'Labels'))
    await waitFor(() => r.container.querySelector('[data-label-row]') !== null)
    await db.outbox.clear()
    await click(r.container.querySelector('[data-label-row] button[aria-label="Menu for label errand"]')!)
    await waitFor(() => !!document.querySelector('[role="menuitemcheckbox"]'))
    await click([...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find((el) => el.textContent?.includes('Pin to sidebar'))!)
    await waitFor(() => favRows(r.container).includes('errand'))
    expect((await db.outbox.toArray()).map((o) => `${o.entity}.${o.field}`)).toEqual(['user_prefs.favourites'])
    await r.unmount()
    const again = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => favRows(again.container).includes('errand'))
    expect(again.container.querySelector(`[data-favourite="label:${errand}"]`)).not.toBeNull()
    await again.unmount()
  })

  it('a new device folds Labels and Filters, a stored state wins, and Filters lists an unpinned filter', async () => {
    await createProject({ name: 'Home' })
    await createLabel({ name: 'errand' })
    await createView({ name: 'Later', query: 'p4', pinned: false })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector('[data-sidebar-group="Filters"]') !== null)
    expect(headingOf(r.container, 'Labels').getAttribute('aria-expanded')).toBe('false')
    expect(headingOf(r.container, 'Filters').getAttribute('aria-expanded')).toBe('false')
    expect(headingOf(r.container, 'Projects').getAttribute('aria-expanded')).toBe('true')
    expect(groupOf(r.container, 'Filters').querySelector('[data-group-count]')?.textContent).toBe('1')
    expect(r.container.querySelector('[data-sidebar-group="Favourites"]')).toBeNull()
    await r.unmount()
    openGroups('filters')
    const again = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => again.container.querySelector('[data-view-id]') !== null)
    expect(again.container.querySelector('[data-view-id] .truncate')?.textContent).toBe('Later')
    expect(headingOf(again.container, 'Labels').getAttribute('aria-expanded')).toBe('false')
    await again.unmount()
  })

  it('the Projects header has an All action that opens the All projects page', async () => {
    await createProject({ name: 'Home' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector('[data-project-id]') !== null)
    await click(groupOf(r.container, 'Projects').querySelector('button[aria-label="All projects"]')!)
    expect(location.pathname).toBe('/projects')
    await r.unmount()
  })
})

describe('quiet sidebar (quiet-sidebar 1.2-1.4, 2.1)', () => {
  const DAY = 86_400_000
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  /** The numbers a sighted person sees at rest: visible counts, not quiet or hidden ones. */
  const visibleNumbers = (root: Element) => [...root.querySelectorAll<HTMLElement>('[data-count], [data-group-count], [data-label-row] [data-open-count]')]
    .filter((el) => !el.closest('.sr-only') && !el.classList.contains('ui-reveal'))
    .map((el) => `${el.closest('[data-destination]')?.getAttribute('data-destination') ?? el.closest('[data-sidebar-group]')?.getAttribute('data-sidebar-group')}:${el.textContent}`)
  async function seedAccount() {
    const site = await createProject({ name: 'Website launch' })
    for (let i = 0; i < 5; i++) await createTask({ title: `Site ${i}`, project_id: site })
    for (let i = 0; i < 3; i++) await createTask({ title: `Inbox ${i}` })
    for (let i = 0; i < 2; i++) await createTask({ title: `Today ${i}`, project_id: site, due: { date: localDate() } })
    const errand = await createLabel({ name: 'errand' })
    await createLabel({ name: 'home' })
    await createLabel({ name: 'calls' })
    for (let i = 0; i < 3; i++) await createTask({ title: `Errand ${i}`, labels: [errand] })
    await createView({ name: 'Waiting', query: '@errand', pinned: false })
    await createView({ name: 'Work tomorrow', query: 'p4', pinned: false })
    return { site, errand }
  }

  it('Default sidebar and only two numbers at rest: Inbox and Today, plus the folded Labels and Filters headers', async () => {
    const { site } = await seedAccount()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector('[data-destination="today"] [data-count]')?.textContent === '2')
    await waitFor(() => r.container.querySelector(`[data-project-id="${site}"] [data-count]`)?.textContent === '7')
    expect(headingOf(r.container, 'Projects').getAttribute('aria-expanded')).toBe('true')
    expect(headingOf(r.container, 'Labels').getAttribute('aria-expanded')).toBe('false')
    expect(headingOf(r.container, 'Filters').getAttribute('aria-expanded')).toBe('false')
    expect(r.container.querySelector('[data-sidebar-group="Favourites"]')).toBeNull()
    expect(visibleNumbers(r.container)).toEqual(['inbox:6', 'today:2', 'Labels:3', 'Filters:2'])
    expect(r.container.querySelector('[data-destination="upcoming"] [data-count]')).toBeNull()
    // Inbox carries its count in its name too.
    expect(spokenText(r.container.querySelector('[data-destination="inbox"]')!)).toBe('Inbox, 6 open tasks')
    await r.unmount()
  })

  it('Count on hover: a project count is quiet until hover or focus, and always in the name; nothing visible at rest', async () => {
    const { site } = await seedAccount()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector(`[data-project-id="${site}"] [data-count]`)?.textContent === '7')
    const row = r.container.querySelector(`[data-project-id="${site}"]`)!
    expect(row.querySelector('[data-count]')!.classList.contains('ui-reveal')).toBe(true)
    expect(row.querySelector('[data-open-count]')!.getAttribute('data-open-count')).toBe('7')
    expect(spokenText(row)).toBe('Website launch, 7 open tasks')
    // Focus does not change what is read; the reveal is styling only (no re-render, no layout change).
    ;(row as HTMLElement).focus()
    await flush(20)
    expect(spokenText(row)).toBe('Website launch, 7 open tasks')
    await r.unmount()
  })

  it('Rolled-up count when collapsed: the description names the sub-projects', async () => {
    const home = await createProject({ name: 'Home' })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    for (let i = 0; i < 2; i++) await createTask({ title: `H${i}`, project_id: home })
    for (let i = 0; i < 3; i++) await createTask({ title: `G${i}`, project_id: garden })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector(`[data-project-id="${home}"] [data-open-count]`)?.getAttribute('data-open-count') === '5')
    const row = r.container.querySelector(`[data-project-id="${home}"]`)!
    expect(row.getAttribute('aria-description')).toBe('Open tasks including sub-projects')
    expect(spokenText(row)).toBe('Home, 5 open tasks')
    await r.unmount()
  })

  it('Touch screen: every project shows its count at all times', async () => {
    touchScreen()
    const { site } = await seedAccount()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector(`[data-project-id="${site}"] [data-count]`)?.textContent === '7')
    expect(r.container.querySelector(`[data-project-id="${site}"] [data-count]`)!.classList.contains('ui-reveal')).toBe(false)
    await r.unmount()
  })

  it('filter and label rows show no number; their names carry it; a broken query keeps its error mark', async () => {
    const { errand } = await seedAccount()
    await applyOps([{ id: 'bad', entity: 'view', entityId: (await db.views.toArray()).find((v) => v.name === 'Work tomorrow')!.id, field: 'query', value: '((', ts: Date.now() + 1000, device: 'laptop' } as Op])
    openGroups('labels', 'filters')
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    const waiting = () => [...r.container.querySelectorAll('[data-view-id]')].find((b) => b.textContent?.startsWith('Waiting'))
    await waitFor(() => !!waiting()?.querySelector('[data-open-count="3"]'))
    expect(visibleText(waiting()!)).toBe('Waiting')
    expect(spokenText(waiting()!)).toBe('Waiting, 3 open tasks')
    const label = r.container.querySelector(`[data-label-row="${errand}"] [data-label-open]`)!
    await waitFor(() => !!label.querySelector('[data-open-count="3"]'))
    expect(visibleText(label)).toBe('errand')
    expect(spokenText(label)).toBe('errand, 3 open tasks')
    const broken = [...r.container.querySelectorAll('[data-view-id]')].find((b) => b.textContent?.startsWith('Work tomorrow'))!
    expect(visibleText(broken)).toBe('Work tomorrow!')
    expect(broken.querySelector('[data-open-count]')).toBeNull()
    expect(visibleNumbers(r.container).filter((n) => n.startsWith('Labels') || n.startsWith('Filters'))).toEqual([])
    await r.unmount()
  })

  it('No empty groups: a first saved filter brings Filters back closed, with "Filters 1" on its header', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    expect(r.container.querySelector('[data-sidebar-group="Filters"]')).toBeNull()
    await createView({ name: 'Errands', query: 'today', pinned: false })
    await waitFor(() => r.container.querySelector('[data-sidebar-group="Filters"]') !== null)
    expect(headingOf(r.container, 'Filters').getAttribute('aria-expanded')).toBe('false')
    expect(groupOf(r.container, 'Filters').querySelector('[data-group-count]')?.textContent).toBe('1')
    expect(groupOf(r.container, 'Filters').querySelector('button[aria-label="All filters"]')).not.toBeNull()
    await r.unmount()
  })

  it('Favourites first: a pinned project counts on hover, a pinned label and filter show no number', async () => {
    const { pin } = await import('../lib/favourites')
    const { site, errand } = await seedAccount()
    const view = (await db.views.toArray()).find((v) => v.name === 'Waiting')!.id
    await pin('project', site)
    await pin('label', errand)
    await pin('view', view)
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelectorAll('[data-favourite-row] [data-open-count]').length === 3)
    const fav = (k: string) => r.container.querySelector(`[data-favourite="${k}"]`)!
    expect(fav(`project:${site}`).querySelector('[data-count]')!.classList.contains('ui-reveal')).toBe(true)
    expect(visibleText(fav(`label:${errand}`))).toBe('errand')
    expect(visibleText(fav(`view:${view}`))).toBe('Waiting')
    expect(spokenText(fav(`label:${errand}`))).toBe('errand, 3 open tasks')
    await r.unmount()
  })

  it('Touch keeps its targets: inline More, counts without hover, one footer row of touch-size controls', async () => {
    touchScreen()
    const { site } = await seedAccount()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onAssistant={() => {}} />)
    await waitFor(() => r.container.querySelector(`[data-project-id="${site}"] [data-count]`)?.textContent === '7')
    expect(r.container.querySelector('[data-testid="sidebar-more"]')).not.toBeNull()
    expect(r.container.querySelector(`[data-project-id="${site}"] [data-count]`)!.classList.contains('ui-reveal')).toBe(false)
    const row = r.container.querySelectorAll('[data-sidebar-footer] [data-footer-icons]')
    expect(row).toHaveLength(1)
    for (const b of [row[0].querySelector('[data-account-menu]')!, row[0].querySelector('[data-assistant-launcher]')!, row[0].querySelector('[data-notifications]')!]) {
      expect(b.className).toContain('touch-target')
    }
    await r.unmount()
  })

  describe('rhythm markers as one dot', () => {
    const moreButton = (root: ParentNode) => root.querySelector<HTMLButtonElement>('[data-sidebar-more-menu] button[aria-haspopup="menu"]')!

    // sidebar-v2 D7: More carries no marker; the dot and its words are on the Review entry.
    const reviewItem = () => document.querySelector('[data-menu-label="Review"]')
    it('Review due: no dot on More; one dot on the Review entry, the words in its description', async () => {
      await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: Date.now() - 9 * DAY, _clock: {} })
      const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
      await flush(100)
      const trigger = moreButton(r.container)
      expect(visibleText(trigger)).toBe('More')
      expect(spokenText(trigger)).toBe('More')
      expect(trigger.querySelector('[data-dot]')).toBeNull()
      await click(trigger)
      await waitFor(() => !!reviewItem()?.textContent?.includes('Review due · last weekly review 9 days ago'))
      expect(reviewItem()!.querySelectorAll('[data-dot]')).toHaveLength(1)
      expect(reviewItem()!.innerHTML).not.toContain('data-hue')
      await r.unmount()
    })

    it('Due in Companion: the Review entry names the Monthly look too, and a finish on another device removes its dot', async () => {
      await setMethodMode('companion')
      await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: Date.now() - 9 * DAY, monthly_at: Date.now() - 40 * DAY, _clock: {} })
      const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
      await flush(50)
      await click(moreButton(r.container))
      await waitFor(() => !!reviewItem()?.textContent?.includes('Review due · last weekly review 9 days ago; the Monthly look is due'))
      expect(reviewItem()!.querySelector('[data-review-due]')).not.toBeNull()
      expect(moreButton(r.container).querySelector('[data-dot]')).toBeNull()
      await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: Date.now(), monthly_at: Date.now(), _clock: {} })
      await waitFor(() => !reviewItem()?.querySelector('[data-review-due]'))
      await r.unmount()
    })

    it('Lists only: no marker; the Review item in the More menu reads "Last review yesterday"', async () => {
      await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: Date.now() - DAY, _clock: {} })
      const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
      await flush(50)
      await click(moreButton(r.container))
      await waitFor(() => !!document.querySelector('[data-menu-label="Review"]'))
      expect(document.querySelector('[data-menu-label="Review"]')!.textContent).toContain('Last review yesterday')
      await r.unmount()
    })

    it('Open Loops first in the morning: the primary Review entry carries one dot naming the Daily check', async () => {
      await setMethodMode('first')
      await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: Date.now() - DAY, monthly_at: Date.now() - DAY, _clock: {} })
      const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
      const entry = () => r.container.querySelector('nav[data-sidebar-primary] [data-destination="review"]')
      await waitFor(() => !!entry()?.querySelector('[data-review-due]'))
      expect(entry()!.querySelectorAll('[data-dot]')).toHaveLength(1)
      expect(spokenText(entry()!)).toBe('Review, Review due · the Daily check is due')
      await r.unmount()
    })
  })
})

// sidebar-v2 D1, D8: the header row is the brand slot; the column takes the tinted sidebar colour.
describe('the brand header and the sidebar colour', () => {
  it('Header: the mono mark and the wordmark, no image, search beside them, one row of at most 40 px', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} />)
    await flush(50)
    const header = r.container.querySelector('[data-sidebar-header]')!
    expect(header.querySelector('[data-brand-mark="mono"]')).not.toBeNull()
    expect(header.querySelector('[data-brand-wordmark]')!.textContent).toBe('OpenTodo')
    expect(r.container.querySelector('img')).toBeNull()
    expect(header.querySelector('[data-palette-button]')).not.toBeNull()
    // 32 px with a fine pointer (min-h-8), never wrapping: one flex row.
    expect(header.className).toContain('pointer-fine:min-h-8')
    expect(header.className).not.toContain('flex-wrap')
    await r.unmount()
  })

  it('Rail: the mark alone, named OpenTodo', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} collapsed />)
    await flush(50)
    const header = r.container.querySelector('[data-sidebar-header]')!
    expect(header.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('OpenTodo')
    expect(header.querySelector('[data-brand-wordmark]')).toBeNull()
    await r.unmount()
  })

  it('Tinted column: the sidebar colour from 768 px with a fine pointer, the surface in the drawer; group headers share it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    await createProject({ name: 'Home' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    const aside = document.querySelector('aside[data-sidebar]')!
    expect(aside.className).toContain('md:pointer-fine:[--sidebar-bg:var(--color-sidebar)]')
    expect(aside.className).toContain('[--sidebar-bg:var(--color-surface)]')
    expect(aside.className).toContain('bg-(--sidebar-bg)')
    expect(aside.className).not.toMatch(/(^|\s)bg-canvas(\s|$)/)
    // The groups appear once the rows and the collapse state are read (motion-polish D2).
    await waitFor(() => !!document.querySelector('[data-sidebar-group-header]'), 5000)
    const header = document.querySelector('[data-sidebar-group-header]')!
    expect(header.className).toContain('bg-(--sidebar-bg,var(--color-canvas))')
    await r.unmount()
  })
})

// sidebar-v2 task 1.5: screens draw the mark from the SVG source, never the favicon file.
describe('no screen references favicon.svg', () => {
  it('every app source is free of it', () => {
    const sources = import.meta.glob<string>(['./**/*.tsx', './**/*.ts', '!./**/*.test.ts', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })
    expect(Object.entries(sources).filter(([, src]) => src.includes('favicon.svg')).map(([p]) => p)).toEqual([])
  })
})

describe('the start guide entry (moments-and-onboarding 3.3)', () => {
  const guideDone = () => applyOps([{ id: 'fr', entity: 'user_prefs', entityId: 'me', field: 'first_run', value: 'done', ts: 1, device: 'x' }])
  const entry = () => document.querySelector<HTMLElement>('[data-start-guide-entry]')

  it('lists "Start guide · n of 3 done" last in More, Hide writes the preference, and a second device does not show it after sync', async () => {
    touchScreen()
    await guideDone()
    await createTask({ title: 'Call the dentist' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await click(moreToggle(r.container))
    await waitFor(() => !!entry())
    expect(entry()!.textContent).toBe('Start guide · 1 of 3 done')
    // After the other secondary destinations; never a primary one.
    expect(moreOf(r.container).lastElementChild!.contains(entry())).toBe(true)
    expect(primaryOf(r.container)).toEqual(['inbox', 'today', 'upcoming', 'day'])
    await click(document.querySelector<HTMLElement>('[data-start-guide-menu]')!)
    await waitFor(() => !!document.querySelector('[role="menu"] [data-start-guide-hide]'))
    await click(document.querySelector<HTMLElement>('[role="menu"] [data-start-guide-hide]')!)
    await waitFor(() => !entry())
    const ops = (await db.outbox.toArray()).filter((o) => o.field === 'start_checklist')
    expect(ops.map((o) => o.value)).toEqual(['hidden'])
    await r.unmount()

    // A second device: the same preference arrives by sync.
    await db.delete()
    await db.open()
    resetDeviceId()
    await guideDone()
    await createTask({ title: 'On the phone' })
    await applyOps(ops.map(({ local: _local, ...op }) => op))
    const r2 = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await click(moreToggle(r2.container))
    await flush(150)
    expect(entry()).toBeNull()
    await r2.unmount()
  })

  it('in the desktop More menu: the entry with its count, then Hide; absent before the guide is finished', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    const more = () => r.container.querySelector<HTMLButtonElement>('[data-sidebar-more-menu] button[aria-haspopup="menu"]')!
    await flush(100)
    await click(more())
    await waitFor(() => !!document.querySelector('[role="menu"]'))
    expect(entry()).toBeNull()
    await key(document.querySelector('[role="menu"]')!, 'Escape')
    await guideDone()
    await click(more())
    await waitFor(() => !!entry())
    expect(entry()!.textContent).toContain('0 of 3 done')
    expect(document.querySelector('[role="menu"] [data-start-guide-hide]')).not.toBeNull()
    await r.unmount()
  })

  it('never on a demo instance', async () => {
    const { setDemo } = await import('../lib/demo')
    touchScreen()
    setDemo({ token: '', sandboxHours: { idle: 2, max: 24 }, resetsAt: 0 })
    await guideDone()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await click(moreToggle(r.container))
    await flush(150)
    expect(entry()).toBeNull()
    setDemo(null)
    await r.unmount()
  })
})
