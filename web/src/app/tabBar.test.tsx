// @vitest-environment happy-dom
// The phone tab bar (OpenSpec change ux-overhaul, app-shell "Phone navigation"):
// Today, Inbox, Upcoming, Search and More below 768 px, two taps to any primary
// view, hidden while a sheet or the task panel is open, 44 px tabs above the
// bottom safe area.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { closePanel, openTaskPanel, resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
let width = 390
const original = window.matchMedia

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  window.matchMedia = ((q: string) => ({
    matches: Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  navigate({ view: 'inbox' })
})
afterEach(() => { window.matchMedia = original; document.body.innerHTML = ''; vi.unstubAllGlobals() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const bar = () => document.querySelector('[data-tab-bar]')
const tab = (id: string) => document.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)!

describe('the tab bar', () => {
  it('offers Today, Inbox, Upcoming, Search and More, marks the current view and is at least 44 px tall', async () => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    expect([...document.querySelectorAll('[data-tab]')].map((t) => t.textContent)).toEqual(['Today', 'Inbox', 'Upcoming', 'Search', 'More'])
    expect(tab('inbox').getAttribute('aria-current')).toBe('page')
    expect(tab('today').getAttribute('aria-current')).toBeNull()
    for (const t of document.querySelectorAll('[data-tab]')) expect(t.className).toContain('min-h-14')
    expect(bar()!.className).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(bar()!.className).toContain('md:hidden')
    // The content column leaves room for the bar.
    expect(document.querySelector('main')!.getAttribute('data-phone-chrome')).toBe('true')
    await r.unmount()
  })

  it('Today opens Today without the drawer; More opens the sidebar as a drawer; Search opens the palette', async () => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    await click(tab('today'))
    await flush(30)
    expect(location.pathname).toBe('/today')
    expect(tab('today').getAttribute('aria-current')).toBe('page')
    const aside = document.querySelector('aside[data-sidebar]')!
    expect(aside.className).toContain('-translate-x-full')
    await click(tab('more'))
    await flush(30)
    expect(document.querySelector('aside[data-sidebar]')!.className).toContain('translate-x-0')
    expect(tab('more').getAttribute('aria-expanded')).toBe('true')
    await click(document.querySelector<HTMLElement>('.bg-scrim')!)
    await flush(30)
    await click(tab('search'))
    await waitFor(() => !!document.querySelector('[data-testid="command-palette"]'))
    // A sheet is open: the bar and the add button are gone.
    expect(bar()).toBeNull()
    expect(document.querySelector('[data-add-button]')).toBeNull()
    await key(document.querySelector('input[aria-label="Search tasks, projects and commands"]')!, 'Escape')
    await waitFor(() => !!bar())
    await r.unmount()
  })

  it('hides while the task panel is open and comes back when it closes', async () => {
    const id = await createTask({ title: 'Open me' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    expect(bar()).toBeTruthy()
    openTaskPanel(id)
    await waitFor(() => !bar())
    expect(document.querySelector('main')!.getAttribute('data-phone-chrome')).toBeNull()
    closePanel()
    await waitFor(() => !!bar())
    await r.unmount()
  })

  it('is not rendered from 768 px', async () => {
    width = 1024
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    // Rendered for the stylesheet to hide (md:hidden); the shell adds no bottom padding there.
    expect(document.querySelector('main')!.className).toContain('md:!pb-0')
    await r.unmount()
    width = 390
  })
})
