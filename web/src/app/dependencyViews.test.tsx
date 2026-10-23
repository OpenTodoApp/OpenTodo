// @vitest-environment happy-dom
// Blocked tasks in lists, Today and the task panel (OpenSpec change
// task-dependencies, tasks 3.1, 3.2 and 3.3).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { setBlockedBy } from '../lib/dependencies'
import { createTask, resetDeviceId, setTaskCompleted } from '../lib/ops'
import { click, flush, key, render, spokenText, visibleText } from '../ui/test-utils'
import { TaskPageHost } from './taskPage.testkit'
import { resetPanel } from './panel'
import { PanelHost } from './PanelHost'
import { TaskListView } from './TaskListView'
import { TaskDetail } from './task-detail/TaskDetail'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`dep-views-${Date.now()}-${n++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
  try { localStorage.clear() } catch { /* ignore */ }
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 2000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}
const row = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].find((r) => r.textContent?.includes(title))

describe('rows (3.1)', () => {
  it('a blocked row is dimmed with the number of open blockers and can still be completed', async () => {
    const a = await createTask({ title: 'Confirm dates' })
    const b = await createTask({ title: 'Ask the team' })
    const t = await createTask({ title: 'Book flights' })
    await setBlockedBy(t, [a, b])
    const r = await render(<><TaskListView route={{ view: 'inbox' }} /><TaskPageHost /></>)
    mounted.push(r)
    await waitFor(() => !!row('Book flights')?.querySelector('[data-blocked]'))
    const marker = row('Book flights')!.querySelector('[data-blocked]')!
    expect(spokenText(marker)).toBe('Blocked by 2')
    expect(row('Confirm dates')!.querySelector('[data-blocked]')).toBeNull()
    // c completes it anyway, leaving the blockers alone.
    row('Book flights')!.querySelector<HTMLElement>('button[aria-label^="Complete"], [role="checkbox"]')
    await key(document.body, 'j')
    await key(document.body, 'j')
    await key(document.body, 'j')
    await key(document.body, 'c')
    await waitFor(async () => !!(await db.tasks.get(t))?.completed_at)
    expect((await db.tasks.get(a))?.completed_at).toBeNull()
  })
})

describe('Today (3.2)', () => {
  it('a blocked task due today waits in the folded Blocked group until its blocker is completed', async () => {
    const blocker = await createTask({ title: 'Confirm dates' })
    const t = await createTask({ title: 'Book flights', due: { date: '2026-10-14' } })
    await createTask({ title: 'Water plants', due: { date: '2026-10-14' } })
    await setBlockedBy(t, [blocker])
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    mounted.push(r)
    await waitFor(() => !!document.querySelector('[data-group="blocked"]'))
    const group = document.querySelector<HTMLElement>('[data-group="blocked"]')!
    const toggle = group.querySelector('button[aria-expanded]')!
    expect(toggle.textContent).toContain('Blocked')
    expect(visibleText(toggle.querySelector('[data-group-count]')!)).toBe('1')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(row('Book flights')).toBeUndefined()
    await click(toggle)
    await waitFor(() => !!document.querySelector('[data-group="blocked"]')?.textContent?.includes('Book flights'))
    await setTaskCompleted(blocker, true)
    await waitFor(() => !document.querySelector('[data-group="blocked"]'))
    expect(document.querySelector('[data-group="today"]')!.textContent).toContain('Book flights')
  })
})

describe('task panel (3.3)', () => {
  it('b opens the picker, which offers neither the task nor what waits for it; Blocks opens a dependent', async () => {
    const trip = await createTask({ title: 'Plan trip' })
    const flights = await createTask({ title: 'Book flights' })
    const hotel = await createTask({ title: 'Book hotel' })
    await createTask({ title: 'Renew passport' })
    await setBlockedBy(flights, [trip])
    // The Inbox keeps its task beside the list from 1024 px (inbox-split): the slot draws it there.
    const r = await render(<><TaskListView route={{ view: 'inbox' }} /><TaskPageHost /><PanelHost user={{ id: 'me' }} /></>)
    mounted.push(r)
    await waitFor(() => !!row('Plan trip'))
    // Select "Plan trip" and press b.
    await key(document.body, 'j')
    await key(document.body, 'b')
    await waitFor(() => !!document.querySelector('[data-detail-for]'))
    await flush(50)
    await waitFor(() => !!document.querySelector('[data-facet-editor] [role="listbox"]'))
    const options = () => [...document.querySelectorAll('[data-facet-editor] [role="option"]')].map((o) => o.textContent ?? '')
    const panelTask = document.querySelector('[data-detail-for]')!.getAttribute('data-detail-for')
    const self = (await db.tasks.get(panelTask!))!.title
    expect(options().some((o) => o.includes(self))).toBe(false)
    if (self === 'Plan trip') expect(options().some((o) => o.includes('Book flights'))).toBe(false)
    expect(options().some((o) => o.includes('Renew passport'))).toBe(true)
    const pick = [...document.querySelectorAll<HTMLElement>('[data-facet-editor] [role="option"]')].find((o) => o.textContent?.includes('Renew passport'))!
    await click(pick)
    await waitFor(async () => ((await db.tasks.get(panelTask!))?.blocked_by ?? []).length === 1 + (self === 'Book flights' ? 1 : 0))
    expect(hotel).toBeTruthy()
  })

  it('lists the tasks waiting for this one and opens one', async () => {
    const trip = await createTask({ title: 'Plan trip' })
    const flights = await createTask({ title: 'Book flights' })
    await setBlockedBy(flights, [trip])
    const onOpen = vi.fn()
    const r = await render(<TaskDetail taskId={trip} userId="me" projects={[]} labelMap={new Map()} onClose={() => {}} onOpen={onOpen} />)
    mounted.push(r)
    await waitFor(() => !!document.querySelector('[data-part="blocks"]'))
    // The Who line counts the dependents; opening the part lists them.
    expect(document.querySelector('[data-part="blocks"]')!.textContent).toContain('blocks 1')
    await click(document.querySelector<HTMLButtonElement>('[data-part="blocks"]')!)
    await flush(40)
    const link = [...document.querySelectorAll<HTMLElement>('[data-facet-editor] button')].find((b) => b.textContent === 'Book flights')!
    await click(link)
    expect(onOpen).toHaveBeenCalledWith(flights)
  })
})
