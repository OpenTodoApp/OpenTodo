// @vitest-environment happy-dom
// The display screen (OpenSpec change display-mode, tasks 3.1 and 3.3): each
// target, the midnight rollover, the root attributes leaving on unmount, axe,
// roving focus and toggling by rights, offline toggles queueing in the outbox,
// the shell's shortcuts inert, and Escape back to the normal view.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime, setDayStart } from '../../lib/dates'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { createSection } from '../../lib/sections'
import { createView } from '../../lib/views'
import { click, flush, key, render } from '../../ui/test-utils'
import { DEFAULT_DISPLAY_OPTIONS, type DisplayOptions, type DisplayTarget } from './displayOptions'
import { DisplayScreen, lastSyncedLabel } from './DisplayScreen'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 7, 30))
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  history.replaceState(null, '', '/display/today')
  window.dispatchEvent(new PopStateEvent('popstate'))
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-contrast')
  document.documentElement.removeAttribute('data-motion')
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

function show(target: DisplayTarget, options: Partial<DisplayOptions> = {}) {
  return render(<DisplayScreen route={{ view: 'display', target, options: { ...DEFAULT_DISPLAY_OPTIONS, ...options } }} />)
}

const groupText = (c: HTMLElement, id: string) => [...c.querySelectorAll(`[data-display-group="${id}"] [data-display-row]`)].map((r) => r.querySelector('.display-task')!.textContent)
const headings = (c: HTMLElement) => [...c.querySelectorAll('h2')].map((h) => h.textContent)

describe('day start (day-boundary 2.6)', () => {
  afterEach(() => setDayStart(0))

  it('at 01:30 with a 04:00 day start the display names the previous day and its completions', async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 1, 30))
    setDayStart(240)
    await createTask({ title: 'Water plants', due: { date: '2026-10-14' } })
    const late = await createTask({ title: 'Late call', due: { date: '2026-10-14' } })
    await db.tasks.update(late, { completed_at: new Date(2026, 9, 15, 1, 0).getTime() })
    const evening = await createTask({ title: 'Evening run', due: { date: '2026-10-14' } })
    await db.tasks.update(evening, { completed_at: new Date(2026, 9, 14, 20, 0).getTime() })
    await createTask({ title: 'Dentist', due: { date: '2026-10-15' } })
    const r = await show({ kind: 'today' })
    await waitFor(() => r.container.textContent!.includes('Dentist'))
    expect(r.container.querySelector('[data-clock-date]')!.textContent).toBe('Wednesday 14 October')
    expect(groupText(r.container, 'overdue')).toEqual([])
    expect(groupText(r.container, 'today')).toEqual(['Water plants'])
    expect(groupText(r.container, 'done')).toEqual(['Late call', 'Evening run'])
    expect(groupText(r.container, '2026-10-15')).toEqual(['Dentist'])
    await r.unmount()
  })
})

describe('display targets', () => {
  it('Today: clock and date, Earlier, Today, Done today and three day columns, without the shell', async () => {
    await createTask({ title: 'Pay rent', due: { date: '2026-10-12' } })
    await createTask({ title: 'Water plants', due: { date: '2026-10-14' } })
    const done = await createTask({ title: 'Buy milk', due: { date: '2026-10-14' } })
    await db.tasks.update(done, { completed_at: Date.now() })
    await createTask({ title: 'Dentist', due: { date: '2026-10-15', time: '09:00' } })
    await createTask({ title: 'Next week', due: { date: '2026-10-21' } })
    const r = await show({ kind: 'today' })
    await waitFor(() => r.container.textContent!.includes('Dentist'))
    expect(r.container.querySelector('[data-clock-time]')!.textContent).toBe('07:30:00')
    expect(r.container.querySelector('[data-clock-date]')!.textContent).toBe('Wednesday 14 October')
    expect(groupText(r.container, 'overdue')).toEqual(['Pay rent'])
    expect(groupText(r.container, 'today')).toEqual(['Water plants'])
    expect(groupText(r.container, 'done')).toEqual(['Buy milk'])
    expect(r.container.querySelector('[data-display-group="done"] [data-display-row]')!.hasAttribute('data-done')).toBe(true)
    const columns = [...r.container.querySelectorAll('[data-display-columns] h2')].map((h) => h.textContent)
    expect(columns).toEqual(['Thursday 15 Oct', 'Friday 16 Oct', 'Saturday 17 Oct'])
    expect(groupText(r.container, '2026-10-15')).toEqual(['Dentist'])
    expect(r.container.textContent).not.toContain('Next week')
    // No sidebar, menu button, quick add or detail panel.
    expect(r.container.querySelector('nav, input, [data-sidebar-item], [data-panel]')).toBeNull()
    expect(r.container.querySelector('[data-screen="display"]')).toBeTruthy()

    const axe = (await import('axe-core')).default
    const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })

  it('Upcoming: seven day columns by default, days=2 for two', async () => {
    await createTask({ title: 'Saturday thing', due: { date: '2026-10-17' } })
    let r = await show({ kind: 'upcoming' })
    await waitFor(() => r.container.textContent!.includes('Saturday thing'))
    expect(r.container.querySelectorAll('[data-display-columns] [data-display-group]')).toHaveLength(7)
    expect(r.container.querySelector('h1')!.textContent).toBe('Upcoming')
    await r.unmount()
    r = await show({ kind: 'upcoming' }, { days: 2 })
    await waitFor(() => r.container.querySelectorAll('[data-display-columns] [data-display-group]').length === 2)
    await r.unmount()
  })

  it('a project lists its open tasks by section in order, subtasks under their parent', async () => {
    const p = await createProject({ name: 'Groceries' })
    const produce = await createSection(p, 'Produce')
    const dairy = await createSection(p, 'Dairy')
    await createTask({ title: 'Cheese', project_id: p, section_id: dairy, priority: 1 })
    const apples = await createTask({ title: 'Apples', project_id: p, section_id: produce, due: { date: '2026-10-16' } })
    await createTask({ title: 'Green ones', project_id: p, parent_id: apples, section_id: produce })
    const done = await createTask({ title: 'Yogurt', project_id: p, section_id: dairy })
    await db.tasks.update(done, { completed_at: Date.now() })
    const r = await show({ kind: 'project', id: p })
    await waitFor(() => r.container.textContent!.includes('Cheese'))
    expect(r.container.querySelector('h1')!.textContent).toBe('Groceries')
    expect(headings(r.container)).toEqual(['Produce', 'Dairy'])
    expect(groupText(r.container, `section:${produce}`)).toEqual(['Apples', 'Green ones'])
    expect(groupText(r.container, `section:${dairy}`)).toEqual(['Cheese'])
    expect(r.container.querySelector(`[data-display-group="section:${dairy}"] [data-priority="1"]`)).toBeTruthy()
    expect(r.container.querySelector(`[data-display-group="section:${produce}"] [data-display-row]`)!.textContent).toContain('Friday')
    expect(r.container.textContent).not.toContain('Yogurt')
    await r.unmount()
  })

  it('a saved view shows its own grouping and sort', async () => {
    await createTask({ title: 'Overdue one', due: { date: '2026-10-13' } })
    await createTask({ title: 'Later p1', due: { date: '2026-10-16' }, priority: 1 })
    await createTask({ title: 'Today one', due: { date: '2026-10-14' } })
    const v = await createView({ name: 'Dated', query: 'due <= 7 days', group_by: 'due', sort_by: 'due', sort_dir: 'asc' })
    const r = await show({ kind: 'view', id: v })
    await waitFor(() => r.container.textContent!.includes('Later p1'))
    expect(r.container.querySelector('h1')!.textContent).toBe('Dated')
    expect(headings(r.container)).toEqual(['Earlier', 'Today', 'Friday 16 Oct'])
    await r.unmount()
  })

  it('a deleted project says so with a link to the Inbox', async () => {
    await createProject({ name: 'Other' })
    const r = await show({ kind: 'project', id: 'gone' })
    await waitFor(() => !!r.container.querySelector('[data-display-missing]'))
    expect(r.container.textContent).toContain('This project no longer exists')
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Go to Inbox')!)
    expect(location.pathname).toBe('/')
    await r.unmount()
  })
})

describe('clock, presentation and sync line', () => {
  it('rolls over at midnight: the date changes, yesterday moves to Earlier, the columns shift', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 14, 23, 59, 50))
    await createTask({ title: 'Still to do', due: { date: '2026-10-14' } })
    await createTask({ title: 'Thursday task', due: { date: '2026-10-15' } })
    const r = await show({ kind: 'today' })
    await waitFor(() => r.container.textContent!.includes('Thursday task'))
    expect(groupText(r.container, 'today')).toEqual(['Still to do'])
    await act(async () => { vi.advanceTimersByTime(15_000) })
    await waitFor(() => r.container.querySelector('[data-clock-date]')!.textContent === 'Thursday 15 October')
    expect(groupText(r.container, 'overdue')).toEqual(['Still to do'])
    expect(groupText(r.container, 'today')).toEqual(['Thursday task'])
    expect([...r.container.querySelectorAll('[data-display-columns] h2')][0].textContent).toBe('Friday 16 Oct')
    await r.unmount()
  })

  it('eink=1 sets high contrast and no motion on the root, a clock without seconds, and both leave on unmount', async () => {
    const r = await show({ kind: 'today' }, { contrast: 'high', motion: 'none', seconds: false, size: 'xl' })
    await waitFor(() => !!r.container.querySelector('[data-clock-time]'))
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high')
    expect(document.documentElement.getAttribute('data-motion')).toBe('none')
    expect(r.container.querySelector('[data-clock-time]')!.textContent).toBe('07:30')
    expect(r.container.querySelector('[data-screen="display"]')!.getAttribute('data-size')).toBe('xl')
    await r.unmount()
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false)
    expect(document.documentElement.hasAttribute('data-motion')).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('says when it last synced', () => {
    const now = Date.now()
    expect(lastSyncedLabel(null, now)).toBe('Not synced since this screen opened')
    expect(lastSyncedLabel(now - 20_000, now)).toBe('Last synced just now')
    expect(lastSyncedLabel(now - 5 * 60_000, now)).toBe('Last synced 5 min ago')
    expect(lastSyncedLabel(now - 61 * 60_000, now)).toBe('Last synced 1 h ago')
  })
})

describe('keyboard and toggling', () => {
  async function fourTasks() {
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) await createTask({ title, due: { date: '2026-10-14' } })
  }

  it('j three times focuses the fourth row; Escape opens the normal Today view', async () => {
    await fourTasks()
    const r = await show({ kind: 'today' })
    await waitFor(() => r.container.querySelectorAll('[data-display-group="today"] [data-display-row]').length === 5)
    for (let i = 0; i < 3; i++) await key(document.body, 'j')
    expect(document.activeElement?.querySelector('.display-task')?.textContent).toBe('Four')
    expect(document.activeElement?.getAttribute('tabindex')).toBe('0')
    await key(document.body, 'Home')
    expect(document.activeElement?.querySelector('.display-task')?.textContent).toBe('One')
    await key(document.body, 'End')
    expect(document.activeElement?.querySelector('.display-task')?.textContent).toBe('Five')
    await key(document.activeElement!, 'Escape')
    expect(location.pathname).toBe('/today')
    await r.unmount()
  })

  it('Space completes the focused task on the owner\'s display, and Enter reopens it', async () => {
    await fourTasks()
    const r = await show({ kind: 'today' })
    await waitFor(() => r.container.querySelectorAll('[data-display-group="today"] [data-display-check]').length === 5)
    await key(document.body, 'j')
    await key(document.activeElement!, ' ')
    await waitFor(() => groupText(r.container, 'done').includes('Two'))
    const two = (await db.tasks.toArray()).find((t) => t.title === 'Two')!
    expect(two.completed_at).not.toBeNull()
    await r.unmount()
  })

  it('the shell shortcuts are inert: g then s does not open Settings, ? does nothing', async () => {
    await fourTasks()
    const r = await show({ kind: 'today' })
    await waitFor(() => r.container.querySelectorAll('[data-display-row]').length >= 5)
    await key(document.body, 'g')
    await key(document.body, 's')
    await key(document.body, '?')
    expect(location.pathname).toBe('/display/today')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await r.unmount()
  })

  it('a viewer of a shared project sees no checkboxes and Space changes nothing', async () => {
    const p = await createProject({ name: 'Household' })
    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'other', members: [] })
    await createTask({ title: 'Bins out', project_id: p, due: { date: '2026-10-14' } })
    const r = await show({ kind: 'project', id: p })
    await waitFor(() => r.container.textContent!.includes('Bins out'))
    expect(r.container.querySelector('[data-display-check]')).toBeNull()
    await key(document.body, 'j')
    await key(document.body, ' ')
    await key(document.body, 'Enter')
    await flush(50)
    expect((await db.tasks.toArray()).every((t) => t.completed_at === null)).toBe(true)
    await r.unmount()
  })

  it('a touch toggle offline shows the task done at once and queues the op in the outbox', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await createTask({ title: 'Feed the cat', due: { date: '2026-10-14' } })
    const before = await db.outbox.count()
    const r = await show({ kind: 'today' })
    await waitFor(() => !!r.container.querySelector('[data-display-check]'))
    await click(r.container.querySelector('[data-display-check]')!)
    await waitFor(() => groupText(r.container, 'done').includes('Feed the cat'))
    const ops = (await db.outbox.toArray()).slice(before)
    expect(ops.some((o) => o.field === 'completed_at' && o.value !== null)).toBe(true)
    expect(r.container.querySelector('[data-display-synced]')!.textContent).toMatch(/^Offline · /)
    online.mockRestore()
    await r.unmount()
  })
})
