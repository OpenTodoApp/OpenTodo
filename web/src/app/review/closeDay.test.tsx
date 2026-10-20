// @vitest-environment happy-dom
// Close the day on screen (OpenSpec change close-the-day, tasks 3.2, 4.2–4.4, 5.1,
// 5.3, 5.4): the entry points, the three steps, the carry-over batch with its one
// Undo, the close write, the Today row, the sidebar marker and yesterday's note.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId, REVIEW_DEFAULTS, setTaskCompleted } from '../../lib/ops'
import { closeDay } from '../../lib/review'
import { SHORTCUTS } from '../../lib/shortcuts'
import type { Task, User } from '../../lib/types'
import { click, flush, key, render, type } from '../../ui/test-utils'
import { hideBulkToast } from '../bulk/toastStore'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 18, 42)
const TODAY = '2026-10-14'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  hideBulkToast()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
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
const shell = async (route: Parameters<typeof navigate>[0]) => { navigate(route); return render(<Shell user={user} onLogout={() => {}} />) }
const stepOf = () => document.querySelector('[data-review-step]')?.getAttribute('data-review-step')
const titleEl = () => document.getElementById('review-step-title')
const figure = (k: string) => document.querySelector(`[data-close-figure="${k}"] dd`)?.textContent
const carryRow = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-carry-row]')].find((r) => r.textContent?.includes(title))!
const toast = () => document.querySelector('[data-bulk-toast]')?.textContent ?? ''
const task = async (id: string) => (await db.tasks.get(id)) as Task
const toCarry = async () => {
  await waitFor(() => stepOf() === 'summary')
  await key(document.body, ']')
  await waitFor(() => stepOf() === 'carry')
}

describe('Close the day is reachable', () => {
  it('From the end of Today: the row follows the last task and opens the first step with focus on its title', async () => {
    for (let i = 1; i <= 5; i++) await createTask({ title: `Task ${i}`, due: { date: TODAY } })
    const r = await shell({ view: 'today' })
    await waitFor(() => document.querySelectorAll('[data-task-id]').length === 5 && !!document.querySelector('[data-close-day]'))
    const row = document.querySelector('[data-close-day]')!
    const tasks = [...document.querySelectorAll('[data-task-id]')]
    expect(tasks[tasks.length - 1].compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.getAttribute('data-close-day')).toBe('open')
    await click(row.querySelector('button')!)
    await waitFor(() => location.pathname === '/review/close' && stepOf() === 'summary')
    await waitFor(() => document.activeElement === titleEl())
    expect(titleEl()!.textContent).toBe('How the day went')
    await r.unmount()
  })

  it('Keyboard path: g then Shift+D opens the screen; the cheat sheet lists it under Go to a view', async () => {
    const r = await shell({ view: 'inbox' })
    await flush(50)
    await key(document.body, 'g')
    await key(document.body, 'D', { shiftKey: true })
    await waitFor(() => location.pathname === '/review/close')
    expect(SHORTCUTS.find((s) => s.id === 'go.close')).toMatchObject({ keys: ['g Shift+D'], section: 'go', scope: 'global' })
    await r.unmount()
  })

  it('Already closed today: the row reads "Day closed, 18:42" and still opens the screen', async () => {
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', closed_at: NOW.getTime(), _clock: {} })
    const r = await shell({ view: 'today' })
    await waitFor(() => document.querySelector('[data-close-day]')?.getAttribute('data-close-day') === 'closed')
    const row = document.querySelector('[data-close-day]')!
    expect(row.textContent).toMatch(/Day closed, (18:42|6:42\sPM)/)
    await click(row.querySelector('button')!)
    await waitFor(() => location.pathname === '/review/close')
    await r.unmount()
  })
})

describe('Close the day steps', () => {
  it('A day with a focus: 8 planned, 5 done, focus 2 of 3 done', async () => {
    const ids: string[] = []
    for (let i = 1; i <= 8; i++) ids.push(await createTask({ title: `T${i}`, due: { date: TODAY } }))
    for (const id of ids.slice(0, 5)) await setTaskCompleted(id, true)
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', focus_date: TODAY, focus: [ids[0], ids[1], ids[6]].join(','), _clock: {} })
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => figure('planned') === '8' && figure('done') === '5')
    expect(figure('focus')).toBe('2 of 3 done')
    await r.unmount()
  })

  it('Nothing was planned: one line, and Next still leads to Carry over', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => !!document.querySelector('[data-close-empty]'))
    await click(document.querySelector('[data-review-next]')!)
    await waitFor(() => stepOf() === 'carry')
    expect(document.querySelector('[data-close-nothing]')).not.toBeNull()
    expect(document.querySelector('[data-close-apply]')).toBeNull()
    await r.unmount()
  })

  it('Walk the three steps: ] twice reaches "Step 3 of 3", the primary action is Close the day, focus follows the title', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'summary')
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'carry' && document.activeElement === titleEl())
    expect(titleEl()!.textContent).toBe('Carry over')
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'note' && document.activeElement === titleEl())
    expect(document.querySelector('[data-review-position]')!.textContent).toContain('Step 3 of 3')
    expect(document.querySelector('[data-review-finish]')!.textContent).toBe('Close the day')
    expect(document.querySelectorAll('[data-progress-step]')).toHaveLength(3)
    await key(document.body, '[')
    await waitFor(() => stepOf() === 'carry')
    await r.unmount()
  })
})

describe('Carry over', () => {
  it('Default carry-over: three tasks leave Today at once, one toast "3 tasks rescheduled", Ctrl+Z undoes in one step', async () => {
    const timed = await createTask({ title: 'Timed', due: { date: TODAY, time: '14:00' } })
    const overdue = await createTask({ title: 'Overdue', due: { date: '2026-10-12' } })
    const started = await createTask({ title: 'Started' })
    await db.tasks.update(started, { start: '2026-10-13' })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => document.querySelectorAll('[data-carry-row]').length === 3)
    expect(document.querySelector('[data-close-count]')!.textContent).toContain('Not applied')
    expect([...document.querySelectorAll('[data-carry-decision]')].map((g) => g.getAttribute('data-carry-decision'))).toEqual(['tomorrow', 'tomorrow', 'tomorrow'])
    // Below 640 px the group is a 2×2 grid under the row; inline from sm.
    expect(document.querySelector('[data-carry-decision]')!.className).toMatch(/grid-cols-2.*sm:flex/)
    await click(document.querySelector('[data-close-apply]')!)
    await waitFor(() => toast().includes('3 tasks rescheduled'))
    expect(toast()).toContain('Undo')
    expect((await task(timed)).due).toEqual({ date: '2026-10-15', time: '14:00' })
    expect((await task(overdue)).due).toEqual({ date: '2026-10-15' })
    expect([(await task(started)).due, (await task(started)).start]).toEqual([{ date: '2026-10-15' }, null])
    await waitFor(() => document.querySelectorAll('[data-carry-row]').length === 0)
    expect(await db.assistantUndo.count()).toBe(1)
    await key(document.body, 'z', { ctrlKey: true })
    await waitFor(() => toast().includes('3 restored'))
    expect((await task(timed)).due).toEqual({ date: TODAY, time: '14:00' })
    expect((await task(started)).start).toBe('2026-10-13')
    await r.unmount()
  })

  it('Mixed decisions: y, h and a picked Friday; y parks instead of tracking time; Undo restores the batch', async () => {
    const a = await createTask({ title: 'Alpha', due: { date: TODAY }, priority: 1 })
    const b = await createTask({ title: 'Bravo', due: { date: TODAY }, priority: 2 })
    const c = await createTask({ title: 'Charlie', due: { date: TODAY }, priority: 3 })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => document.querySelectorAll('[data-carry-row]').length === 3)
    await key(document.body, 'j')
    await key(document.body, 'y')
    await waitFor(() => carryRow('Alpha').querySelector('[data-carry-decision]')!.getAttribute('data-carry-decision') === 'someday')
    expect(await db.timeEntries.count()).toBe(0)
    await key(document.body, 'j')
    await key(document.body, 'h')
    await waitFor(() => carryRow('Bravo').querySelector('[data-carry-decision]')!.getAttribute('data-carry-decision') === 'keep')
    await key(document.body, 'j')
    await key(document.body, 'p')
    await waitFor(() => !!document.querySelector('[role="dialog"] input'))
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await type(input, '2026-10-16')
    await key(input, 'Enter')
    await waitFor(() => carryRow('Charlie').querySelector('[data-carry-decision]')!.getAttribute('data-carry-decision') === 'day')
    await click(document.querySelector('[data-close-apply]')!)
    await waitFor(() => toast().includes('2 tasks carried over'))
    expect([(await task(a)).start, (await task(a)).due]).toEqual(['someday', null])
    expect((await task(b)).due).toEqual({ date: TODAY })
    expect((await task(c)).due).toEqual({ date: '2026-10-16' })
    await waitFor(() => document.querySelectorAll('[data-carry-row]').length === 1)
    expect(document.querySelector('[data-close-count]')!.textContent).toContain('Applied')
    await click(document.querySelector('[data-bulk-toast] button')!)
    await waitFor(() => toast().includes('2 restored'))
    expect([(await task(a)).start, (await task(a)).due, (await task(c)).due]).toEqual([null, { date: TODAY }, { date: TODAY }])
    await r.unmount()
  })

  it('Read-only task: offers Keep only and Apply writes nothing for it', async () => {
    const shared = await createProject({ name: 'Family' })
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'someone', members: [] })
    const viewer = await createTask({ title: 'Their task', project_id: shared, due: { date: TODAY } })
    const mine = await createTask({ title: 'Mine', due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => document.querySelectorAll('[data-carry-row]').length === 2)
    expect([...carryRow('Their task').querySelectorAll('[data-carry-choice]')].map((b) => b.getAttribute('data-carry-choice'))).toEqual(['keep'])
    await click(document.querySelector('[data-close-apply]')!)
    await waitFor(() => toast().includes('1 task rescheduled'))
    expect((await task(viewer)).due).toEqual({ date: TODAY })
    expect((await task(mine)).due).toEqual({ date: '2026-10-15' })
    await r.unmount()
  })
})

describe('Closing the day', () => {
  it('Close with a note: the review row holds the time and the trimmed note, then Today ends with "Day closed"', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'summary')
    await key(document.body, ']')
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'note')
    const input = document.querySelector<HTMLInputElement>('[data-close-note-input]')!
    expect(input.maxLength).toBe(500)
    await type(input, '  Start with the invoice ')
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => location.pathname === '/today')
    const row = await db.review.get('me')
    expect([row?.closed_at, row?.tomorrow_note]).toEqual([NOW.getTime(), 'Start with the invoice'])
    await waitFor(() => /Day closed, (18:42|6:42\sPM)/.test(document.querySelector('[data-close-day]')?.textContent ?? ''))
    await r.unmount()
  })
})

describe('the morning note', () => {
  it("Yesterday's note in the morning: shown above the Inbox count, gone once today is closed", async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 8, 0))
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', closed_at: NOW.getTime(), tomorrow_note: 'Start with the invoice', _clock: {} })
    const r = await shell({ view: 'review', step: 'daily' })
    await waitFor(() => !!document.querySelector('[data-daily-note]'))
    const note = document.querySelector('[data-daily-note]')!
    expect(note.textContent).toContain('Start with the invoice')
    expect(note.compareDocumentPosition(document.querySelector('[data-daily-inbox]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await act(async () => { await closeDay('') })
    await waitFor(() => !document.querySelector('[data-daily-note]'))
    await r.unmount()
  })

  it('No note: closed yesterday without a note, or never, shows no note line', async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 8, 0))
    const r = await shell({ view: 'review', step: 'daily' })
    await waitFor(() => !!document.querySelector('[data-daily-inbox]'))
    expect(document.querySelector('[data-daily-note]')).toBeNull()
    await act(async () => { await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', closed_at: NOW.getTime(), tomorrow_note: '', _clock: {} }) })
    await flush(100)
    expect(document.querySelector('[data-daily-note]')).toBeNull()
    await r.unmount()
  })
})
