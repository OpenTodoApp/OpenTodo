// @vitest-environment happy-dom
// The task lists in the phone UI (OpenSpec change phone-lists): every list is the
// phone list with the rows, groups and order of the list it replaces; a board keeps
// its screen; subtasks sit under their task and fold; selection ticks rows and acts
// on them; the row's menu and the page's menu are the list's own.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { addDaysISO, logicalToday } from '../lib/dates'
import { createLabel } from '../lib/labels'
import { createPlace, locationFromPlace, getPlace } from '../lib/locations'
import { createProject, createSubtask, createTask, resetDeviceId, setTaskCompleted } from '../lib/ops'
import { createSection, saveViewMode } from '../lib/sections'
import type { User } from '../lib/types'
import { click, minWidthPx, render, type, waitFor } from '../ui/test-utils'
import { resetPanel } from '../app/panel'
import { navigate, type Route } from '../app/router'
import { Shell } from '../app/Shell'
import { resetTaskTrail } from '../app/taskTrail'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia
const today = logicalToday()
let width = 390

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  resetTaskTrail()
  width = 390
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width') ? minWidthPx(q) <= width : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals() })

const list = () => document.querySelector<HTMLElement>('[data-phone-list]')
const rowIds = () => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].map((el) => el.dataset.taskId!)
const row = (id: string) => document.querySelector<HTMLElement>(`[data-phone-row="${id}"]`)!
const headings = () => [...document.querySelectorAll('[data-group-label]')].map((h) => h.textContent)

async function seed() {
  const work = await createProject({ name: 'Work' })
  const errand = await createLabel({ name: 'errand' })
  const backlog = await createSection(work, 'Backlog')
  const late = await createTask({ title: 'Send the invoice', due: { date: addDaysISO(today, -2) }, project_id: work, priority: 1 })
  const now = await createTask({ title: 'Write the notes', due: { date: today, time: '09:30' }, labels: [errand] })
  const soon = await createTask({ title: 'Renew the passport', due: { date: addDaysISO(today, 1) }, labels: [errand] })
  const loose = await createTask({ title: 'An idea' })
  const parent = await createTask({ title: 'Plan the launch', project_id: work, section_id: backlog })
  const child = await createSubtask(parent, 'Book the room')
  const done = await createTask({ title: 'Old thing', project_id: work })
  await setTaskCompleted(done, true)
  return { work, errand, backlog, late, now, soon, loose, parent, child, done }
}

type Seeded = Awaited<ReturnType<typeof seed>>
const ROUTES: [string, (s: Seeded) => Route][] = [
  ['the Inbox', () => ({ view: 'inbox' })],
  ['Today', () => ({ view: 'today' })],
  ['Upcoming', () => ({ view: 'upcoming' })],
  ['Anytime', () => ({ view: 'anytime' })],
  ['Someday', () => ({ view: 'someday' })],
  ['Assigned to me', () => ({ view: 'assigned' })],
  ['Completed', () => ({ view: 'completed' })],
  ['a label', (s) => ({ view: 'label', id: s.errand })],
  ['a project', (s) => ({ view: 'project', id: s.work })],
]

describe('every task list is a phone screen', () => {
  for (const [name, route] of ROUTES) {
    it(`${name} shows the rows, groups and order of the same list at 1280 px`, async () => {
      const s = await seed()
      navigate(route(s))
      width = 1280
      const wide = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => !!document.querySelector('[data-list-page]'), 'the desktop list')
      // The desktop list settles on its rows; an empty list has none.
      await waitFor(async () => { const a = rowIds().join(); await new Promise((ok) => requestAnimationFrame(() => ok(null))); return a === rowIds().join() }, 'the desktop list at rest')
      const before = { ids: rowIds(), headings: headings() }
      await wide.unmount()
      width = 390
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => !!list() && rowIds().join() === before.ids.join(), 'the phone list with the same rows')
      expect(list()!.getAttribute('data-phone-list')).toBe(route(s).view)
      expect(headings()).toEqual(before.headings)
      // It draws its own bar, and no desktop row or add line at the top.
      expect(document.querySelector('[data-phone-bar]')).toBeNull()
      expect(document.querySelector('[data-drag-id="task-row"]')).toBeNull()
      expect(document.querySelector('[data-quick-add-row]')).toBeNull()
      await r.unmount()
    })
  }

  it('a project in the Board layout keeps its present screen', async () => {
    const s = await seed()
    await saveViewMode(s.work, 'board')
    navigate({ view: 'project', id: s.work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-list-page]'), 'the board')
    expect(list()).toBeNull()
    await r.unmount()
  })
})

describe('rows of the phone list', () => {
  it('a subtask sits under its task, indented, and the fold hides and shows it', async () => {
    const s = await seed()
    navigate({ view: 'project', id: s.work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(s.child), 'the subtask')
    expect(rowIds().indexOf(s.child)).toBe(rowIds().indexOf(s.parent) + 1)
    expect(row(s.child).getAttribute('data-depth')).toBe('1')
    const fold = row(s.parent).querySelector<HTMLElement>('[data-phone-fold-row]')!
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    await click(fold)
    await waitFor(() => !document.querySelector(`[data-phone-row="${s.child}"]`), 'the subtask hidden')
    await click(row(s.parent).querySelector('[data-phone-fold-row]')!)
    await waitFor(() => !!document.querySelector(`[data-phone-row="${s.child}"]`), 'the subtask shown again')
    await r.unmount()
  })

  it('leaves the project out of a row inside its own project, and names it elsewhere', async () => {
    const s = await seed()
    navigate({ view: 'project', id: s.work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(s.late), 'the project list')
    expect(row(s.late).querySelector('[data-fact="project"]')).toBeNull()
    navigate({ view: 'today' })
    await waitFor(() => list()?.getAttribute('data-phone-list') === 'today' && !!row(s.late), 'Today')
    expect(row(s.late).querySelector('[data-fact="project"]')!.textContent).toBe('Work')
    await r.unmount()
  })

  it('completing the last open subtask offers the parent', async () => {
    const s = await seed()
    navigate({ view: 'project', id: s.work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(s.child), 'the subtask')
    await click(row(s.child).querySelector('[data-phone-check]')!)
    await waitFor(() => [...document.querySelectorAll('[role="status"]')].some((el) => /All subtasks done/.test(el.textContent ?? '') && /Plan the launch/.test(el.textContent ?? '')), 'the offer to complete the parent')
    expect((await db.tasks.get(s.child))?.completed_at).toBeTruthy()
    await r.unmount()
  })
})

describe('selecting in the phone list', () => {
  it('Select tasks turns the checks into tick boxes, a tap ticks, and Close ends it', async () => {
    const s = await seed()
    navigate({ view: 'project', id: s.work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(s.late), 'the project list')
    const menu = [...list()!.querySelectorAll<HTMLElement>('[data-phone-header] button')].at(-1)!
    await click(menu)
    const item = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes('Select tasks'))
    await waitFor(() => !!item(), 'Select tasks in the menu')
    await click(item()!)
    await waitFor(() => !!row(s.late).querySelector('[data-phone-tick]'), 'tick boxes')
    expect(row(s.late).querySelector('[data-phone-check]')).toBeNull()
    await click(row(s.late).querySelector('[data-phone-open]')!)
    await click(row(s.parent).querySelector('[data-phone-tick]')!)
    await waitFor(() => document.querySelectorAll('[data-ticked]').length === 2, 'two rows ticked')
    // A tap ticked the row; it did not open the task.
    expect(document.querySelector('[data-phone-screen="task"]')).toBeNull()
    const close = () => [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === 'Close')
    await waitFor(() => !!close(), 'the selection bar')
    await click(close()!)
    await waitFor(() => !row(s.late).querySelector('[data-phone-tick]') && document.querySelectorAll('[data-ticked]').length === 0, 'the checks again')
    await r.unmount()
  })
})

describe('what a list keeps', () => {
  it('a place lists its tasks in the phone list', async () => {
    const place = await createPlace({ name: 'Post office' })
    const there = await createTask({ title: 'Buy stamps', location: locationFromPlace((await getPlace(place))!) })
    navigate({ view: 'place', id: place })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => list()?.getAttribute('data-phone-list') === 'place' && rowIds().includes(there), 'the place\'s list')
    await r.unmount()
  })

  it('a task added elsewhere appears without a reload, and a completed one leaves', async () => {
    const s = await seed()
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => rowIds().includes(s.loose), 'the Inbox')
    const added = await createTask({ title: 'Another thought' })
    await waitFor(() => rowIds().includes(added), 'the new task')
    await setTaskCompleted(s.loose, true)
    await waitFor(() => !rowIds().includes(s.loose), 'the completed task gone')
    await r.unmount()
  })

  it('an empty list shows its empty state', async () => {
    navigate({ view: 'someday' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!list()?.querySelector('[data-empty-view]'), 'the empty state')
    expect(rowIds()).toEqual([])
    await r.unmount()
  })
})

describe('the row\'s menu in the phone list', () => {
  const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const item = (text: string) => menuItems().find((el) => el.textContent?.includes(text))
  // The row's Edit (row-edit-action): the item whose label is that word alone, before its key hint.
  const editItem = () => menuItems().find((el) => /^Edit(?![a-z ])/.test(el.textContent?.trim() ?? ''))
  const openMenu = (id: string) => row(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 200 }))

  it('opens the list\'s own row menu, with Edit, Add subtask and Reorder', async () => {
    const s = await seed()
    // A second task beside it: a task alone among its siblings has nowhere to move.
    await createTask({ title: 'File the receipts', project_id: s.work })
    navigate({ view: 'project', id: s.work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(s.late), 'the project list')
    openMenu(s.late)
    await waitFor(() => !!editItem() && !!item('Add subtask') && !!item('Reorder'), 'the row menu')
    await r.unmount()
  })

  it('Edit opens the field in the row', async () => {
    const s = await seed()
    navigate({ view: 'project', id: s.work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(s.late), 'the project list')
    openMenu(s.late)
    await waitFor(() => !!editItem(), 'the row menu')
    await click(editItem()!)
    await waitFor(() => !!row(s.late).querySelector('[data-phone-inline] textarea, [data-phone-inline] input, [data-phone-inline] [contenteditable]'), 'the title field in the row')
    await r.unmount()
  })
})

describe('the page menu of the phone list', () => {
  const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')].map((el) => el.textContent?.trim() ?? '').filter(Boolean).sort()
  /** Opens the last menu of a bar (the page's own menu) and returns its items; closes it again. */
  async function menuOf(bar: () => Element | null | undefined): Promise<string[]> {
    await waitFor(() => !!bar()?.querySelector('button[aria-haspopup]'), 'the page menu button')
    const triggers = [...bar()!.querySelectorAll<HTMLElement>('button[aria-haspopup="menu"], button[aria-haspopup="true"]')]
    await click(triggers.at(-1)!)
    await waitFor(() => items().length > 0, 'the menu open')
    const found = items()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await waitFor(() => items().length === 0, 'the menu closed')
    return found
  }

  // Every item of each list's menu, sorted: its own items, the filters, Select tasks, Print and Help.
  const DURATIONS = ['Over 1 h', 'Quick wins', 'Under 30 min', 'Unestimated']
  const MENUS: Record<string, string[]> = {
    'the Inbox': ['Display options', 'Help', 'Print…', 'Select tasks', ...DURATIONS],
    Today: ['Away…', 'Display mode', 'Display options', 'Help', 'Hide briefing', 'Print…', 'Select tasks', ...DURATIONS],
    Upcoming: ['Display mode', 'Display options', 'Filter…', 'Help', 'Hide briefing', 'Print…', 'Select tasks', 'Show repeating occurrencesFuture dates of repeating tasks, read-only', 'Start with TodayShow Today’s tasks before Tomorrow', ...DURATIONS],
    'a label': ['Delete label…', 'Display options', 'Edit…', 'Help', 'Merge into…There is no other label', 'Move downAlready lastAlt+↓', 'Move upAlready firstAlt+↑', 'Pin to sidebar', 'Print…', 'RenameF2', 'Select tasks'],
    'a project': ['ActivityShift+H', 'Add a note', 'Archive…', 'Board', 'Calendar', 'Delete project…', 'Display mode', 'Display options', 'Duplicate…', 'Fields…Shift+F', 'Filter…', 'Help', 'History', 'Icon…', 'List', 'List…', 'Move to…m', 'Pin to sidebar', 'Print…', 'Rename', 'Routines', 'Save as template…', 'Select tasks', 'Share project…', 'Show completed tasks', 'Timeline', ...DURATIONS],
  }
  for (const [name, route] of ROUTES.filter(([n]) => n in MENUS)) {
    it(`${name} offers every item of its menu`, async () => {
      const s = await seed()
      navigate(route(s))
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => !!list() && rowIds().length > 0, 'the phone list')
      // Today's "Re-plan the rest of the day" is there only once a block of today is behind: it depends on the hour, so it is left out.
      const offered = (await menuOf(() => list()?.querySelector('[data-phone-header]'))).filter((item) => !item.startsWith('Re-plan the rest of the day'))
      expect(offered).toEqual([...MENUS[name]].sort())
      await r.unmount()
    })
  }
})

describe('adding and the layout from the phone list', () => {
  it('the add button adds to the list on screen with its defaults: a label\'s task has the label', async () => {
    const s = await seed()
    navigate({ view: 'label', id: s.errand })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => list()?.getAttribute('data-phone-list') === 'label' && !!document.querySelector('[data-add-button]'), 'the label\'s list and the add button')
    await click(document.querySelector('[data-add-button]')!)
    const field = () => document.querySelector<HTMLTextAreaElement>('[data-overlay="sheet"] textarea')
    await waitFor(() => !!field(), 'the add sheet')
    await type(field()!, 'Buy stamps')
    field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await waitFor(async () => (await db.tasks.toArray()).some((t) => t.title === 'Buy stamps' && t.labels.includes(s.errand)), 'the task with the label')
    await waitFor(() => [...document.querySelectorAll('[data-phone-row] [data-row-title]')].some((el) => el.textContent === 'Buy stamps'), 'the task in the list')
    await r.unmount()
  })

  it('Board in a project\'s menu shows the project as its board, and List returns to the phone list', async () => {
    const s = await seed()
    navigate({ view: 'project', id: s.work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!list(), 'the phone list')
    await saveViewMode(s.work, 'board')
    await waitFor(() => !list() && !!document.querySelector('[data-list-page]'), 'the board')
    await saveViewMode(s.work, 'list')
    await waitFor(() => !!list(), 'the phone list again')
    await r.unmount()
  })
})

describe('a project the person can only read', () => {
  it('opens its tasks, and offers no check, swipe, drag or selection', async () => {
    const s = await seed()
    await db.memberships.put({ projectId: s.work, role: 'viewer', ownerId: 'someone', members: [] })
    navigate({ view: 'project', id: s.work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row(s.late) && row(s.late).querySelector<HTMLButtonElement>('[data-phone-check]')?.disabled === true, 'the project as a reader sees it')
    const li = row(s.late)
    expect(li.hasAttribute('data-swipeable')).toBe(false)
    expect(li.hasAttribute('data-drop-target')).toBe(false)
    // The check does nothing.
    await click(li.querySelector('[data-phone-check]')!)
    expect((await db.tasks.get(s.late))?.completed_at ?? null).toBeNull()
    // The row still opens its task.
    await click(li.querySelector('[data-phone-open]')!)
    await waitFor(() => !!document.querySelector('[data-phone-screen="task"]'), 'the task page')
    await r.unmount()
  })
})
