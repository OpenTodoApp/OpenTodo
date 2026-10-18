// @vitest-environment happy-dom
// Statistics and the weekly review on screen (OpenSpec change stats-and-review,
// tasks 2.1, 3.2, 3.3): the period chooser by keyboard, chart tables equal to the
// computed numbers, no request, the zero state, axe; the review's keyboard path,
// finishing, archiving offline and the sidebar marker.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { createProject, createTask, resetDeviceId, setTaskCompleted } from '../../lib/ops'
import { compute, periodFor, PERIOD_LABELS } from '../../lib/stats'
import type { Task, User } from '../../lib/types'
import { flush, key, render, type } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'
import { Sidebar } from '../Sidebar'
import { StatsContent, StatsView } from './StatsView'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 12, 0) // Wednesday 14 October 2026
const at = (d: number, h = 10) => new Date(2026, 9, d, h).getTime()

let fetchSpy: ReturnType<typeof vi.fn>
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  fetchSpy = vi.fn(async () => new Response('{}', { status: 404 }))
  vi.stubGlobal('fetch', fetchSpy)
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  resetPanel()
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

async function seedWeek(): Promise<string> {
  const work = await createProject({ name: 'Work' })
  for (const [title, day, due] of [['Report', 12, null], ['Slides', 13, 12], ['Call', 13, null], ['Old', 6, null]] as const) {
    const id = await createTask({ title, project_id: work, due: due ? { date: `2026-10-${due}` } : null })
    await db.tasks.update(id, { completed_at: at(day), created_at: at(1) })
  }
  await createTask({ title: 'Overdue', project_id: work, due: { date: '2026-10-12' } })
  return work
}

const tableValues = (fig: Element) => [...fig.querySelectorAll('table tbody tr')].map((tr) => Number(tr.querySelector('td')!.textContent))
const number = (root: ParentNode, k: string) => Number(root.querySelector(`[data-number="${k}"] dd`)!.textContent)

describe('Statistics screen', () => {
  it('shows the numbers before the charts, chart tables carry the computed values, and nothing is requested', async () => {
    await seedWeek()
    const r = await render(<StatsView />)
    await waitFor(() => number(r.container, 'completed') === 3)
    const tasks = await db.tasks.toArray()
    const projects = await db.projects.toArray()
    const expected = compute({ tasks, projects, shared: new Set(), me: 'u1', today: '2026-10-14' }, periodFor('this-week', '2026-10-14', 1), 1)
    expect(['completed', 'created', 'late', 'slipped', 'overdue'].map((k) => number(r.container, k)))
      .toEqual([expected.completed, expected.created, expected.late, expected.slipped, expected.overdue])
    const perDay = r.container.querySelector('[data-chart="Completed per day"]')!
    expect(tableValues(perDay)).toEqual(expected.perDay.map((d) => d.count))
    expect(tableValues(perDay)).toEqual([1, 2, 0])
    expect(perDay.querySelector('svg[role="img"]')!.getAttribute('aria-label')).toContain('3 completed in total')
    // The numbers come first, then the charts.
    const numbers = r.container.querySelector('[data-testid="stats-numbers"]')!
    expect(numbers.compareDocumentPosition(perDay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(r.container.textContent).toContain('Computed on this device')
    expect(fetchSpy).not.toHaveBeenCalled()

    const axe = (await import('axe-core')).default
    const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })

  it('the heading takes focus, the period chooser is the next stop, and the arrow keys change the period', async () => {
    await seedWeek()
    const r = await render(<StatsView />)
    await waitFor(() => number(r.container, 'completed') === 3)
    const h1 = r.container.querySelector('h1')!
    expect(document.activeElement).toBe(h1)
    const focusable = [...r.container.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.tabIndex >= 0)
    expect(focusable[0].getAttribute('role')).toBe('radio')
    expect(focusable[0].getAttribute('aria-checked')).toBe('true')
    focusable[0].focus()
    await key(focusable[0], 'ArrowRight')
    const checked = () => r.container.querySelector('[role="radio"][aria-checked="true"]')!
    expect(checked().textContent).toBe(PERIOD_LABELS['last-week'])
    expect(document.activeElement).toBe(checked())
    await waitFor(() => number(r.container, 'completed') === 1)
    expect(number(r.container, 'slipped')).toBe(0)
    await key(checked(), 'ArrowRight')
    expect(checked().textContent).toBe(PERIOD_LABELS['4-weeks'])
    expect(r.container.querySelector('[data-chart="Completed per weekday"]')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('shows zeros and a hint instead of empty charts', async () => {
    const r = await render(<StatsContent tasks={[]} projects={[]} memberships={[]} me="u1" today="2026-10-14" weekStart={1} period="this-week" onPeriod={() => {}} />)
    expect(number(r.container, 'completed')).toBe(0)
    expect(r.container.querySelector('[data-testid="stats-empty"]')).toBeTruthy()
    expect(r.container.querySelector('[data-testid="stats-charts"]')).toBeNull()
    await r.unmount()
  })

  it('twelve weeks shows twelve week bars', async () => {
    const tasks = [{ id: 'a', title: 'A', project_id: null, completed_at: at(13), created_at: at(1), deleted_at: null, due: null, series_id: null, assignee_id: null } as unknown as Task]
    const r = await render(<StatsContent tasks={tasks} projects={[]} memberships={[]} me="u1" today="2026-10-14" weekStart={1} period="12-weeks" onPeriod={() => {}} />)
    expect(tableValues(r.container.querySelector('[data-chart="Completed per week"]')!)).toHaveLength(12)
    await r.unmount()
  })
})

const tabNamed = (name: string) => [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent?.includes(name))!

describe('Weekly review', () => {
  it('keyboard path: g r, two right arrows, j and Enter add a next action to the project', async () => {
    await createTask({ title: 'Unsorted idea' })
    const garage = await createProject({ name: 'Garage' })
    const sweep = await createTask({ title: 'Sweep', project_id: garage })
    await setTaskCompleted(sweep, true)
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Unsorted idea'))
    await key(document.body, 'g')
    await key(document.body, 'r')
    await waitFor(() => !!document.querySelector('[role="tab"][aria-selected="true"]'))
    // It opens on the first unfinished step, Get clear, with focus on the tabs.
    expect(tabNamed('Get clear').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabNamed('Get clear'))
    await key(document.activeElement!, 'ArrowRight')
    await key(document.activeElement!, 'ArrowRight')
    expect(tabNamed('Next actions').getAttribute('aria-selected')).toBe('true')
    await waitFor(() => !!document.querySelector('[data-review-project]'))
    await key(document.activeElement!, 'j')
    expect(document.querySelector('[data-review-project][aria-selected="true"]')!.textContent).toContain('Garage')
    await key(document.activeElement!, 'Enter')
    await waitFor(() => !!document.querySelector('[role="dialog"] input'))
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await type(input, 'Buy shelf brackets')
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => !document.querySelector('[data-review-project]'))
    const added = (await db.tasks.toArray()).find((t) => t.title === 'Buy shelf brackets')!
    expect(added.project_id).toBe(garage)
    await r.unmount()
  })

  it('g Shift+S opens Statistics', async () => {
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    await key(document.body, 'g')
    await key(document.body, 'S', { shiftKey: true })
    await waitFor(() => location.pathname === '/stats' && !!document.querySelector('[data-period-chooser]'))
    await r.unmount()
  })

  it('finishing writes the review op, shows the time and returns focus to the steps', async () => {
    navigate({ view: 'review' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[role="tab"][aria-selected="true"]'))
    // Nothing to do: every step is done, and Finish review is the primary action.
    expect(r.container.textContent).toContain('Every step is done')
    const finish = [...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Finish review')!
    expect(finish.className).toContain('primary')
    await act(async () => finish.click())
    await waitFor(() => !!r.container.querySelector('[data-testid="review-finished"]'))
    expect((await db.review.get('me'))?.completed_at).toBe(NOW.getTime())
    const queued = (await db.outbox.toArray()).filter((o) => o.entity === 'review')
    expect(queued.map((o) => [o.entityId, o.field, o.value])).toEqual([['me', 'completed_at', NOW.getTime()]])
    expect(document.activeElement?.getAttribute('role')).toBe('tab')
    await r.unmount()
  })

  it('archiving offline archives at once and queues the op', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const garage = await createProject({ name: 'Garage' })
    navigate({ view: 'review' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[role="tab"][aria-selected="true"]'))
    expect(tabNamed('Next actions').getAttribute('aria-selected')).toBe('true')
    const archive = [...r.container.querySelectorAll('[data-review-project] button')].find((b) => b.textContent === 'Archive')!
    await act(async () => (archive as HTMLButtonElement).click())
    await waitFor(() => !document.querySelector('[data-review-project]'))
    expect((await db.projects.get(garage))!.archived).toBe(true)
    expect((await db.outbox.toArray()).some((o) => o.entity === 'project' && o.entityId === garage && o.field === 'archived' && o.value === true)).toBe(true)
    await r.unmount()
  })
})

describe('sidebar Review entry', () => {
  it('nine days after the last review carries a due marker with a text alternative', async () => {
    await db.review.put({ id: 'me', completed_at: NOW.getTime() - 9 * 86_400_000, _clock: {} })
    localStorage.setItem('ot.sidebar.more', '1')
    // The inline More group (a touch screen; the desktop menu shows the marker as the item's description).
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: !/pointer:\s*fine/.test(q), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    onTestFinished(() => { window.matchMedia = original })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-review-due]')?.textContent?.includes('9 days ago'))
    const entry = r.container.querySelector('[data-destination="review"]')!
    expect(entry.textContent).toContain('Due')
    expect(entry.textContent).toContain('the last weekly review was 9 days ago')
    await db.review.put({ id: 'me', completed_at: NOW.getTime() - 2 * 86_400_000, _clock: {} })
    await waitFor(() => !r.container.querySelector('[data-review-due]'))
    expect(r.container.querySelector('[data-review-ago]')!.textContent).toBe('2 days ago')
    await r.unmount()
  })

  it('never reviewed: the closed More group shows the marker too', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-review-due-more]'))
    await r.unmount()
  })
})
