// @vitest-environment happy-dom
// The Focus screen in the shell (OpenSpec change focus-mode, tasks 4.2-4.4): the
// task it shows and how it moves on, the session keys, leaving and coming back,
// typing, the menu, the announcements and the done state's focus.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { applyOps, createTask, mutate, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { readFocus } from '../../lib/focus/state'
import type { Op, User } from '../../lib/types'
import { click, flush, key, render, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate, parseRoute, routePath } from '../router'
import { Shell } from '../Shell'
import { setDateTime } from '../../lib/dates'
import { FocusTask } from './FocusParts'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const T0 = new Date(2026, 9, 14, 9, 0).getTime()
const MIN = 60_000
const TODAY = '2026-10-14'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  await setCurrentUserId('u1')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  navigate({ view: 'inbox' }, { replace: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  document.body.innerHTML = ''
})

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const shownTask = () => q('[data-focus-task] h2')?.textContent
const clock = () => q('[data-focus-clock]')?.textContent
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(text))
/** Move the fake clock and let the screen re-read it (it does on focus and when the tab is shown). */
async function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms)
  window.dispatchEvent(new Event('focus'))
  await flush(30)
}
async function focusList(...titles: string[]) {
  const ids: string[] = []
  for (const title of titles) ids.push(await createTask({ title }))
  await mutate('review', 'me', { focus_date: TODAY, focus: ids.join(',') })
  return ids
}
async function shell(route: Parameters<typeof navigate>[0] = { view: 'focus' }) {
  navigate(route)
  return render(<Shell user={user} onLogout={() => {}} />)
}

describe('the route', () => {
  it('parses and prints /focus and /focus/<id>', () => {
    expect(parseRoute('/focus')).toEqual({ view: 'focus' })
    expect(parseRoute('/focus/abc')).toEqual({ view: 'focus', id: 'abc' })
    expect(routePath({ view: 'focus', id: 'abc' })).toBe('/focus/abc')
    expect(routePath({ view: 'focus' })).toBe('/focus')
  })
})

describe('task selection', () => {
  it('Open from a task: the panel menu opens /focus/<id> with the notes and subtasks, the timer ready', async () => {
    const id = await createTask({ title: 'Write the report', description: 'Outline first' })
    await createTask({ title: 'Collect the numbers', parent_id: id })
    const r = await shell({ view: 'task', id })
    await waitFor(() => !!q('button[aria-label="Task actions"]'), 'task page')
    await click(q('button[aria-label="Task actions"]')!)
    await waitFor(() => !!q('[data-menu-label="Focus on this task"]'), 'menu item')
    await click(q('[data-menu-label="Focus on this task"]')!)
    await waitFor(() => shownTask() === 'Write the report', 'focus screen')
    expect(location.pathname).toBe(`/focus/${id}`)
    expect(q('[data-focus-notes]')?.textContent).toContain('Outline first')
    await waitFor(() => !!q('[data-focus-subtasks]')?.textContent?.includes('Collect the numbers'), 'subtasks')
    expect(q('[data-focus-timer]')?.dataset.focusTimer).toBe('idle')
    expect(clock()).toBe('25:00')
    await r.unmount()
  })

  it('From the focus list: g Shift+F shows A, and completing A moves on to B', async () => {
    const [a] = await focusList('A', 'B', 'C')
    const r = await shell({ view: 'inbox' })
    await key(document.body, 'g')
    await key(document.body, 'F', { shiftKey: true })
    await waitFor(() => shownTask() === 'A', 'first focus task')
    await key(document.body, 'Enter')
    await waitFor(() => shownTask() === 'B', 'next focus task')
    await waitFor(async () => !!(await db.tasks.get(a))?.completed_at, 'A completed')
    expect(q('[data-focus-done]')?.textContent).toContain('A')
    await r.unmount()
  })

  it('Focus done: completing C, the last open task of today\'s focus, says so and offers the picker', async () => {
    const [a, b, c] = await focusList('A', 'B', 'C')
    await mutate('task', a, { completed_at: T0 })
    await mutate('task', b, { completed_at: T0 })
    const r = await shell({ view: 'focus', id: c })
    await waitFor(() => shownTask() === 'C', 'C')
    await click(q('[data-focus-complete]')!)
    await waitFor(() => q('#focus-done-heading')?.textContent === 'Today’s focus is done.', 'focus done')
    expect(button('Choose a task')).toBeTruthy()
    expect(location.pathname).toBe('/focus')
    await r.unmount()
  })

  it('No focus chosen: the picker is offered, with the Daily check link in the Open Loops modes', async () => {
    await createTask({ title: 'Loose task' })
    const r = await shell()
    await waitFor(() => !!q('[data-empty-state="focus"]'), 'empty state')
    expect(q('[data-empty-state="focus"]')!.textContent).not.toContain('Daily check')
    await mutate('user_prefs', 'me', { method_mode: 'companion' })
    await waitFor(() => !!q('[data-empty-state="focus"]')!.textContent?.includes('Daily check'), 'method link')
    await click(button('Choose a task')!)
    await waitFor(() => !!q('[role="dialog"]')?.textContent?.includes('Loose task'), 'picker')
    await r.unmount()
  })

  it('No list keys on the Focus screen: c and j do nothing', async () => {
    const [a] = await focusList('A', 'B')
    const r = await shell()
    await waitFor(() => shownTask() === 'A')
    await key(document.body, 'c')
    await key(document.body, 'j')
    await flush(30)
    expect(shownTask()).toBe('A')
    expect((await db.tasks.get(a))!.completed_at).toBeNull()
    expect(await readFocus()).toBeNull()
    await r.unmount()
  })

  it('Unknown or closed task: says so and falls back to the focus list', async () => {
    await focusList('A')
    const r = await shell({ view: 'focus', id: 'nope' })
    await waitFor(() => shownTask() === 'A', 'fallback')
    expect(document.body.textContent).toContain('That task is not available any more')
    await r.unmount()
  })
})

describe('a running session', () => {
  it('Start and pause: Space twice two seconds apart runs two seconds, then Paused and Resume', async () => {
    await focusList('A')
    const r = await shell()
    await waitFor(() => shownTask() === 'A')
    await key(document.body, ' ')
    await waitFor(() => q('[data-focus-timer]')?.dataset.focusTimer === 'work', 'running')
    await advance(2000)
    await key(document.body, ' ')
    await waitFor(() => q('[data-focus-phase]')?.textContent === 'Paused', 'paused')
    expect(q('[data-focus-toggle]')?.textContent).toBe('Resume')
    expect(clock()).toBe('24:58')
    await r.unmount()
  })

  it('Complete the task: Enter completes it, ends the session and shows the time worked', async () => {
    const [a] = await focusList('A')
    const r = await shell()
    await waitFor(() => shownTask() === 'A')
    await key(document.body, ' ')
    await waitFor(() => !!q('[data-running]'))
    await advance(12 * MIN)
    await key(document.body, 'Enter')
    await waitFor(() => !!q('[data-focus-done="complete"]'), 'done')
    expect(q('[data-focus-worked]')?.textContent).toBe('12:00 worked')
    await waitFor(async () => !!(await db.tasks.get(a))?.completed_at, 'completed')
    await r.unmount()
  })

  it('Leave and come back: Esc shows the previous view, and g Shift+F the same task five minutes further', async () => {
    await focusList('A', 'B')
    const r = await shell({ view: 'today' })
    navigate({ view: 'focus' })
    await waitFor(() => shownTask() === 'A')
    await key(document.body, ' ')
    await waitFor(() => !!q('[data-running]'))
    // Esc has its visible button too: Back, in the header or the phone bar.
    expect(q('[data-page-back]')).toBeTruthy()
    await key(document.body, 'Escape')
    await waitFor(() => location.pathname === '/today', 'previous view')
    await advance(5 * MIN)
    await key(document.body, 'g')
    await key(document.body, 'F', { shiftKey: true })
    await waitFor(() => shownTask() === 'A' && !!q('[data-running]'), 'back')
    expect(clock()).toBe('20:00')
    await r.unmount()
  })

  it('Typing is not intercepted: Space in the subtask field types', async () => {
    await focusList('A')
    const r = await shell()
    await waitFor(() => shownTask() === 'A')
    const input = q<HTMLInputElement>('[data-add-subtask] input')!
    input.focus()
    await key(input, ' ')
    await flush(20)
    expect(q('[data-focus-timer]')?.dataset.focusTimer).toBe('idle')
    expect(await readFocus()).toBeNull()
    await r.unmount()
  })

  it('Task completed elsewhere: the session ends, the done state names it and the next task is offered', async () => {
    const [a] = await focusList('A', 'B')
    const r = await shell()
    await waitFor(() => shownTask() === 'A')
    await key(document.body, ' ')
    await waitFor(() => !!q('[data-running]'))
    await applyOps([{ id: 'r1', entity: 'task', entityId: a, field: 'completed_at', value: Date.now(), ts: Date.now() + 3_600_000, device: 'phone' } as Op])
    await waitFor(() => !!q('[data-focus-done="complete"]'), 'done')
    expect(q('[data-focus-done]')?.textContent).toContain('A')
    expect(shownTask()).toBe('B')
    expect(button('Start the next session')).toBeTruthy()
    await r.unmount()
  })

  it('Notes edited elsewhere: the notes change without a reload and the timer keeps running', async () => {
    const [a] = await focusList('A')
    await mutate('task', a, { description: 'Old notes' })
    const r = await shell()
    await waitFor(() => !!q('[data-focus-notes]')?.textContent?.includes('Old notes'))
    await key(document.body, ' ')
    await waitFor(() => !!q('[data-running]'))
    await applyOps([{ id: 'n1', entity: 'task', entityId: a, field: 'description', value: 'New notes', ts: Date.now() + 3_600_000, device: 'phone' } as Op])
    await waitFor(() => !!q('[data-focus-notes]')?.textContent?.includes('New notes'), 'notes')
    expect(q('[data-running]')).toBeTruthy()
    await r.unmount()
  })

  it('Menu: the three modes with the current one checked, Change task, Settings and Help; modes disabled while running', async () => {
    await focusList('A')
    const r = await shell()
    await waitFor(() => shownTask() === 'A')
    await click(q('button[aria-label="More actions"]')!)
    await waitFor(() => !!q('[data-menu-label="Pomodoro"]'))
    const labels = [...document.querySelectorAll('[role="menu"] [data-menu-label]')].map((x) => x.getAttribute('data-menu-label'))
    expect(labels).toEqual(['Pomodoro', 'Flowtime', 'Countdown', 'Change task', 'Settings', 'Help'])
    expect(q('[data-menu-label="Pomodoro"]')?.getAttribute('aria-checked')).toBe('true')
    await key(document.body, 'Escape')
    await click(q('[data-focus-toggle]')!)
    await waitFor(() => !!q('[data-running]'))
    await click(q('button[aria-label="More actions"]')!)
    await waitFor(() => !!q('[data-menu-label="Flowtime"]'))
    expect(q<HTMLButtonElement>('[data-menu-label="Flowtime"]')!.disabled).toBe(true)
    await r.unmount()
  })
})

describe('accessibility', () => {
  it('Announcements: the time left at 25, 20, 15, 10, 5 and 1 minute and the end, nothing between', async () => {
    await focusList('A')
    const r = await shell()
    await waitFor(() => shownTask() === 'A')
    const live = () => q('[data-focus-live]')!.textContent
    const said: string[] = []
    const note = () => { const s = live() ?? ''; if (s && s !== said[said.length - 1]) said.push(s) }
    await key(document.body, ' ')
    await waitFor(() => live() === '25 minutes left')
    note()
    for (let m = 1; m <= 26; m++) {
      await advance(MIN)
      note()
    }
    expect(said).toEqual(['25 minutes left', '20 minutes left', '15 minutes left', '10 minutes left', '5 minutes left', '1 minute left', 'Session done'])
    expect(q('[data-focus-clock]')?.getAttribute('aria-hidden')).toBe('true')
    await r.unmount()
  })

  it('Done state focus: the end moves focus to the done state\'s first action', async () => {
    await focusList('A')
    const r = await shell()
    await waitFor(() => shownTask() === 'A')
    await key(document.body, ' ')
    await waitFor(() => !!q('[data-running]'))
    await advance(25 * MIN)
    await waitFor(() => !!q('[data-focus-done="work"]'), 'done')
    await waitFor(() => (document.activeElement as HTMLElement | null)?.dataset.doneAction === 'break', 'focus on Start the break')
    expect([...document.querySelectorAll('[data-done-action]')].map((b) => b.textContent)).toEqual(['Start the break', 'Complete the task', 'Next task'])
    expect(q('[data-focus-worked]')?.textContent).toBe('25:00 worked')
    await r.unmount()
  })
})

describe('the task\'s due (ux-feedback-2)', () => {
  afterEach(() => setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }))

  it('follows the 12-hour format instead of showing 15:00', async () => {
    setDateTime({ date_format: 'day-month', time_format: '12h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
    const id = await createTask({ title: 'Call the bank', due: { date: TODAY, time: '15:00' } })
    const r = await render(<FocusTask task={(await db.tasks.get(id))!} />)
    const text = r.container.querySelector('[data-focus-task] p')?.textContent ?? ''
    expect(text).toMatch(/3:00\sPM/)
    expect(text).not.toContain('15:00')
    await r.unmount()
  })
})
