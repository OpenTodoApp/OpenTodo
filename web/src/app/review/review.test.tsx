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
import { createProject, createTask, resetDeviceId, REVIEW_DEFAULTS, setTaskCompleted } from '../../lib/ops'
import { closeDay } from '../../lib/review'
import { compute, periodFor, PERIOD_LABELS } from '../../lib/stats'
import type { Task, User } from '../../lib/types'
import { flush, key, render, type } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'
import { Sidebar } from '../Sidebar'
import { setMethodMode } from '../../lib/method/mode'
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

const stepTitle = () => document.querySelector<HTMLElement>('#review-step-title')
const currentStep = () => document.querySelector('[data-progress-step][aria-current="step"]')?.getAttribute('data-progress-step')

describe('Weekly review', () => {
  it('keyboard path: g r, ] to Projects, q adds a next action and r marks the project reviewed', async () => {
    await createTask({ title: 'Unsorted idea' })
    const garage = await createProject({ name: 'Garage' })
    const sweep = await createTask({ title: 'Sweep', project_id: garage })
    await setTaskCompleted(sweep, true)
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Unsorted idea'))
    await key(document.body, 'g')
    await key(document.body, 'r')
    await waitFor(() => !!stepTitle())
    // It opens on the first unfinished step, the Inbox of Get clear, with focus on its title.
    expect(currentStep()).toBe('clear')
    expect(document.querySelector('[data-review-position]')!.textContent).toBe('Step 1 of 7 · Get clear')
    expect(document.activeElement).toBe(stepTitle())
    for (let i = 0; i < 4; i++) await key(document.activeElement!, ']')
    expect(currentStep()).toBe('projects')
    expect(stepTitle()!.textContent).toBe('Projects')
    expect(document.activeElement).toBe(stepTitle())
    await waitFor(() => !!document.querySelector('[data-walk-card]'))
    expect(document.querySelector('[data-walk-card]')!.textContent).toContain('Garage')
    expect(document.querySelector('[data-walk-card]')!.textContent).toContain('No next action')
    await key(document.activeElement!, 'q')
    await waitFor(() => !!document.querySelector('[role="dialog"] input'))
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await type(input, 'Buy shelf brackets')
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => document.querySelector('[data-walk-next]')?.textContent === 'Buy shelf brackets')
    const added = (await db.tasks.toArray()).find((t) => t.title === 'Buy shelf brackets')!
    expect(added.project_id).toBe(garage)
    await key(document.body, 'r')
    await waitFor(() => !!document.querySelector('[data-walk-summary]'))
    expect((await db.prefs.get(garage))?.reviewed_at).toBe(NOW.getTime())
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

  it('finishing writes the review op, shows the time and returns focus to the step', async () => {
    navigate({ view: 'review' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!stepTitle())
    // Nothing to do: every step is done, the all-clear card says so, and Finish review is the primary action.
    expect(r.container.querySelector('[data-review-all-clear]')!.textContent).toContain('Every step is done')
    const finish = [...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Finish review')!
    expect(finish.className).toContain('primary')
    await act(async () => finish.click())
    await waitFor(() => !!r.container.querySelector('[data-testid="review-finished"]'))
    expect((await db.review.get('me'))?.completed_at).toBe(NOW.getTime())
    const queued = (await db.outbox.toArray()).filter((o) => o.entity === 'review')
    expect(queued.map((o) => [o.entityId, o.field, o.value])).toEqual([['me', 'completed_at', NOW.getTime()]])
    expect(document.activeElement).toBe(stepTitle())
    expect(r.container.querySelector('[data-review-all-clear]')!.textContent).toContain('See you next week')
    await r.unmount()
  })

  it('archiving offline from the walk archives at once and queues the op', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const garage = await createProject({ name: 'Garage' })
    navigate({ view: 'review', step: 'projects' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-walk-card]'))
    expect(currentStep()).toBe('projects')
    await act(async () => document.querySelector<HTMLButtonElement>('[data-walk-action="archive"]')!.click())
    await waitFor(() => !document.querySelector('[data-walk-card]'))
    expect((await db.projects.get(garage))!.archived).toBe(true)
    expect((await db.outbox.toArray()).some((o) => o.entity === 'project' && o.entityId === garage && o.field === 'archived' && o.value === true)).toBe(true)
    await r.unmount()
  })
})

describe('Weekly review stepper', () => {
  it('a circle in the progress opens its step; [ and the Back button go back; Next names the next step', async () => {
    await createTask({ title: 'Unsorted idea' })
    navigate({ view: 'review' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => currentStep() === 'clear')
    const someday = document.querySelector<HTMLButtonElement>('[data-progress-step="someday"]')!
    expect(someday.textContent).toBe('Get creative: Someday, done')
    expect(document.querySelector('[data-progress-step="clear"]')!.textContent).toBe('Get clear: Inbox, 1 left')
    await act(async () => someday.click())
    expect(currentStep()).toBe('someday')
    expect(document.querySelector('[data-review-position]')!.textContent).toBe('Step 7 of 7 · Get creative')
    expect(document.activeElement).toBe(stepTitle())
    // The last step offers Finish review instead of Next.
    expect(document.querySelector('[data-review-next]')).toBeNull()
    expect(document.querySelector('[data-review-finish]')).not.toBeNull()
    await key(document.activeElement!, '[')
    expect(currentStep()).toBe('ahead')
    await act(async () => document.querySelector<HTMLButtonElement>('[data-review-back]')!.click())
    expect(currentStep()).toBe('projects')
    expect(document.querySelector('[data-review-next]')!.textContent).toBe('Next: Look ahead')
    await r.unmount()
  })

  it('the first step has no Back, and ] on the last step does nothing', async () => {
    navigate({ view: 'review', step: 'clear' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => currentStep() === 'clear')
    expect(document.querySelector('[data-review-back]')).toBeNull()
    expect(document.querySelector('[data-review-next]')!.textContent).toBe('Next: Mind sweep')
    await act(async () => document.querySelector<HTMLButtonElement>('[data-progress-step="someday"]')!.click())
    await key(document.activeElement!, ']')
    expect(currentStep()).toBe('someday')
    await r.unmount()
  })

  it('finishing from the last step records the review', async () => {
    navigate({ view: 'review', step: 'someday' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => currentStep() === 'someday')
    await act(async () => document.querySelector<HTMLButtonElement>('[data-review-finish]')!.click())
    await waitFor(() => !!r.container.querySelector('[data-testid="review-finished"]'))
    expect((await db.review.get('me'))?.completed_at).toBe(NOW.getTime())
    await r.unmount()
  })
})

describe('sidebar Review entry', () => {
  it('nine days after the last review carries a due marker with a text alternative', async () => {
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 9 * 86_400_000, _clock: {} })
    localStorage.setItem('ot.sidebar.more', '1')
    // The inline More group (a touch screen; the desktop menu shows the marker as the item's description).
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: !/pointer:\s*fine/.test(q), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    onTestFinished(() => { window.matchMedia = original })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-review-due]')?.textContent?.includes('9 days ago'))
    // One dot, never a badge; its words are part of the entry's name (quiet-sidebar D4).
    const entry = r.container.querySelector('[data-destination="review"]')!
    expect(entry.querySelector('[data-review-due] [data-dot]')).not.toBeNull()
    expect(entry.textContent).toBe('Review, Review due · last weekly review 9 days ago')
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 2 * 86_400_000, _clock: {} })
    await waitFor(() => !r.container.querySelector('[data-review-due]'))
    // Nothing due: no marker, when the last review was is the entry's description.
    expect(r.container.querySelector('[data-destination="review"]')!.getAttribute('aria-description')).toBe('Last review 2 days ago')
    await r.unmount()
  })

  it('never reviewed: the closed More group shows the marker too', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-review-due-more]'))
    await r.unmount()
  })
})

describe('rhythm markers (open-loops-method 5.6)', () => {
  const inline = () => {
    localStorage.setItem('ot.sidebar.more', '1')
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: !/pointer:\s*fine/.test(q), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    onTestFinished(() => { window.matchMedia = original })
  }

  it('Lists only: no marker for the Daily check or the Monthly look', async () => {
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 86_400_000, _clock: {} })
    inline()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => r.container.querySelector('[data-destination="review"]')?.getAttribute('aria-description') === 'Last review yesterday')
    expect(r.container.querySelector('[data-review-due]')).toBeNull()
    expect(r.container.querySelector('[data-review-due-more]')).toBeNull()
    await r.unmount()
  })

  it('Open Loops first: the Review entry names the due Daily check and Monthly look', async () => {
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 86_400_000, _clock: {} })
    await setMethodMode('first')
    inline()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-review-due]')?.textContent?.includes('the Monthly look is due; the Daily check is due'))
    expect(r.container.querySelector('[data-review-due]')!.textContent).not.toContain('weekly')
    await r.unmount()
  })

  it('Open Loops first in the morning: the Daily check is offered once a day on this device', async () => {
    await setMethodMode('first')
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-daily-toast]'))
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[data-daily-toast] button')].find((b) => b.textContent === 'Not today')!.click())
    expect(document.querySelector('[data-daily-toast]')).toBeNull()
    await r.unmount()
    const again = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(100)
    expect(document.querySelector('[data-daily-toast]')).toBeNull()
    await again.unmount()
  })

  // Close the day (close-the-day 5.3): "Day closed" for the rest of the local day; a due marker wins.
  it('Day closed in the evening: the Review entry says "Day closed" with the time until the local date changes', async () => {
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 86_400_000, _clock: {} })
    inline()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    const entry = () => r.container.querySelector('[data-destination="review"]')?.getAttribute('aria-description') ?? ''
    await waitFor(() => entry() === 'Last review yesterday')
    await act(async () => { await closeDay('') })
    await waitFor(() => /^Day closed, (12:00|12:00\sPM)$/.test(entry()))
    await r.unmount()
    vi.setSystemTime(new Date(2026, 9, 15, 9, 0))
    const next = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => next.container.querySelector('[data-destination="review"]')?.getAttribute('aria-description') === 'Last review 2 days ago')
    await next.unmount()
  })

  it('Day closed while the weekly review is due: the due marker stays and its text also says the day is closed', async () => {
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 9 * 86_400_000, closed_at: NOW.getTime(), _clock: {} })
    inline()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-review-due]')?.textContent?.includes('the day is closed'))
    expect(r.container.querySelector('[data-review-due]')!.textContent).toContain('Review due · last weekly review 9 days ago; the day is closed')
    await r.unmount()
  })
})
