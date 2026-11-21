// @vitest-environment happy-dom
// Away on screen (OpenSpec change away-periods, "While away" and "Set an away
// period"): Today's meta, End now, the dialog's preview and Set away with one
// Undo, and the palette command.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { occurrenceId } from '../../lib/ids'
import { createTask, mutate, resetDeviceId, updateTask } from '../../lib/ops'
import { undoBatch } from '../../lib/undo'
import { USER_PREFS_ID } from '../../lib/userPrefs'
import { click, minWidthPx, render, waitFor } from '../../ui/test-utils'
import { bulkToast } from '../bulk/toastStore'
import { commands, type PaletteContext } from '../palette/registry'
import { navigate } from '../router'
import { TaskListView } from '../TaskListView'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 25, 10, 0)) // Wednesday 25 November
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = minWidthPx(q)
    return { matches: min ? 1280 >= min : false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  navigate({ view: 'inbox' }, { replace: true })
})

const header = () => document.querySelector('[data-page-header]')
const away = async () => (await db.userPrefs.get(USER_PREFS_ID))?.away ?? ''

async function openMenu() {
  await click(header()!.querySelector<HTMLElement>('button[aria-label="More actions"]')!)
  await waitFor(() => document.querySelectorAll('[role="menuitem"]').length > 0, 'the actions menu')
}

describe('While away', () => {
  it('Today reads "Away until Friday", and End now clears the period and keeps the skips', async () => {
    const stretch = await createTask({ title: 'Stretch', due: { date: '2026-11-24' }, recurrence: 'every day' })
    await updateTask(stretch, { habit: true })
    await mutate('task', occurrenceId(stretch, '2026-11-24'), { title: 'Stretch', series_id: stretch, occurrence_date: '2026-11-24', due: { date: '2026-11-24' }, completed_at: 1, skipped: true })
    await mutate('user_prefs', USER_PREFS_ID, { away: '2026-11-24..2026-11-27 quiet' })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!header()?.textContent?.includes('Away until Friday'), 'the meta')
    await openMenu()
    await click(document.querySelector('[data-away-end]')!)
    await waitFor(async () => (await away()) === '', 'the period cleared')
    expect((await db.tasks.get(occurrenceId(stretch, '2026-11-24')))?.skipped).toBe(true)
    await waitFor(() => !header()?.textContent?.includes('Away until'), 'the meta gone')
    await r.unmount()
  })

  it('a period that ended reads as no period', async () => {
    await mutate('user_prefs', USER_PREFS_ID, { away: '2026-11-20..2026-11-24' })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!header(), 'the header')
    await openMenu()
    expect(header()?.textContent).not.toContain('Away until')
    expect(document.querySelector('[data-away-end]')).toBeNull()
    await r.unmount()
  })
})

describe('The dialog', () => {
  it('shows what it will do, then sets the period with one Undo', async () => {
    const stretch = await createTask({ title: 'Stretch', due: { date: '2026-11-25' }, recurrence: 'every day' })
    await updateTask(stretch, { habit: true })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!header(), 'the header')
    await openMenu()
    await click(document.querySelector('[data-away-item]')!)
    await waitFor(() => !!document.querySelector('[data-away-preview]')?.textContent?.includes('Skips 7 occurrences of 1 repeating task'), 'the preview')
    await click(document.querySelector('[data-away-set]')!)
    await waitFor(async () => (await away()) === '2026-11-25..2026-12-01 quiet', 'the period stored')
    expect((await db.tasks.get(stretch))?.due?.date).toBe('2026-12-02')
    await waitFor(() => !!bulkToast(), 'the Undo toast')
    await undoBatch(bulkToast()!.undoId!)
    expect(await away()).toBe('')
    expect((await db.tasks.get(stretch))?.due?.date).toBe('2026-11-25')
    await r.unmount()
  })

  it('refuses a period whose last day comes first', async () => {
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!header(), 'the header')
    await openMenu()
    await click(document.querySelector('[data-away-item]')!)
    await waitFor(() => !!document.querySelector('[data-away-to]'), 'the dialog')
    const to = document.querySelector<HTMLInputElement>('[data-away-to]')!
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(to, '2026-11-20')
    to.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFor(() => !!document.querySelector('[data-away-preview]')?.textContent?.includes('The last day comes before the first'), 'the error')
    expect(document.querySelector<HTMLButtonElement>('[data-away-set]')!.disabled).toBe(true)
    await r.unmount()
  })

  it('the palette offers Away…', () => {
    const ctx = { route: { view: 'inbox' }, user: null, today: '2026-11-25', list: null, filterQuery: null, query: '', vimEnabled: false, showShortcuts: () => {}, focusQuickAdd: () => false } as PaletteContext
    expect(commands(ctx).find((c) => c.id === 'away:set')?.label).toBe('Away…')
  })
})
