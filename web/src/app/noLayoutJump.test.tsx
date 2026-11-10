// @vitest-environment happy-dom
// Nothing moves the list under the user's finger (OpenSpec change no-layout-jump,
// issue 1143): the selection bar floats over the bottom of the content instead of
// pushing the rows down, the phone's add button steps aside for it, the shell's
// notices are toasts, and the rituals Focus and Close the day have no add button.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { key, minWidthPx, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import css from '../index.css?raw'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia
let width = 390

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

const addButton = () => document.querySelector<HTMLElement>('[data-add-button]')

/**
 * Whether the stylesheet's rule hiding the add button applies now (tests load no CSS): the
 * rule reads the root's mark, which the selection bar sets while it shows. No rule of the
 * bar uses `:has()` over the list, which restyled 2,000 rows on every change (issue 1179).
 */
const stepsAside = () => {
  expect(css).toMatch(/:root\[data-selection-docked\] \[data-add-button\]:not\(\[aria-expanded="true"\]\) \{ visibility: hidden;/)
  expect(css).not.toMatch(/:has\(\[data-selection-dock\]\)/)
  const marked = document.documentElement.hasAttribute('data-selection-docked')
  expect(marked).toBe(!!document.querySelector('[data-selection-dock]'))
  return marked
}
const row = (title: string) => [...document.querySelectorAll<HTMLElement>('li[data-task-id]')].find((li) => li.textContent?.includes(title))!

/**
 * Where a row sits: its offset, and the elements laid out before it in the page's flow.
 * happy-dom does no layout, so the second is what pins the behaviour: an element that
 * appears above the row in the flow (as the old sticky bar did) pushes it down.
 */
function position(el: HTMLElement) {
  const frame = el.closest('[data-page-body]')!
  const before = [...frame.querySelectorAll('*')].filter((x) =>
    !x.contains(el) && !!(x.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && !x.closest('.fixed'))
  return { top: el.getBoundingClientRect().top, offset: el.offsetTop, before: before.length }
}

describe('the selection bar never moves the list', () => {
  it('ticking a row on a phone leaves every row where it was, floats the bar over the bottom and moves the add button aside', async () => {
    for (const title of ['One', 'Two', 'Three']) await createTask({ title })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row('Three') && !!addButton(), 'the list and the add button')
    expect(stepsAside()).toBe(false)
    const was = position(row('Two'))
    await key(document.body, 'j')
    await key(document.body, 'x')
    await waitFor(() => document.querySelector('[data-selection-bar] [role="status"]')?.textContent === '1 selected', 'the bar')
    expect(position(row('Two'))).toEqual(was)
    const dock = document.querySelector('[data-selection-dock]')!
    expect(dock.className).toContain('fixed')
    // Above the tab bar, where the add button stood: the button steps aside while the bar shows.
    expect(dock.className).toContain('var(--toast-lift')
    expect(stepsAside()).toBe(true)
    await key(document.body, 'Escape')
    await waitFor(() => !document.querySelector('[data-selection-bar]'), 'the bar gone')
    expect(stepsAside()).toBe(false)
    expect(position(row('Two'))).toEqual(was)
    await r.unmount()
  })

  it('on a computer the bar overlays the bottom of the content too, and the rows stay put', async () => {
    width = 1280
    for (const title of ['One', 'Two']) await createTask({ title })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!row('Two'), 'the list')
    const was = position(row('Two'))
    await key(document.body, 'j')
    await key(document.body, 'x')
    await waitFor(() => !!document.querySelector('[data-selection-bar]'), 'the bar')
    expect(position(row('Two'))).toEqual(was)
    expect(document.querySelector('[data-selection-dock]')!.className).toContain('fixed')
    await r.unmount()
  })
})

describe('the rituals keep nothing else on screen', () => {
  it.each([['Focus', { view: 'focus' } as const], ['Close the day', { view: 'review', step: 'close' } as const]])('%s has no add button on a phone', async (_name, route) => {
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!addButton(), 'the add button in the Inbox')
    navigate(route)
    await waitFor(() => !!document.querySelector('[data-tab-bar]') && !addButton(), 'no add button')
    navigate({ view: 'today' })
    await waitFor(() => !!addButton(), 'the add button back in Today')
    await r.unmount()
  })
})
