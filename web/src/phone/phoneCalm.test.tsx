// @vitest-environment happy-dom
// The phone made calmer (OpenSpec change phone-calm), through the whole shell: what a
// task could have as chips with Attach among them, the display options in the menu,
// and the Done today card opening its group.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { logicalToday } from '../lib/dates'
import { createTask, resetDeviceId, setTaskCompleted } from '../lib/ops'
import type { User } from '../lib/types'
import { click, minWidthPx, render, waitFor } from '../ui/test-utils'
import { resetPanel } from '../app/panel'
import { navigate } from '../app/router'
import { Shell } from '../app/Shell'
import { resetTaskTrail } from '../app/taskTrail'
import { setDoneTodayShown } from '../lib/closedListPrefs'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia
const today = logicalToday()

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  resetTaskTrail()
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width') ? minWidthPx(q) <= 390 : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals() })

/** The element once it is there. */
async function found<T extends Element>(get: () => T | null, what: string): Promise<T> {
  await waitFor(() => get() !== null, what)
  return get()!
}
const shell = () => render(<Shell user={user} onLogout={() => {}} />)

describe('the task page (D1)', () => {
  it('offers what the task could have as one row of chips ending with Attach, and no paperclip under the note', async () => {
    const id = await createTask({ title: 'Renew passport', due: { date: today } })
    navigate({ view: 'task', id })
    const r = await shell()
    const chips = await found(() => document.querySelector<HTMLElement>('[data-phone-screen="task"] [data-fact-chips]'), 'the chips')
    expect(chips.className).toContain('flex-wrap')
    expect(chips.querySelector('[data-fact-add="deadline"]')).not.toBeNull()
    const last = chips.lastElementChild!
    expect(last.hasAttribute('data-fact-chip-end')).toBe(true)
    expect(last.querySelector('[data-attach-menu]')!.textContent).toBe('Attach')
    expect(document.querySelectorAll('[data-phone-screen="task"] [data-attach-menu]')).toHaveLength(1)
    expect(document.querySelector('[data-task-notes-block] [data-attach-menu]')).toBeNull()
    await r.unmount()
  })
})

describe('Today (D3, D6)', () => {
  it('has no display button in the bar; the menu\'s Display options opens them', async () => {
    await createTask({ title: 'Write the notes', due: { date: today } })
    navigate({ view: 'today' })
    const r = await shell()
    await found(() => document.querySelector('[data-phone-row]'), 'the rows')
    expect(document.querySelector('[data-phone-header] [data-display-trigger]')).toBeNull()
    await click(await found(() => document.querySelector<HTMLElement>('[data-phone-header] [data-phone-overflow], [data-phone-header] button[aria-haspopup="menu"]'), 'the menu'))
    const item = await found(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent === 'Display options') ?? null, 'Display options in the menu')
    await click(item)
    await found(() => document.querySelector('[role="dialog"][aria-label="Display options"]'), 'the display options')
    await r.unmount()
  })

  it('the Done today card opens the Done today group once a task was done, where Today shows it', async () => {
    const done = await createTask({ title: 'Call Anna', due: { date: today } })
    await createTask({ title: 'Write the notes', due: { date: today } })
    await setTaskCompleted(done, true)
    navigate({ view: 'today' })
    let r = await shell()
    // Without the Done today group (a setting, off by default) the card is not a button.
    await found(() => document.querySelector('div[data-glance="done"]'), 'the card')
    expect(document.querySelector('button[data-glance="done"]')).toBeNull()
    await r.unmount()
    await setDoneTodayShown(true)
    r = await shell()
    const card = await found(() => document.querySelector<HTMLElement>('button[data-glance="done"]'), 'the Done today card as a button')
    expect(document.querySelector(`[data-group="done"] [data-phone-row="${done}"]`)).toBeNull()
    Element.prototype.scrollIntoView ??= () => {}
    await click(card)
    await found(() => document.querySelector(`[data-group="done"] [data-phone-row="${done}"]`), 'the done task in its open group')
    await r.unmount()
  })
})
