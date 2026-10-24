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
import { click, flush, render, minWidthPx } from '../ui/test-utils'
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
afterEach(() => { window.matchMedia = original; document.body.innerHTML = ''; vi.unstubAllGlobals() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
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
    await flush(50)
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
})
