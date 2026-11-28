// @vitest-environment happy-dom
// The phone tab bar (OpenSpec change ux-overhaul, app-shell "Phone navigation"):
// Inbox, Today, Upcoming and Search below 768 px (precision-phone D3; the drawer opens
// from the top bar's menu button), two taps to any primary view, hidden while a sheet
// or the task page is open, 44 px tabs above the bottom safe area.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { applyOps, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, key, render, minWidthPx, waitFor } from '../ui/test-utils'
import { openTaskPanel, resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { RESTORE_AFTER_MS } from './useScrollDirection'


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
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals(); width = 390 })

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
    // 56 px, important: the touch rule that makes a button at least 44 px would replace it.
    for (const t of document.querySelectorAll('[data-tab]')) expect(t.className).toContain('min-h-14!')
    // On touch a tab and the add button show their own pressed colour (touch-pressed-states).
    for (const t of document.querySelectorAll('[data-tab]')) expect(t.className).toContain('press-selected')
    expect(document.querySelector('[data-add-button]')!.className).toContain('press-accent-hover')
    // It floats 8 px above the bottom safe area (phone-modern-look D1).
    expect(bar()!.className).toContain('bottom-[calc(0.5rem+var(--safe-bottom))]')
    expect(bar()!.className).toContain('md:hidden')
    // The content column leaves room for the bar.
    expect(document.querySelector('main')!.getAttribute('data-phone-chrome')).toBe('true')
    await r.unmount()
  })

  it('follows the sidebar destination order, with Search last', async () => {
    await applyOps([{ id: 'o1', entity: 'user_prefs', entityId: 'me', field: 'sidebar_order', value: 'upcoming,today,inbox,calendar', ts: Date.now(), device: 'laptop' }] as never)
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => [...document.querySelectorAll('[data-tab]')].map((t) => t.getAttribute('data-tab')).join() === 'upcoming,today,inbox,search', 'the reordered tabs')
    expect([...document.querySelectorAll('[data-tab]')].map((t) => t.textContent)).toEqual(['Upcoming', 'Today', 'Inbox', 'Search'])
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
    const menu = () => document.querySelector<HTMLButtonElement>('[data-phone-header] button[aria-label="Open menu"]')
    await waitFor(() => !!menu(), 'the header\'s menu button')
    await click(menu()!)
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
    // No button, no room kept for it at the end of the page (phone-fab-scroll-room).
    const content = document.querySelector('#content')!
    expect(content.hasAttribute('data-add-room')).toBe(false)
    expect(content.className).not.toContain('pb-(--add-room)')
    await act(async () => { navigate({ view: 'inbox' }) })
    await waitFor(() => !!document.querySelector('[data-add-button]'), 'the add button back')
    expect(content.getAttribute('data-add-room')).toBe('true')
    await r.unmount()
  })

  it('leaves the add button out of Import, whose form fields it would cover', async () => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-add-button]'), 'the add button')
    await act(async () => { navigate({ view: 'import' }) })
    await waitFor(() => !document.querySelector('[data-add-button]'), 'the add button gone')
    await act(async () => { navigate({ view: 'settings', section: 'data' }) })
    expect(document.querySelector('[data-add-button]')).toBeNull()
    await act(async () => { navigate({ view: 'today' }) })
    await waitFor(() => !!document.querySelector('[data-add-button]'), 'the add button back')
    await r.unmount()
  })

  it('is not rendered from 768 px', async () => {
    width = 1024
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('main'), 'the shell')
    // Rendered for the stylesheet to hide (md:hidden); the shell adds no bottom padding there.
    expect(document.querySelector('main')!.className).toContain('md:!pb-0')
    // Nor does the content column: the hidden bar measures as the whole window, so its room
    // left a page that fills the column (the calendar's Day and Week) 0 px tall (1.11.0).
    expect(document.querySelector<HTMLElement>('#content')!.style.paddingBottom).toBe('')
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
  afterEach(() => { vi.restoreAllMocks() })
  const content = () => document.querySelector<HTMLElement>('#content')!
  // The bar comes back on a 600 ms timer (RESTORE_AFTER_MS). On real timers it raced
  // every assertion after a scroll: a loaded worker that took 600 ms from the scroll
  // to the assertion saw the bar restored already. So once the shell is up, setTimeout
  // is faked and the test moves the clock itself (the teardown puts real timers back;
  // IndexedDB settles on setImmediate, which stays real).
  async function renderScrolling() {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!bar() && !!document.querySelector('#content'), 'the tab bar')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    return r
  }
  const elapse = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  // Dispatched inside act, so React commits the bar's new state before this returns
  // (outside act the update was left to the scheduler and could land after the assertion).
  async function scrollTo(y: number) {
    const el = content()
    Object.defineProperty(el, 'scrollHeight', { value: 3000, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
    el.scrollTop = y
    await act(async () => { el.dispatchEvent(new Event('scroll')) })
  }
  const add = () => document.querySelector('[data-add-button]')!

  it('scrolling down more than 24 px drops the labels and slides the add button out; scrolling up restores both', async () => {
    const r = await renderScrolling()
    await scrollTo(10)
    expect(bar()!.hasAttribute('data-minimised')).toBe(false)
    await scrollTo(60)
    expect(bar()!.getAttribute('data-minimised')).toBe('true')
    expect(tab('today').className).toContain('min-h-10')
    expect(tab('today').querySelector('[data-tab-label]')!.className).toContain('sr-only')
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
    const r = await renderScrolling()
    await scrollTo(100)
    expect(bar()!.getAttribute('data-minimised')).toBe('true')
    // Restored by the quiet timer (600 ms), with no further scroll; not a moment before.
    expect(RESTORE_AFTER_MS).toBe(600)
    await elapse(RESTORE_AFTER_MS - 1)
    expect(bar()!.getAttribute('data-minimised')).toBe('true')
    await elapse(1)
    expect(bar()!.hasAttribute('data-minimised')).toBe(false)
    await scrollTo(200)
    expect(bar()!.getAttribute('data-minimised')).toBe('true')
    await scrollTo(2400)
    expect(bar()!.hasAttribute('data-minimised')).toBe(false)
    await r.unmount()
  })

  it('the room under the content follows the bar as it minimises and returns (#1908)', async () => {
    // The bar's box as the browser lays it out: 56 px tabs, 44 px minimised on a touch screen, 34 px of safe area.
    // Only the observers watching the bar are called back, as a browser would.
    const observers: { cb: () => void; targets: Element[] }[] = []
    vi.stubGlobal('ResizeObserver', class {
      entry: { cb: () => void; targets: Element[] }
      constructor(cb: () => void) { this.entry = { cb, targets: [] }; observers.push(this.entry) }
      observe(el: Element) { this.entry.targets.push(el) }
      unobserve() {}
      disconnect() { this.entry.targets = [] }
    })
    // Restored by the describe's afterEach, also when an assertion fails half-way.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const h = this.hasAttribute('data-tab-bar') ? (this.hasAttribute('data-minimised') ? 44 : 56) + 1 + 34 : 0
      // The bar floats: the room is measured from its top to the bottom of the screen.
      const top = h ? innerHeight - h : 0
      return { height: h, width: 0, top, left: 0, right: 0, bottom: top + h, x: 0, y: 0, toJSON() {} } as DOMRect
    })
    const room = () => document.documentElement.style.getPropertyValue('--tab-bar-h')
    const resized = async () => { await act(async () => { observers.filter((o) => o.targets.includes(bar()!)).forEach((o) => o.cb()) }) }
    const r = await renderScrolling()
    expect(document.querySelector<HTMLElement>('#content')!.style.paddingBottom).toContain('var(--tab-bar-h')
    expect(room()).toBe('91px')
    await scrollTo(60)
    await resized()
    expect(room()).toBe('79px')
    await scrollTo(40)
    await resized()
    expect(room()).toBe('91px')
    await r.unmount()
    // Without the bar the shell falls back to its full height again.
    expect(room()).toBe('')
  })

  it('never minimises under reduced motion', async () => {
    reduce = true
    const r = await renderScrolling()
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

  it('on the Notes page the add button starts a note (notes-home: the one add of that phone screen)', async () => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await act(async () => { navigate({ view: 'notes' }) })
    const add = () => document.querySelector<HTMLElement>('[data-add-button]')
    await waitFor(() => add()?.getAttribute('aria-label') === 'New note', 'the New note button')
    await act(async () => { add()!.click() })
    await waitFor(() => location.pathname === '/notes' && location.search === '?new=1' || location.pathname.startsWith('/notes/'), 'a new note started')
    await r.unmount()
  })
})
