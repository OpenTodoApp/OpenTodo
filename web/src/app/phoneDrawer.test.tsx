// @vitest-environment happy-dom
// The phone drawer (OpenSpec change phone-v2, design D7): below 768 px, under a tab
// bar with Today, Inbox and Upcoming, the drawer lists only the primary destinations
// the bar lacks, then More, Favourites, Projects, Labels and Filters as 48 px rows in
// one scroller, with the account footer pinned; choosing a destination closes it.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setMethodMode } from '../lib/method/mode'
import { createProject, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, render, minWidthPx, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { Sidebar } from './Sidebar'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  window.matchMedia = ((q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? false : /pointer:\s*coarse/.test(q) ? true : minWidthPx(q) <= 390,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals() })

const primary = () => [...document.querySelectorAll('nav[data-sidebar-primary] [data-sidebar-item]')].map((b) => b.textContent ?? '')

describe('the phone drawer at 390 px', () => {
  it('Companion: Calendar first, and no Today, Inbox or Upcoming (the tab bar has them)', async () => {
    await setMethodMode('companion')
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => primary().length > 0)
    expect(primary()[0]).toMatch(/^Calendar/)
    for (const name of ['Today', 'Inbox', 'Upcoming']) expect(primary().some((p) => p.startsWith(name)), name).toBe(false)
    await r.unmount()
  })

  it('Reordered destinations (sidebar-polish 3.2): the drawer lists what the tab bar lacks in the stored order', async () => {
    const { setPromoted } = await import('../lib/appearance')
    const { applyOps } = await import('../lib/ops')
    await setPromoted(null, 'someday', true)
    await applyOps([{ id: 'o1', entity: 'user_prefs', entityId: 'me', field: 'sidebar_order', value: 'today,inbox,someday,upcoming,calendar', ts: Date.now() + 1000, device: 'laptop' }] as never)
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => primary().length >= 2 && primary()[0].startsWith('Someday'))
    expect(primary().map((p) => p.split(',')[0])).toEqual(['Someday', 'Calendar'])
    await r.unmount()
  })

  it('Open Loops first: Loop home, Next, Waiting and Review', async () => {
    await setMethodMode('first')
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => primary().length >= 4)
    expect(primary().map((p) => p.split(',')[0].replace(/\d+$/, ''))).toEqual(['Loop home', 'Next', 'Waiting', 'Review'])
    await r.unmount()
  })

  it('forty projects scroll inside the drawer while the footer stays put', async () => {
    for (let i = 0; i < 40; i++) await createProject({ name: `Project ${i}` })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => document.querySelectorAll('[data-sidebar-scroll] [data-project-id], [data-sidebar-scroll] [data-sidebar-item]').length >= 40)
    const scroller = document.querySelector('[data-sidebar-scroll]')!
    expect(scroller.className).toContain('overflow-y-auto')
    const footer = document.querySelector('[data-sidebar-footer]')!
    expect(scroller.contains(footer)).toBe(false)
    expect(footer.className).toContain('shrink-0')
    await r.unmount()
  })

  it('rows are 48 px in the drawer, at most 20 rem and 85 vw wide; Settings from the footer closes it', async () => {
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('aside[data-sidebar]') && !!document.querySelector('[data-phone-bar] button[aria-label="Open menu"]'), 'the shell')
    const aside = document.querySelector('aside[data-sidebar]')!
    expect(aside.className).toContain('w-80')
    expect(aside.className).toContain('max-w-[85vw]')
    expect(aside.className).toContain('max-md:[&_[data-sidebar-item]]:min-h-12')
    // The top bar's menu button opens it (precision-phone D3).
    await click(document.querySelector<HTMLButtonElement>('[data-phone-bar] button[aria-label="Open menu"]')!)
    expect(aside.className).toContain('translate-x-0')
    await click(document.querySelector<HTMLButtonElement>('[data-account-menu]')!)
    await waitFor(() => !!document.querySelector('[data-settings-button]'))
    await act(async () => { document.querySelector<HTMLElement>('[data-settings-button]')!.click() })
    await waitFor(() => location.pathname.startsWith('/settings'))
    await waitFor(() => aside.className.includes('-translate-x-full'))
    await r.unmount()
  })

  it('a destination chosen in the drawer leaves Back on the page it was opened from', async () => {
    const id = await createProject({ name: 'Home' })
    navigate({ view: 'today' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    const project = () => document.querySelector<HTMLElement>(`[data-project-row="${id}"] [data-sidebar-item]`)
    await waitFor(() => !!project())
    await click(document.querySelector('[data-phone-bar] button[aria-label="Open menu"]')!)
    await waitFor(() => (history.state as { overlay?: number } | null)?.overlay === 1, 'the drawer entry')
    await click(project()!)
    await waitFor(() => location.pathname === `/project/${id}` && history.state?.overlay === undefined, 'navigated over the marker')
    await act(async () => history.back())
    await waitFor(() => location.pathname === '/today', 'Back returns to Today')
    await r.unmount()
  })

  it('the menu button\'s Back closes the drawer and keeps the page', async () => {
    navigate({ view: 'today' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    const aside = () => document.querySelector<HTMLElement>('aside[data-sidebar]')!
    await waitFor(() => !!document.querySelector('[data-phone-bar] button[aria-label="Open menu"]'))
    await click(document.querySelector('[data-phone-bar] button[aria-label="Open menu"]')!)
    await waitFor(() => (history.state as { overlay?: number } | null)?.overlay === 1, 'the drawer entry')
    await act(async () => history.back())
    await waitFor(() => aside().className.includes('-translate-x-full'), 'the drawer closed')
    expect(location.pathname).toBe('/today')
    await r.unmount()
  })
})
