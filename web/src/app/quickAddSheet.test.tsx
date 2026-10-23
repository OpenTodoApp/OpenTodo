// @vitest-environment happy-dom
// The floating add button and the quick add sheet (OpenSpec change ux-overhaul,
// app-shell "Add from anywhere"): a bottom sheet with its field focused, the
// view's defaults applied, keyboard-safe (the sheet sits above the on-screen
// keyboard through --vv-bottom), and the list visible behind it.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { todayISO } from '../lib/dates'
import { resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { act } from 'react'
import { click, flush, key, render, type } from '../ui/test-utils'
import { navigate } from './router'
import { Shell } from './Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  // A 390 px phone: every min-width query is false.
  window.matchMedia = ((q: string) => ({
    matches: Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= 390, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = original; document.body.innerHTML = ''; vi.unstubAllGlobals() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const sheet = () => document.querySelector('[data-overlay="sheet"]')
const field = () => document.querySelector<HTMLInputElement>('[data-quick-add-sheet] input[aria-label="Add a task"]')

describe('the add button', () => {
  it('opens quick add as a bottom sheet with the field focused, and the Upcoming default date applied', async () => {
    navigate({ view: 'upcoming' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    const button = document.querySelector<HTMLButtonElement>('[data-add-button]')!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await click(button)
    await waitFor(() => !!sheet() && !!field())
    await flush(50)
    expect(document.activeElement).toBe(field())
    // Keyboard-safe: the sheet is bottom-anchored on the visual viewport, and the list stays behind it.
    expect((sheet() as HTMLElement).style.bottom).toContain('--vv-bottom')
    expect(document.querySelector('[data-list-page]')).toBeTruthy()
    // The bar and the button make room for the sheet.
    expect(document.querySelector('[data-tab-bar]')).toBeNull()

    await type(field()!, 'Call the plumber')
    await act(async () => { field()!.form!.requestSubmit() })
    await waitFor(() => (document.querySelector('[data-quick-add-sheet]') === null))
    const tomorrow = new Date(todayISO())
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tasks = await db.tasks.toArray()
    expect(tasks.map((t) => [t.title, t.due?.date])).toEqual([['Call the plumber', tomorrow.toISOString().slice(0, 10)]])
    await r.unmount()
  })

  it('in a project the new task lands in that project; Escape closes the sheet', async () => {
    const { createProject } = await import('../lib/ops')
    const pid = await createProject({ name: 'Garden' })
    navigate({ view: 'project', id: pid })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    await click(document.querySelector<HTMLButtonElement>('[data-add-button]')!)
    await waitFor(() => !!field())
    await type(field()!, 'Mow the lawn')
    await act(async () => { field()!.form!.requestSubmit() })
    await waitFor(() => !sheet())
    expect((await db.tasks.toArray()).map((t) => t.project_id)).toEqual([pid])
    await click(document.querySelector<HTMLButtonElement>('[data-add-button]')!)
    await waitFor(() => !!field())
    await key(field()!, 'Escape')
    await waitFor(() => !sheet())
    expect(document.querySelector('[data-add-button]')!.getAttribute('aria-expanded')).toBe('false')
    await r.unmount()
  })
})

describe('chips and tools (palette-quick-add D7; natural-language-capture "Quick add tools on a phone")', () => {
  async function openSheet() {
    navigate({ view: 'today' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    await click(document.querySelector<HTMLButtonElement>('[data-add-button]')!)
    await waitFor(() => !!field())
    return r
  }

  it('the project tool starts `#` at the end, keeps the field focused and opens the suggestions', async () => {
    const { createProject } = await import('../lib/ops')
    await createProject({ name: 'Home renovation' })
    const r = await openSheet()
    await type(field()!, 'Buy primer')
    // The tools keep focus in the field: they cancel the mouse down.
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.querySelector('[data-sheet-tool="project"]')!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    await click(document.querySelector('[data-sheet-tool="project"]')!)
    await flush(40)
    expect(field()!.value).toBe('Buy primer #')
    expect(document.activeElement).toBe(field())
    await waitFor(() => !!document.querySelector('[data-token-suggestions="project"]'))
    await r.unmount()
  })

  it('chips for what is understood, a dashed placeholder for the label, and send adds like Enter', async () => {
    const { createProject } = await import('../lib/ops')
    const pid = await createProject({ name: 'Home renovation' })
    const r = await openSheet()
    await type(field()!, 'Call Mia about the tiles tomorrow 5pm #HomeRenovation')
    await waitFor(() => !!document.querySelector('[data-sheet-chip="project"]'))
    expect(document.querySelector('[data-sheet-chip="due"]')!.textContent).toContain('17:00')
    expect(document.querySelector('[data-sheet-chip="project"]')!.textContent).toContain('Home renovation')
    expect(document.querySelector('[data-sheet-placeholder="label"]')).toBeTruthy()
    expect(document.querySelector('[data-sheet-placeholder="project"]')).toBeNull()
    await click(document.querySelector('[data-sheet-send]')!)
    await waitFor(() => !sheet())
    expect((await db.tasks.toArray()).map((t) => [t.title, t.project_id, t.due?.time])).toEqual([['Call Mia about the tiles', pid, '17:00']])
    await r.unmount()
  })
})
