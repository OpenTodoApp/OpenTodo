// @vitest-environment happy-dom
// The phone UI on every screen of the shell (OpenSpec change phone-all-screens): with
// the switch on below 768 px a page's header is the phone's and the shell's own bar
// is gone; a screen that lists tasks with the app's row shows the phone row, which
// opens the task page and completes through the screen's own write.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, minWidthPx, render, waitFor } from '../ui/test-utils'
import { resetPanel } from '../app/panel'
import { navigate, type Route } from '../app/router'
import { Shell } from '../app/Shell'
import { resetTaskTrail } from '../app/taskTrail'
import { setPhoneUiEnabled } from './prefs'

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
  setPhoneUiEnabled(false)
})
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals(); setPhoneUiEnabled(false) })

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
      setPhoneUiEnabled(true)
      navigate(route)
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => !!header() && title() === name, `${name} under the phone header`)
      expect(shellBar()).toBeNull()
      // The bar starts with the control that opens the drawer.
      expect(header()!.querySelector('button')!.getAttribute('aria-label')).toBe('Open menu')
      await r.unmount()
    })
  }

  it('is the page\'s own header with the switch off, and from 768 px with it on', async () => {
    navigate({ view: 'labels' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!shellBar(), 'the shell\'s bar')
    expect(header()).toBeNull()
    await r.unmount()
    setPhoneUiEnabled(true)
    width = 1280
    const wide = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-page-header]'), 'the desktop header')
    expect(header()).toBeNull()
    await wide.unmount()
  })

  it('a nested page starts with Back', async () => {
    setPhoneUiEnabled(true)
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
    setPhoneUiEnabled(true)
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
    setPhoneUiEnabled(true)
    navigate({ view: 'next' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector(`[data-phone-row="${first}"]`), 'the row')
    await click(document.querySelector(`[data-phone-row="${first}"] [data-phone-open]`)!)
    await waitFor(() => !!document.querySelector('[data-phone-screen="task"]'), 'the task page')
    await r.unmount()
  })
})
