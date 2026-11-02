// @vitest-environment happy-dom
// The phone tab bar (OpenSpec change ux-overhaul, app-shell "Phone navigation"):
// Inbox, Today, Upcoming and Search below 768 px (precision-phone D3; the drawer opens
// from the top bar's menu button), two taps to any primary view, hidden while a sheet
// or the task page is open, 44 px tabs above the bottom safe area.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, flush, key, render, minWidthPx, waitFor } from '../ui/test-utils'
import { openTaskPanel, resetPanel } from './panel'
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
    matches: minWidthPx(q) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  navigate({ view: 'inbox' })
})
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals() })

const bar = () => document.querySelector('[data-tab-bar]')
const tab = (id: string) => document.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)!

describe('the tab bar', () => {
  it('offers Inbox, Today, Upcoming and Search, marks the current view in the strong tone and is at least 44 px tall', async () => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => document.querySelectorAll('[data-tab]').length === 4, 'the tab bar')
    expect([...document.querySelectorAll('[data-tab]')].map((t) => t.textContent)).toEqual(['Inbox', 'Today', 'Upcoming', 'Search'])
    expect(tab('inbox').getAttribute('aria-current')).toBe('page')
    expect(tab('inbox').className).toContain('text-strong')
    expect(tab('inbox').className).not.toContain('text-accent')
    expect(tab('today').getAttribute('aria-current')).toBeNull()
    for (const t of document.querySelectorAll('[data-tab]')) expect(t.className).toContain('min-h-14')
    expect(bar()!.className).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(bar()!.className).toContain('md:hidden')
    // The content column leaves room for the bar.
    expect(document.querySelector('main')!.getAttribute('data-phone-chrome')).toBe('true')
    await r.unmount()
  })

  it('Today opens Today without the drawer; the bar\'s menu button opens the sidebar as a drawer; Search opens the palette', async () => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!bar(), 'the tab bar')
    await click(tab('today'))
    await waitFor(() => location.pathname === '/today' && tab('today').getAttribute('aria-current') === 'page', 'Today open')
    expect(location.pathname).toBe('/today')
    expect(tab('today').getAttribute('aria-current')).toBe('page')
    const aside = document.querySelector('aside[data-sidebar]')!
    expect(aside.className).toContain('-translate-x-full')
    expect(tab('more' as string)).toBeNull()
    await click(document.querySelector<HTMLButtonElement>('[data-phone-bar] button[aria-label="Open menu"]')!)
    await waitFor(() => document.querySelector('aside[data-sidebar]')!.className.includes('translate-x-0'), 'the drawer open')
    expect(document.querySelector('aside[data-sidebar]')!.className).toContain('translate-x-0')
    await click(document.querySelector<HTMLElement>('.bg-scrim')!)
    await waitFor(() => document.querySelector('aside[data-sidebar]')!.className.includes('-translate-x-full'), 'the drawer closed')
    await click(tab('search'))
    await waitFor(() => !!document.querySelector('[data-testid="command-palette"]'))
    // A sheet is open: the bar and the add button are gone.
    expect(bar()).toBeNull()
    expect(document.querySelector('[data-add-button]')).toBeNull()
    await key(document.querySelector('input[aria-label="Search tasks, projects and commands"]')!, 'Escape')
    await waitFor(() => !!bar())
    await r.unmount()
  })

  it('hides on the task page and comes back on the list (task-full-page)', async () => {
    const id = await createTask({ title: 'Open me' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!bar(), 'the tab bar')
    expect(bar()).toBeTruthy()
    await act(async () => { openTaskPanel(id) })
    await waitFor(() => !bar() && location.pathname === `/task/${id}`)
    expect(document.querySelector('main')!.getAttribute('data-phone-chrome')).toBeNull()
    await act(async () => { navigate({ view: 'inbox' }) })
    await waitFor(() => !!bar())
    await r.unmount()
  })

  it('keeps the tab bar on Settings but not the add button, which would cover the ends of its rows', async () => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-add-button]'), 'the add button')
    await act(async () => { navigate({ view: 'settings' }) })
    await waitFor(() => !document.querySelector('[data-add-button]'), 'the add button gone')
    expect(bar()).toBeTruthy()
    await act(async () => { navigate({ view: 'inbox' }) })
    await waitFor(() => !!document.querySelector('[data-add-button]'), 'the add button back')
    await r.unmount()
  })

  it('is not rendered from 768 px', async () => {
    width = 1024
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('main'), 'the shell')
    // Rendered for the stylesheet to hide (md:hidden); the shell adds no bottom padding there.
    expect(document.querySelector('main')!.className).toContain('md:!pb-0')
    await r.unmount()
    width = 390
  })
})

// Minimising while scrolling down (phone-v2 D6).
describe('the tab bar while the list scrolls', () => {
  let reduce = false
  beforeEach(() => {
    reduce = false
    window.matchMedia = ((q: string) => ({
      matches: /prefers-reduced-motion/.test(q) ? reduce : minWidthPx(q) <= width, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
  })
  const content = () => document.querySelector<HTMLElement>('#content')!
  async function scrollTo(y: number) {
    const el = content()
    Object.defineProperty(el, 'scrollHeight', { value: 3000, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
    el.scrollTop = y
    el.dispatchEvent(new Event('scroll'))
    await flush()
  }
  const add = () => document.querySelector('[data-add-button]')!

  it('scrolling down more than 24 px drops the labels and slides the add button out; scrolling up restores both', async () => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!bar() && !!document.querySelector('#content'), 'the tab bar')
    await scrollTo(10)
    expect(bar()!.hasAttribute('data-minimised')).toBe(false)
    await scrollTo(60)
    expect(bar()!.getAttribute('data-minimised')).toBe('true')
    expect(tab('today').className).toContain('min-h-10')
    expect(tab('today').querySelector('span')!.className).toContain('sr-only')
    expect(tab('today').textContent).toBe('Today')
    expect(add().getAttribute('data-away')).toBe('true')
    expect(add().getAttribute('tabindex')).toBe('-1')
    await scrollTo(40)
    expect(bar()!.hasAttribute('data-minimised')).toBe(false)
    expect(tab('today').className).toContain('min-h-14')
    expect(add().hasAttribute('data-away')).toBe(false)
    await r.unmount()
  })

  it('comes back 600 ms after the scroll stops, and at the end of the list', async () => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!bar() && !!document.querySelector('#content'), 'the tab bar')
    await scrollTo(100)
    expect(bar()!.getAttribute('data-minimised')).toBe('true')
    // Restored by the quiet timer (600 ms), with no further scroll.
    await waitFor(() => !bar()!.hasAttribute('data-minimised'), 'the bar back after the scroll stopped')
    expect(bar()!.hasAttribute('data-minimised')).toBe(false)
    await scrollTo(200)
    expect(bar()!.getAttribute('data-minimised')).toBe('true')
    await scrollTo(2400)
    expect(bar()!.hasAttribute('data-minimised')).toBe(false)
    await r.unmount()
  })

  it('never minimises under reduced motion', async () => {
    reduce = true
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!bar() && !!document.querySelector('#content'), 'the tab bar')
    await scrollTo(100)
    await scrollTo(300)
    expect(bar()!.hasAttribute('data-minimised')).toBe(false)
    expect(add().hasAttribute('data-away')).toBe(false)
    await r.unmount()
  })

  it('the task page keeps both hidden, as a sheet did', async () => {
    const id = await createTask({ title: 'Read' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!bar(), 'the tab bar')
    await act(async () => { openTaskPanel(id) })
    await waitFor(() => bar() === null && location.pathname === `/task/${id}`, 'the task page')
    expect(bar()).toBeNull()
    expect(document.querySelector('[data-add-button]')).toBeNull()
    await r.unmount()
  })
})
