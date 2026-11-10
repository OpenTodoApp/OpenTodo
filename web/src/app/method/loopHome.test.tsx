// @vitest-environment happy-dom
// The Loop home (OpenSpec changes loop-home-refresh and loop-guided-dashboard; open-loops "Loop home").
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { applyOps, createProject, createTask, resetDeviceId, REVIEW_DEFAULTS } from '../../lib/ops'
import type { Op, User } from '../../lib/types'
import { click, key, minWidthPx, render, spokenText, type, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 8, 0)
const DAY = 86_400_000

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

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const step = (move: string) => q(`[data-loop-step="${move}"]`)!
const stepButton = (move: string) => step(move).querySelector('button')!
/** The step's name and count, as assistive technology reads it. */
const says = (move: string) => (q(`[data-loop-step="${move}"]`) ? spokenText(stepButton(move)) : '')
const reason = () => q('[data-loop-reason]')?.textContent ?? ''
const actions = () => [...document.querySelectorAll<HTMLButtonElement>('[data-loop-action]')]
const lit = () => [...document.querySelectorAll('[data-loop-up]')].map((x) => x.getAttribute('data-loop-step'))
const openMove = () => q('[data-loop-move]')?.getAttribute('data-loop-move') ?? null
/** The router keeps its address across tests: start from the Inbox so the Loop home is a new history entry, as from a link. */
const open = async (move?: 'catch' | 'clarify' | 'place' | 'do' | 'review') => {
  navigate({ view: 'inbox' }, { replace: true })
  navigate({ view: 'loop', ...(move ? { move } : {}) })
  return render(<Shell user={user} onLogout={() => {}} />)
}

describe('Loop home', () => {
  it('Morning on the Loop home: the Next step card names Clarify and why, the stepper counts, and the button opens triage in place', async () => {
    for (let i = 0; i < 7; i++) await createTask({ title: `Idea ${i}` })
    await createProject({ name: 'Garage' })
    await createProject({ name: 'Garden' })
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 9 * DAY, _clock: {} })
    const r = await open()
    await waitFor(() => says('catch').includes('7 in the Inbox'), 'the counts')
    expect(reason()).toBe('7 things in the Inbox are waiting.')
    expect(actions().map((b) => b.textContent)).toEqual(['Clarify'])
    expect(says('clarify')).toContain('7 to decide')
    expect(says('place')).toContain('2 projects without a next action')
    expect(says('review')).toContain('Weekly review: due')
    expect(step('review').textContent).toContain('due')
    expect([...document.querySelectorAll('[data-loop-step] button > span:first-child')].map((h) => h.textContent)).toEqual(['Catch', 'Clarify', 'Place', 'Do', 'Review'])
    expect(lit()).toEqual(['clarify'])
    // At /loop no move is open, and the page has no capture field outside Catch.
    expect(openMove()).toBeNull()
    expect(q('[data-loop-capture]')).toBeNull()
    const axe = (await import('axe-core')).default
    const res = await axe.run(q('[data-loop-stepper]')!.closest('nav')!, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await click(actions()[0])
    await waitFor(() => location.pathname === '/loop/clarify' && !!q('[data-loop-move="clarify"] [data-triage-card]'), 'triage in place')
    expect(q('[data-loop-left]')?.textContent).toBe('7 left')
    expect(stepButton('clarify').getAttribute('aria-expanded')).toBe('true')
    // The page did not change: the card and the stepper are still there.
    expect(q('[data-loop-next]')).not.toBeNull()
    await r.unmount()
  })

  it('Review before Do: with the loops clear but the weekly review due, the card names the review and opens its screen', async () => {
    const garage = await createProject({ name: 'Garage' })
    await createTask({ title: 'Measure wall', project_id: garage })
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 9 * DAY, daily_at: NOW.getTime() - 3_600_000, monthly_at: NOW.getTime() - 5 * DAY, _clock: {} })
    const r = await open()
    await waitFor(() => reason() === 'Your weekly review is due.', 'the review reason')
    expect(actions().map((b) => b.textContent)).toEqual(['Start the weekly review'])
    expect(lit()).toEqual(['review'])
    await click(actions()[0])
    await waitFor(() => location.pathname === '/review')
    await r.unmount()
  })

  it('Capture from the Loop home: Catch holds the labelled field; the task is in the Inbox, counts rise, it is first among the latest and focus stays', async () => {
    await createTask({ title: 'Earlier idea' })
    const r = await open()
    await waitFor(() => says('catch').includes('1 in the Inbox'))
    await click(stepButton('catch'))
    await waitFor(() => location.pathname === '/loop/catch' && !!q('[data-loop-capture] textarea'), 'Catch open')
    expect(q('[data-loop-part="catch"]')!.textContent).toContain('Catch into the Inbox')
    const input = q<HTMLTextAreaElement>('[data-loop-capture] textarea')!
    expect(input.getAttribute('aria-label')).toBe('Catch into the Inbox')
    input.focus()
    vi.setSystemTime(NOW.getTime() + 60_000)
    await type(input, 'Call the plumber')
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => says('catch').includes('2 in the Inbox'), 'Catch rises')
    expect(says('clarify')).toContain('2 to decide')
    await waitFor(() => (q('[data-loop-latest] [data-task-id]')?.textContent ?? '').includes('Call the plumber'), 'first among the latest')
    const added = (await db.tasks.toArray()).find((t) => t.title === 'Call the plumber')!
    expect(added.project_id).toBeNull()
    expect(document.activeElement).toBe(input)
    await r.unmount()
  })

  it('Next move moves on: emptying the Inbox in Clarify leaves a done mark, and the card names Place', async () => {
    await createProject({ name: 'Garage' })
    await createTask({ title: 'Only idea' })
    const r = await open('clarify')
    await waitFor(() => !!q('[data-loop-move="clarify"] [data-triage-card]'), 'the triage card')
    expect(q('[data-loop-left]')?.textContent).toBe('1 left')
    await key(document.body, 'c')
    await waitFor(() => !!step('clarify').querySelector('[data-loop-done]'), 'Clarify done')
    await waitFor(() => reason() === '1 project has no next action.', 'Place next')
    expect(actions().map((b) => b.textContent)).toEqual(['Walk your projects'])
    expect(lit()).toEqual(['place'])
    expect(step('catch').querySelector('[data-loop-done]')).not.toBeNull()
    await waitFor(() => !!q('[data-loop-move="clarify"] [data-empty-state="triage"]'), 'the done state in Clarify')
    await r.unmount()
  })

  it('The embedded triage card: decisions with their keys, "n left", its keys only while Clarify is open, and Esc closes the move', async () => {
    for (const title of ['First', 'Second', 'Third']) await createTask({ title })
    const r = await open()
    await waitFor(() => says('clarify').includes('3 to decide'))
    // Closed: the triage keys do nothing on the Loop home.
    await key(document.body, 'c')
    expect((await db.tasks.toArray()).filter((x) => x.completed_at)).toHaveLength(0)
    await click(actions()[0])
    await waitFor(() => !!q('[data-loop-move="clarify"] [data-triage-card]'), 'the card')
    expect(q('[data-loop-left]')?.textContent).toBe('3 left')
    expect([...document.querySelectorAll('[data-loop-move] [data-decision]')].map((b) => b.getAttribute('data-decision'))).toContain('schedule')
    await key(document.body, 't')
    await waitFor(() => q('[data-loop-left]')?.textContent === '2 left', 'one decided')
    expect((await db.tasks.toArray()).filter((x) => x.due?.date === '2026-10-14')).toHaveLength(1)
    await key(document.body, 'Escape')
    await waitFor(() => location.pathname === '/loop' && openMove() === null, 'closed by Esc')
    await r.unmount()
  })

  it('Loop closed: done marks, the card names Do with "Go to Next", and nothing is disabled', async () => {
    const garage = await createProject({ name: 'Garage' })
    await createTask({ title: 'Measure wall', project_id: garage })
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - DAY, daily_at: NOW.getTime() - 3_600_000, monthly_at: NOW.getTime() - 5 * DAY, _clock: {} })
    const r = await open()
    await waitFor(() => reason() === '1 next action is ready.', 'Do next')
    expect(actions().map((b) => b.textContent)).toEqual(['Go to Next'])
    expect(lit()).toEqual(['do'])
    for (const m of ['catch', 'clarify', 'place', 'review']) expect(step(m).querySelector('[data-loop-done]'), m).not.toBeNull()
    expect(says('review')).toContain('Daily check: done today')
    expect(document.querySelectorAll('main button:disabled')).toHaveLength(0)
    await click(actions()[0])
    await waitFor(() => location.pathname === '/loop/do' && !!q('[data-loop-part="do"]'), 'Do in place')
    await r.unmount()
  })

  it('Every loop closed: the card says so and offers to catch something', async () => {
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - DAY, daily_at: NOW.getTime() - 3_600_000, monthly_at: NOW.getTime() - 5 * DAY, _clock: {} })
    const r = await open()
    await waitFor(() => reason() === 'Your loops are closed.', 'closed')
    expect(actions().map((b) => b.textContent)).toEqual(['Catch something'])
    await click(actions()[0])
    await waitFor(() => location.pathname === '/loop/catch' && !!q('[data-loop-capture]'), 'Catch in place')
    await r.unmount()
  })

  it('A capture from another device raises Catch and Clarify without a reload, and the card follows', async () => {
    const r = await open()
    await waitFor(() => says('catch').includes('The Inbox is empty'))
    await applyOps([
      { id: 'c1', entity: 'task', entityId: 'remote', field: 'title', value: 'From the phone', ts: NOW.getTime(), device: 'phone' },
      { id: 'c2', entity: 'task', entityId: 'remote', field: 'created_at', value: NOW.getTime(), ts: NOW.getTime(), device: 'phone' },
    ] as Op[])
    await waitFor(() => says('catch').includes('1 in the Inbox'))
    expect(says('clarify')).toContain('1 to decide')
    await waitFor(() => reason() === '1 thing in the Inbox is waiting.')
    await r.unmount()
  })

  it('Keyboard path: g Shift+L, the stepper with → three times and Enter opens Do at /loop/do; Back closes it with focus on Do', async () => {
    const garage = await createProject({ name: 'Garage' })
    await createTask({ title: 'Measure wall', project_id: garage })
    navigate({ view: 'inbox' }, { replace: true })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!q('main h1'), 'the Inbox')
    await key(document.body, 'g')
    await key(document.body, 'L', { shiftKey: true })
    await waitFor(() => location.pathname === '/loop' && !!q('[data-loop-step="do"]'))
    // One tab stop: the first step.
    expect([...document.querySelectorAll('[data-loop-step] button')].map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1'])
    stepButton('catch').focus()
    for (let i = 0; i < 3; i++) await key(document.activeElement!, 'ArrowRight')
    expect(document.activeElement).toBe(stepButton('do'))
    // Enter on a button is its click.
    await click(document.activeElement!)
    await waitFor(() => location.pathname === '/loop/do' && !!q('[data-loop-part="do"]'), 'Do in place')
    expect(stepButton('do').getAttribute('aria-expanded')).toBe('true')
    ;(document.activeElement as HTMLElement | null)?.blur()
    await act(async () => history.back())
    await waitFor(() => location.pathname === '/loop' && openMove() === null, 'closed by Back')
    await waitFor(() => document.activeElement === stepButton('do'), 'focus on Do')
    await r.unmount()
  })

  it('Activating the open step closes it, and Esc closes a move too', async () => {
    const r = await open()
    await waitFor(() => !!q('[data-loop-step="review"]'))
    await click(stepButton('review'))
    await waitFor(() => openMove() === 'review')
    await click(stepButton('review'))
    await waitFor(() => location.pathname === '/loop' && openMove() === null, 'closed by the step')
    await click(stepButton('place'))
    await waitFor(() => openMove() === 'place')
    // Switching moves replaces the address, so Back still closes to the Loop home.
    await click(stepButton('do'))
    await waitFor(() => location.pathname === '/loop/do')
    await key(stepButton('do'), 'Escape')
    await waitFor(() => location.pathname === '/loop' && openMove() === null, 'closed by Esc')
    await r.unmount()
  })

  it('Deep link: /loop/place shows the Loop home with Place open; an empty Inbox at /loop/clarify shows the done mark without a redirect', async () => {
    await createProject({ name: 'Garage' })
    let r = await open('place')
    await waitFor(() => !!q('[data-loop-part="place"]') && !!q('[data-loop-next]'), 'Place open')
    expect(stepButton('place').getAttribute('aria-expanded')).toBe('true')
    // Closing a deep-linked move replaces the address.
    await click(q('[data-loop-close]')!)
    await waitFor(() => location.pathname === '/loop' && openMove() === null)
    await r.unmount()
    r = await open('clarify')
    await waitFor(() => !!q('[data-loop-move="clarify"] [data-empty-state="triage"]'), 'Clarify done')
    expect(location.pathname).toBe('/loop/clarify')
    await r.unmount()
  })

  it('Add a next action in place: the task lands in that project, which leaves the list, and Place drops by one', async () => {
    const kitchen = await createProject({ name: 'Kitchen renovation' })
    await createProject({ name: 'Garage' })
    const r = await open('place')
    await waitFor(() => !!q(`[data-loop-add-next="${kitchen}"]`), 'the field')
    expect(says('place')).toContain('2 projects without a next action')
    const field = q<HTMLInputElement>(`[data-loop-add-next="${kitchen}"]`)!
    expect(field.getAttribute('aria-label')).toBe('Next action for Kitchen renovation')
    await type(field, 'Call the tiler')
    await act(async () => { field.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => !q(`[data-loop-project="${kitchen}"]`), 'the project leaves the list')
    expect(says('place')).toContain('1 project without a next action')
    const added = (await db.tasks.toArray()).find((t) => t.title === 'Call the tiler')!
    expect(added.project_id).toBe(kitchen)
    await r.unmount()
  })

  it('Do holds today’s focus with its indicator, or the Daily check offer, then next actions by context', async () => {
    const garage = await createProject({ name: 'Garage' })
    const measure = await createTask({ title: 'Measure wall', project_id: garage })
    let r = await open('do')
    await waitFor(() => !!q('[data-loop-part="do"]'))
    expect(q('[data-loop-focus]')!.textContent).toContain('No focus chosen today.')
    expect(q('[data-loop-focus]')!.textContent).toContain('Pick up to three in the Daily check')
    await waitFor(() => (q('[data-loop-context] [data-task-id]')?.textContent ?? '').includes('Measure wall'), 'the next action')
    await r.unmount()
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', focus_date: '2026-10-14', focus: measure, _clock: {} })
    r = await open('do')
    await waitFor(() => (q('[data-loop-focus-progress]')?.textContent ?? '') === '0 of 1 done', 'the focus indicator')
    await r.unmount()
  })

  it('Phone width: the five moves in one row, and an open move takes the screen as a page with Back', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: minWidthPx(query) <= 360, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    try {
      await createProject({ name: 'Garage' })
      const r = await open()
      await waitFor(() => !!q('[data-loop-stepper]'))
      expect(q('[data-loop-stepper]')!.className).toContain('grid-cols-5')
      expect(q('[data-loop-next]')).not.toBeNull()
      await click(stepButton('place'))
      await waitFor(() => !!q('[data-loop-part="place"]'), 'Place as a page')
      expect(q('[data-loop-next]')).toBeNull()
      expect(q('[data-loop-stepper]')).toBeNull()
      await r.unmount()
    } finally {
      window.matchMedia = original
    }
  })

  it('Close the day from the Review move: the link opens the first step; afterwards the line reads "Day: closed" and the next move is unchanged', async () => {
    const r = await open('review')
    await waitFor(() => !!q('[data-loop-day="open"]'))
    const up = lit()
    expect(step('catch').querySelector('[data-loop-done]')).not.toBeNull()
    expect([...document.querySelectorAll('[data-loop-rhythm]')].map((x) => x.getAttribute('data-loop-rhythm'))).toEqual(['daily', 'weekly', 'monthly'])
    const link = q<HTMLAnchorElement>('[data-loop-day="open"]')!
    expect(link.getAttribute('href')).toBe('/review/close')
    await click(link)
    await waitFor(() => location.pathname === '/review/close' && q('[data-review-step]')?.getAttribute('data-review-step') === 'done')
    const { closeDay } = await import('../../lib/review')
    await act(async () => { await closeDay('', (await import('../../lib/dates')).logicalToday()) })
    navigate({ view: 'loop', move: 'review' })
    await waitFor(() => (q('[data-loop-day="closed"]')?.textContent ?? '').startsWith('Day: closed'))
    expect(lit()).toEqual(up)
    expect(step('catch').querySelector('[data-loop-done]')).not.toBeNull()
    await r.unmount()
  })

  it('Day closed on another device: the Review move line changes without a reload', async () => {
    const r = await open('review')
    await waitFor(() => !!q('[data-loop-day="open"]'))
    await applyOps([{ id: 'dc', entity: 'review', entityId: 'me', field: 'closed_at', value: NOW.getTime(), ts: NOW.getTime(), device: 'phone' }] as Op[])
    await waitFor(() => !!q('[data-loop-day="closed"]'))
    await r.unmount()
  })
})
