// @vitest-environment happy-dom
// Bento in the Daily check (OpenSpec change bento-daily-check, tasks 3.1–3.4): every
// scenario of weekly-review "Bento slots", the header menu, the order on the Loop
// home and the Focus screen, and the Daily focus rows of How you work.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBentoOrder, setFocusStyle } from '../../lib/bento'
import { db } from '../../lib/db'
import { applyOps, createTask, resetDeviceId } from '../../lib/ops'
import { toggleFocus } from '../../lib/review'
import type { User } from '../../lib/types'
import { key, render, waitFor } from '../../ui/test-utils'
import { bulkToast } from '../bulk/toastStore'
import { undoToast } from '../bulk/UndoToast'
import { DailyFocusRows } from '../method/HowYouWorkSection'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 9, 0)
const TODAY = '2026-10-14'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

const message = () => document.querySelector('[data-daily-message]')?.textContent ?? ''
const slotTitle = (slot: 'L' | 'M' | 'S') =>
  document.querySelector(`[data-bento-slot="${slot}"] [data-task-id]`)?.textContent ?? null
const review = () => db.review.get('me')

/** Moves the cursor to the row of `title` in the Today group. */
async function select(title: string) {
  for (let i = 0; i < 30; i++) {
    const current = document.querySelector('[data-group="today"] [aria-current="true"]')
    if (current?.textContent?.includes(title)) return
    await key(document.body, 'j')
  }
  throw new Error(`no row ${title}`)
}

async function openDaily() {
  navigate({ view: 'review', step: 'daily' })
  const r = await render(<Shell user={user} onLogout={() => {}} />)
  await waitFor(() => !!document.querySelector('[data-group="today"] [data-task-id]'))
  await waitFor(() => !!document.querySelector('[data-bento-slots]'), 'the Bento slots')
  return r
}

const task = (title: string, estimate: number | null, extra: Record<string, unknown> = {}) =>
  createTask({ title, due: { date: TODAY }, estimate_minutes: estimate, ...extra })

describe('Bento slots', () => {
  it('Placed by estimate: a 2-hour, a 45-minute and a 20-minute task fill Large, Medium and Small; Undo takes one back', async () => {
    await setFocusStyle('bento')
    const big = await task('Write the report', 120)
    const mid = await task('Plan the trip', 45)
    const small = await task('Call the bank', 20)
    const r = await openDaily()
    expect(document.querySelectorAll('[data-bento-empty]')).toHaveLength(3)
    for (const title of ['Write the report', 'Plan the trip', 'Call the bank']) {
      await select(title)
      await key(document.body, 'f')
      await waitFor(() => message().includes(title))
    }
    await waitFor(() => slotTitle('S')?.includes('Call the bank') ?? false, 'Small filled')
    expect(slotTitle('L')).toContain('Write the report')
    expect(slotTitle('M')).toContain('Plan the trip')
    const row = await review()
    expect([row?.focus, row?.focus_slots, row?.focus_date]).toEqual([`${big},${mid},${small}`, `L:${big},M:${mid},S:${small}`, TODAY])
    await act(async () => { await undoToast(bulkToast()!.undoId!) })
    await waitFor(() => document.querySelectorAll('[data-bento-empty="S"]').length === 1, 'Small free again')
    expect((await review())?.focus).toBe(`${big},${mid}`)
    await r.unmount()
  })

  it('Slot taken: nothing is written, the message names the task, Choose a slot lists the free slots', async () => {
    await setFocusStyle('bento')
    const report = await task('Write the report', 180)
    await task('Paint the fence', 180)
    await act(async () => { await toggleFocus(await review(), TODAY, await db.tasks.toArray(), report) })
    const r = await openDaily()
    await waitFor(() => slotTitle('L')?.includes('Write the report') ?? false)
    const before = await db.outbox.count()
    await select('Paint the fence')
    await key(document.body, 'f')
    await waitFor(() => message() === 'Large holds Write the report.')
    expect(await db.outbox.count()).toBe(before)
    await act(async () => document.querySelector<HTMLButtonElement>('[data-bento-choose]')!.click())
    await waitFor(() => !!document.querySelector('[data-testid="bento-chooser"]'))
    expect([...document.querySelectorAll('[data-bento-pick]')].map((b) => b.getAttribute('data-bento-pick'))).toEqual(['M', 'S'])
    await act(async () => document.querySelector<HTMLButtonElement>('[data-bento-pick="S"]')!.click())
    await waitFor(() => slotTitle('S')?.includes('Paint the fence') ?? false, 'a slot is a choice')
    await r.unmount()
  })

  it('Unestimated task: the menu offers the free slots and Set estimate…; Medium places it without changing its estimate', async () => {
    await setFocusStyle('bento')
    const id = await task('Tidy the desk', null)
    const r = await openDaily()
    await select('Tidy the desk')
    await key(document.body, 'f')
    await waitFor(() => !!document.querySelector('[data-testid="bento-chooser"]'))
    expect([...document.querySelectorAll('[data-bento-pick]')].map((b) => b.getAttribute('data-bento-pick'))).toEqual(['L', 'M', 'S'])
    expect(document.querySelector('[data-bento-estimate]')).not.toBeNull()
    await act(async () => document.querySelector<HTMLButtonElement>('[data-bento-pick="M"]')!.click())
    await waitFor(() => slotTitle('M')?.includes('Tidy the desk') ?? false)
    expect((await db.tasks.get(id))?.estimate_minutes).toBeNull()
    expect((await review())?.focus_slots).toBe(`M:${id}`)
    await r.unmount()
  })

  it('Set estimate… sets the estimate, then places the task by it', async () => {
    await setFocusStyle('bento')
    const id = await task('Sort the photos', null)
    const r = await openDaily()
    await select('Sort the photos')
    await key(document.body, 'f')
    await waitFor(() => !!document.querySelector('[data-bento-estimate]'))
    await act(async () => document.querySelector<HTMLButtonElement>('[data-bento-estimate]')!.click())
    await waitFor(() => !!document.querySelector('[data-bento-preset="90"]'))
    await act(async () => document.querySelector<HTMLButtonElement>('[data-bento-preset="90"]')!.click())
    await waitFor(() => slotTitle('L')?.includes('Sort the photos') ?? false, 'placed by its new estimate')
    expect((await db.tasks.get(id))?.estimate_minutes).toBe(90)
    await r.unmount()
  })

  it('Viewer of a shared project: the menu has the free slots without Set estimate…, and the task can be put in a slot', async () => {
    await setFocusStyle('bento')
    const shared = 'shared-project'
    await db.projects.put({ id: shared, name: 'Household', color: null, parent_id: null, position: 0, archived: false, deleted_at: null, created_at: 0, _clock: {} } as never)
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'other', members: [] })
    await db.tasks.put({ ...(await db.tasks.get(await task('Mine', 20)))!, id: 'bins', title: 'Bins', project_id: shared, estimate_minutes: null })
    const r = await openDaily()
    await select('Bins')
    await key(document.body, 'f')
    await waitFor(() => !!document.querySelector('[data-testid="bento-chooser"]'))
    expect(document.querySelector('[data-bento-estimate]')).toBeNull()
    await act(async () => document.querySelector<HTMLButtonElement>('[data-bento-pick="L"]')!.click())
    await waitFor(() => slotTitle('L')?.includes('Bins') ?? false)
    await r.unmount()
  })

  it('Older device writes the focus: the new tasks show in slots by estimate, with no write', async () => {
    await setFocusStyle('bento')
    const old = [await task('Old one', 120), await task('Old two', 45)]
    const fresh = [await task('New small', 10), await task('New large', 150), await task('New medium', 60)]
    await applyOps([
      { id: 'a', entity: 'review', entityId: 'me', field: 'focus_date', value: TODAY, ts: 10, device: 'phone' },
      { id: 'b', entity: 'review', entityId: 'me', field: 'focus', value: fresh.join(','), ts: 10, device: 'phone' },
      { id: 'c', entity: 'review', entityId: 'me', field: 'focus_slots', value: `L:${old[0]},M:${old[1]}`, ts: 10, device: 'phone' },
    ])
    const before = await db.outbox.count()
    const r = await openDaily()
    await waitFor(() => slotTitle('L')?.includes('New large') ?? false)
    expect(slotTitle('M')).toContain('New medium')
    expect(slotTitle('S')).toContain('New small')
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })
})

describe('Focus style', () => {
  it('Switching keeps the focus: three tasks picked in Three tasks show in slots, and only the preference is written', async () => {
    const ids = [await task('Small one', 15), await task('Large one', 100), await task('Medium one', 50)]
    for (const id of ids) await toggleFocus(await review(), TODAY, await db.tasks.toArray(), id)
    navigate({ view: 'review', step: 'daily' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => document.querySelectorAll('[data-group="focus"] [data-task-id]').length === 3)
    expect(document.querySelector('[data-bento-slots]')).toBeNull()
    await db.outbox.clear()
    await act(async () => { await setFocusStyle('bento') })
    await waitFor(() => !!document.querySelector('[data-bento-slots]'))
    expect(slotTitle('L')).toContain('Large one')
    expect(slotTitle('M')).toContain('Medium one')
    expect(slotTitle('S')).toContain('Small one')
    expect((await db.outbox.toArray()).map((o) => `${o.entity}.${o.field}`)).toEqual(['user_prefs.focus_style'])
    await r.unmount()
  })
})

describe('Bento order', () => {
  it('Summit: the Loop home lists Medium, Large, Small and the Focus screen opens on the Medium task; Frog by default', async () => {
    await db.userPrefs.put({ id: 'me', method_mode: 'first' } as never)
    await setFocusStyle('bento')
    const ids = [await task('Small one', 15), await task('Large one', 100), await task('Medium one', 50)]
    await applyOps([
      { id: 'a', entity: 'review', entityId: 'me', field: 'focus_date', value: TODAY, ts: 10, device: 'phone' },
      { id: 'b', entity: 'review', entityId: 'me', field: 'focus', value: ids.join(','), ts: 10, device: 'phone' },
    ])
    navigate({ view: 'loop' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    const listed = () => [...document.querySelectorAll('[data-loop-focus] [data-task-id]')].map((x) => x.textContent ?? '')
    await waitFor(() => listed().length === 3, 'the focus on the Loop home')
    expect(listed().map((x) => x.split(' ')[0])).toEqual(['Large', 'Medium', 'Small'])
    await act(async () => { await setBentoOrder('summit') })
    await waitFor(() => listed()[0]?.startsWith('Medium') ?? false, 'Summit order')
    expect(listed().map((x) => x.split(' ')[0])).toEqual(['Medium', 'Large', 'Small'])
    await act(async () => navigate({ view: 'focus' }))
    await waitFor(() => (document.querySelector('[data-focus]')?.textContent ?? '').includes('Medium one'), 'the Focus screen on the Medium task')
    await r.unmount()
  })

  it('The header menu switches the style and offers the order only with Bento', async () => {
    await task('Anything', 20)
    navigate({ view: 'review', step: 'daily' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-group="today"] [data-task-id]'))
    const openMenu = async () => {
      const trigger = [...document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')].find((b) => b.getAttribute('aria-label') === 'More actions')!
      await act(async () => trigger.click())
      await waitFor(() => !!document.querySelector('[data-focus-style="bento"]'))
    }
    await openMenu()
    expect(document.querySelector('[data-bento-order]')).toBeNull()
    await act(async () => document.querySelector<HTMLElement>('[data-focus-style="bento"]')!.click())
    await waitFor(async () => (await db.userPrefs.get('me'))?.focus_style === 'bento')
    await waitFor(() => !!document.querySelector('[data-bento-slots]'))
    await openMenu()
    await act(async () => document.querySelector<HTMLElement>('[data-bento-order="summit"]')!.click())
    await waitFor(async () => (await db.userPrefs.get('me'))?.bento_order === 'summit')
    await r.unmount()
  })
})

describe('How you work: Daily focus', () => {
  it('shows the Order row only with Bento and reports each choice', async () => {
    const onStyle = vi.fn()
    const onOrder = vi.fn()
    const r = await render(<DailyFocusRows style="three" order="frog" onStyle={onStyle} onOrder={onOrder} />)
    expect(r.container.querySelector('[data-bento-order-select]')).toBeNull()
    const style = r.container.querySelector<HTMLSelectElement>('[data-focus-style-select]')!
    await act(async () => { style.value = 'bento'; style.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(onStyle).toHaveBeenCalledWith('bento')
    await r.unmount()
    const r2 = await render(<DailyFocusRows style="bento" order="frog" onStyle={onStyle} onOrder={onOrder} />)
    const order = r2.container.querySelector<HTMLSelectElement>('[data-bento-order-select]')!
    await act(async () => { order.value = 'summit'; order.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(onOrder).toHaveBeenCalledWith('summit')
    await r2.unmount()
  })
})
