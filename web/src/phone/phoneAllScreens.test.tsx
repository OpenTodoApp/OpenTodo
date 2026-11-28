// @vitest-environment happy-dom
// The phone UI on every screen of the shell (OpenSpec change phone-all-screens): with
// the switch on below 768 px a page's header is the phone's and the shell's own bar
// is gone; a screen that lists tasks with the app's row shows the phone row, which
// opens the task page and completes through the screen's own write.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { saveViewMode } from '../lib/sections'
import { createView } from '../lib/views'
import type { User } from '../lib/types'
import { click, minWidthPx, render, waitFor } from '../ui/test-utils'
import { resetPanel } from '../app/panel'
import { navigate, type Route } from '../app/router'
import { Shell } from '../app/Shell'
import { resetTaskTrail } from '../app/taskTrail'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
let width = 390
const original = window.matchMedia

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

const header = () => document.querySelector<HTMLElement>('[data-phone-header]')
const shellBar = () => document.querySelector('[data-phone-bar]')
const title = () => document.querySelector('[data-phone-head] [data-page-title]')?.textContent ?? ''

const SCREENS: [Route, string][] = [
  [{ view: 'labels' }, 'Labels'],
  [{ view: 'views' }, 'Views'],
  [{ view: 'projects' }, 'Projects'],
  [{ view: 'next' }, 'Next'],
  [{ view: 'waiting' }, 'Waiting'],
  [{ view: 'trash' }, 'Trash'],
  [{ view: 'stats' }, 'Statistics'],
  [{ view: 'settings' }, 'Settings'],
]

describe('every screen has the phone header', () => {
  for (const [route, name] of SCREENS) {
    it(`${name}: the phone header with its title, and no shell bar`, async () => {
      navigate(route)
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => !!header() && title() === name, `${name} under the phone header`)
      expect(shellBar()).toBeNull()
      // The bar starts with the control that opens the drawer.
      expect(header()!.querySelector('button')!.getAttribute('aria-label')).toBe('Open menu')
      await r.unmount()
    })
  }

  it('is the page\'s own header from 768 px', async () => {
    navigate({ view: 'labels' })
    width = 768
    const wide = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-page-header]'), 'the desktop header')
    expect(header()).toBeNull()
    await wide.unmount()
  })

  it('a nested page starts with Back', async () => {
    navigate({ view: 'settings', section: 'appearance', page: 'theme' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!header()?.querySelector('[data-page-back]'), 'Back in the bar')
    await r.unmount()
  })
})

describe('every task row is the phone row', () => {
  it('Next lists its tasks as phone rows; the check completes with the screen\'s own write', async () => {
    const work = await createProject({ name: 'Work' })
    const first = await createTask({ title: 'Send the invoice', project_id: work })
    navigate({ view: 'next' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    const row = () => document.querySelector<HTMLElement>(`[data-phone-row="${first}"]`)
    await waitFor(() => !!row(), 'the task as a phone row')
    expect(document.querySelector('[data-drag-id="task-row"]')).toBeNull()
    await click(row()!.querySelector('[data-phone-check]')!)
    await waitFor(async () => !!(await db.tasks.get(first))?.completed_at, 'the task completed')
    await r.unmount()
  })

  it('a tap on a row opens the task page', async () => {
    const work = await createProject({ name: 'Work' })
    const first = await createTask({ title: 'Send the invoice', project_id: work })
    navigate({ view: 'next' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector(`[data-phone-row="${first}"]`), 'the row')
    await click(document.querySelector(`[data-phone-row="${first}"] [data-phone-open]`)!)
    await waitFor(() => !!document.querySelector('[data-phone-screen="task"]'), 'the task page')
    await r.unmount()
  })
})

describe('the phone row on the other screens that list tasks', () => {
  const titles = () => [...document.querySelectorAll('[data-phone-row] [data-row-title]')].map((el) => el.textContent)

  it('a saved view lists its tasks as phone rows', async () => {
    await createTask({ title: 'Urgent one', priority: 1 })
    await createTask({ title: 'Urgent two', priority: 1 })
    await createTask({ title: 'Not urgent' })
    const id = await createView({ name: 'Urgent', query: 'p1' })
    navigate({ view: 'view', id })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => titles().length === 2, 'the view\'s two tasks')
    expect(titles().sort()).toEqual(['Urgent one', 'Urgent two'])
    expect(document.querySelector('[data-drag-id="task-row"]')).toBeNull()
    // The view's title is its path (Views, then its name), as in its present header.
    expect(title()).toContain('Urgent')
    await r.unmount()
  })

  it('a filter\'s results are phone rows', async () => {
    await createTask({ title: 'Urgent one', priority: 1 })
    await createTask({ title: 'Not urgent' })
    navigate({ view: 'filter', q: 'p1' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => titles().length === 1, 'the filter\'s one task')
    expect(titles()).toEqual(['Urgent one'])
    await r.unmount()
  })

  it('a board\'s cards stay cards', async () => {
    const work = await createProject({ name: 'Work' })
    const card = await createTask({ title: 'A card', project_id: work })
    await saveViewMode(work, 'board')
    navigate({ view: 'project', id: work })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector(`[data-task-id="${card}"]`), 'the card')
    expect(document.querySelector('[data-phone-row]')).toBeNull()
    expect(document.querySelector(`[data-task-id="${card}"]`)!.getAttribute('data-drag-id')).toBe('task-row')
    await r.unmount()
  })
})

describe('the page menu under the phone header', () => {
  const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')].map((el) => el.textContent?.trim() ?? '').filter(Boolean).sort()
  const triggers = (bar: Element | null | undefined) => [...(bar?.querySelectorAll<HTMLElement>('button[aria-haspopup="menu"], button[aria-haspopup="true"]') ?? [])]
  /** The items of the bar's last menu (the page's own), or null when the bar has no menu. */
  async function menuOf(bar: () => Element | null | undefined): Promise<string[] | null> {
    const last = triggers(bar()).at(-1)
    if (!last) return null
    await click(last)
    await waitFor(() => items().length > 0, 'the menu open')
    const found = items()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await waitFor(() => items().length === 0, 'the menu closed')
    return found
  }
  const helpIn = (bar: Element | null | undefined) => !!bar?.querySelector('[data-help-screen]')

  // Help is a button where the page has no menu, and the menu's last item where it has one.
  const NO_MENU = { menu: null, help: true }
  const PAGES: [Route, string, { menu: string[] | null; help: boolean }][] = [
    [{ view: 'projects' }, 'Projects', { menu: ['Collapse all', 'Expand all', 'Help', 'Select projects'], help: false }],
    [{ view: 'labels' }, 'Labels', NO_MENU], [{ view: 'views' }, 'Views', NO_MENU], [{ view: 'next' }, 'Next', NO_MENU], [{ view: 'waiting' }, 'Waiting', NO_MENU],
  ]
  for (const [route, name, offered] of PAGES) {
    it(`${name} offers its menu and Help in the phone header`, async () => {
      const work = await createProject({ name: 'Work' })
      await createTask({ title: 'Send the invoice', project_id: work })
      navigate(route)
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => !!header() && title() === name && (triggers(header()).length > 0 || helpIn(header())), 'the phone header')
      expect({ menu: await menuOf(header), help: helpIn(header()) }).toEqual(offered)
      await r.unmount()
    })
  }
})
