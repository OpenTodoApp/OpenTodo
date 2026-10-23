// @vitest-environment happy-dom
// Close the day on screen (OpenSpec changes close-the-day, tasks 3.2, 4.2–4.4, 5.1,
// 5.3, 5.4, and close-the-day-v2): the entry points, the three steps, Carry over one
// task at a time with its batch written on moving on, the close write with the day it
// closes, the Today row, the sidebar marker and yesterday's note.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId, REVIEW_DEFAULTS, setTaskCompleted } from '../../lib/ops'
import { applyCarryOver, canReopenDay, carryOverOf, closeDay, reopenDay } from '../../lib/review'
import { SHORTCUTS } from '../../lib/shortcuts'
import { undoBatch } from '../../lib/undo'
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
const figure = (k: string) => document.querySelector(`[data-close-figure="${k}"]`)?.textContent
const card = () => document.querySelector<HTMLElement>('[data-carry-card]')
const cardTitle = () => card()?.querySelector('[data-carry-title]')?.textContent
const lines = () => [...document.querySelectorAll<HTMLElement>('[data-carry-line]')]
const line = (title: string) => lines().find((l) => l.textContent?.includes(title))!
const lineDecision = (title: string) => line(title)?.querySelector('[data-carry-line-decision]')?.getAttribute('data-carry-line-decision')
const carryStatus = () => document.querySelector('[data-progress-step="carry"]')?.textContent ?? ''
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
    expect(row.querySelector('[data-reopen-day]')).not.toBeNull()
    await click([...row.querySelectorAll('button')].find((b) => b.textContent?.includes('Close again'))!)
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
    expect(figure('focus')).toBe('2 of 3')
    expect(document.querySelector('[data-close-summary]')!.textContent).toBe('You planned 8 tasks and finished 5.Today’s focus: 2 of 3 done.')
    // Back and Next sit inside the step card (close-the-day-v2 D5).
    expect(document.querySelector('[data-review-step] [data-review-nav]')).not.toBeNull()
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
  it('Default carry-over: moving on writes one batch, "3 tasks rescheduled", Carry over shows a check, Ctrl+Z undoes in one step', async () => {
    const timed = await createTask({ title: 'Timed', due: { date: TODAY, time: '14:00' } })
    const overdue = await createTask({ title: 'Overdue', due: { date: '2026-10-12' } })
    const started = await createTask({ title: 'Started' })
    await db.tasks.update(started, { start: '2026-10-13' })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => lines().length === 3 && !!card())
    expect(lines().map((l) => l.querySelector('[data-carry-line-decision]')!.getAttribute('data-carry-line-decision'))).toEqual(['tomorrow', 'tomorrow', 'tomorrow'])
    expect(document.querySelector('[data-close-count]')!.textContent).toContain('moving on carries them over')
    expect(document.querySelector('[data-close-apply]')).toBeNull()
    expect(card()!.querySelector('[data-carry-position]')!.textContent).toBe('1 of 3')
    await key(document.body, ']')
    await waitFor(() => toast().includes('3 tasks rescheduled'))
    await waitFor(() => stepOf() === 'note')
    expect(carryStatus()).toContain('done')
    expect(document.querySelector('[data-progress-step="carry"]')!.parentElement!.textContent).not.toMatch(/\d/)
    expect((await task(timed)).due).toEqual({ date: '2026-10-15', time: '14:00' })
    expect((await task(overdue)).due).toEqual({ date: '2026-10-15' })
    expect([(await task(started)).due, (await task(started)).start]).toEqual([{ date: '2026-10-15' }, null])
    expect(await db.assistantUndo.count()).toBe(1)
    await key(document.body, 'z', { ctrlKey: true })
    await waitFor(() => toast().includes('3 restored'))
    expect((await task(timed)).due).toEqual({ date: TODAY, time: '14:00' })
    expect((await task(started)).start).toBe('2026-10-13')
    await r.unmount()
  })

  it('Mixed decisions: y, h and a picked Friday, one task at a time; y parks instead of tracking time; Undo restores the batch', async () => {
    const a = await createTask({ title: 'Alpha', due: { date: TODAY }, priority: 1 })
    const b = await createTask({ title: 'Bravo', due: { date: TODAY }, priority: 2 })
    const c = await createTask({ title: 'Charlie', due: { date: TODAY }, priority: 3 })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => cardTitle() === 'Alpha')
    await key(document.body, 'y')
    await waitFor(() => cardTitle() === 'Bravo' && lineDecision('Alpha') === 'someday')
    expect(await db.timeEntries.count()).toBe(0)
    await key(document.body, 'h')
    await waitFor(() => cardTitle() === 'Charlie' && lineDecision('Bravo') === 'keep')
    await key(document.body, 'p')
    await waitFor(() => !!document.querySelector('[role="dialog"] input'))
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await type(input, '2026-10-16')
    await key(input, 'Enter')
    await waitFor(() => lineDecision('Charlie') === 'day' && !!document.querySelector('[data-carry-all-set]'))
    await click(document.querySelector('[data-review-next]')!)
    await waitFor(() => toast().includes('2 tasks carried over'))
    expect([(await task(a)).start, (await task(a)).due]).toEqual(['someday', null])
    expect((await task(b)).due).toEqual({ date: TODAY })
    expect((await task(c)).due).toEqual({ date: '2026-10-16' })
    // Back on Carry over, the kept task is the one still in Today, with its decision.
    await key(document.body, '[')
    await waitFor(() => stepOf() === 'carry' && lines().length === 1)
    expect(lineDecision('Bravo')).toBe('keep')
    await click(document.querySelector('[data-bulk-toast] button')!)
    await waitFor(() => toast().includes('2 restored'))
    expect([(await task(a)).start, (await task(a)).due, (await task(c)).due]).toEqual([null, { date: TODAY }, { date: TODAY }])
    await r.unmount()
  })

  it('Read-only task: its card offers Keep only with the reason, and moving on writes nothing for it', async () => {
    const shared = await createProject({ name: 'Family' })
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'someone', members: [] })
    const viewer = await createTask({ title: 'Their task', project_id: shared, due: { date: TODAY } })
    const mine = await createTask({ title: 'Mine', due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => lines().length === 2)
    await click(line('Their task').querySelector('button')!)
    await waitFor(() => cardTitle() === 'Their task')
    expect([...card()!.querySelectorAll('[data-carry-choice]')].map((x) => x.getAttribute('data-carry-choice'))).toEqual(['keep'])
    expect(card()!.textContent).toContain('You can only view tasks in this shared project')
    expect(lineDecision('Their task')).toBe('keep')
    await click(document.querySelector('[data-review-next]')!)
    await waitFor(() => toast().includes('1 task rescheduled'))
    expect((await task(viewer)).due).toEqual({ date: TODAY })
    expect((await task(mine)).due).toEqual({ date: '2026-10-15' })
    await r.unmount()
  })

  it('Done already: d completes a task and rolls a weekly series with the rest of the batch', async () => {
    const finished = await createTask({ title: 'Finished', due: { date: TODAY } })
    const weekly = await createTask({ title: 'Weekly', due: { date: TODAY }, recurrence: 'every wednesday' })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => lines().length === 2 && !!card())
    await key(document.body, 'd')
    await waitFor(() => lines().filter((l) => l.querySelector('[data-carry-line-decision="done"]')).length === 1)
    await key(document.body, 'd')
    await waitFor(() => !!document.querySelector('[data-carry-all-set]'))
    expect((await task(finished)).completed_at).toBeNull()
    await key(document.body, ']')
    await waitFor(() => toast().includes('2 tasks carried over'))
    expect((await task(finished)).completed_at).not.toBeNull()
    expect(await task(weekly)).toMatchObject({ completed_at: null, due: { date: '2026-10-21' } })
    await r.unmount()
  })

  it('Change an earlier decision: a line brings its task back to the card', async () => {
    await createTask({ title: 'First', due: { date: TODAY }, priority: 1 })
    const second = await createTask({ title: 'Second', due: { date: TODAY }, priority: 2 })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => cardTitle() === 'First')
    await key(document.body, 'y')
    await waitFor(() => cardTitle() === 'Second')
    await click(line('First').querySelector('button')!)
    await waitFor(() => cardTitle() === 'First')
    expect(card()!.querySelector('[data-carry-choice="someday"]')!.getAttribute('aria-pressed')).toBe('true')
    await key(document.body, 't')
    await waitFor(() => lineDecision('First') === 'tomorrow')
    expect((await task(second)).due).toEqual({ date: TODAY })
    await r.unmount()
  })

  it('No accidental completion: clicking the card or a line writes nothing until the user moves on', async () => {
    const id = await createTask({ title: 'Careful', due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => cardTitle() === 'Careful')
    const queued = await db.outbox.count()
    await click(card()!.querySelector('[data-carry-title]')!)
    await click(line('Careful').querySelector('button')!)
    await flush(60)
    expect(card()!.querySelector('[role="checkbox"], [data-check]')).toBeNull()
    expect([await db.outbox.count(), (await task(id)).completed_at, (await task(id)).due]).toEqual([queued, null, { date: TODAY }])
    await r.unmount()
  })
})

describe('Closing the day', () => {
  const doneState = () => document.querySelector<HTMLElement>('[data-day-done]')
  const closeFromNote = async (note: string) => {
    await waitFor(() => stepOf() === 'summary')
    await key(document.body, ']')
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'note')
    const input = document.querySelector<HTMLInputElement>('[data-close-note-input]')!
    if (note) await type(input, note)
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => !!doneState())
    return input
  }

  it('Close with a note: the review row holds the time and the trimmed note; Done for today; Back to Today ends with "Day closed"', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'summary')
    expect(document.querySelector<HTMLInputElement>('[data-close-note-input]')).toBeNull()
    await closeFromNote('  Start with the invoice ')
    const row = await db.review.get('me')
    expect([row?.closed_at, row?.closed_day, row?.tomorrow_note]).toEqual([NOW.getTime(), TODAY, 'Start with the invoice'])
    expect(document.querySelector('[data-day-done-note]')!.textContent).toBe('“Start with the invoice”')
    expect(document.activeElement).toBe(document.querySelector('[data-day-done-back]'))
    await click(document.querySelector('[data-day-done-back]')!)
    await waitFor(() => location.pathname === '/today')
    await waitFor(() => /Day closed, (18:42|6:42\sPM)/.test(document.querySelector('[data-close-day]')?.textContent ?? ''))
    await r.unmount()
  })

  it('Close with carry-over: 5 done, 3 moved to tomorrow, 1 kept, the drawing and no score; showing it wrote nothing', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await createTask({ title: `Done ${i}`, due: { date: TODAY } })
      await db.tasks.update(id, { completed_at: NOW.getTime() - 3_600_000 })
    }
    for (const title of ['Move a', 'Move b', 'Move c', 'Stay']) await createTask({ title, due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toCarry()
    await waitFor(() => lines().length === 4)
    await click(line('Stay').querySelector('button')!)
    await waitFor(() => cardTitle() === 'Stay')
    await click(card()!.querySelector('[data-carry-choice="keep"]')!)
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'note')
    const input = document.querySelector<HTMLInputElement>('[data-close-note-input]')!
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => !!doneState())
    const outbox = await db.outbox.count()
    expect(doneState()!.querySelector('[data-illustration="day-done"]')!.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(doneState()!.querySelector('h2')!.textContent).toMatch(/^Day closed, (18:42|6:42\sPM)$/)
    expect(document.querySelector('[data-day-done-figures]')!.textContent).toBe('5 done, 3 moved to tomorrow, 1 kept')
    expect(document.querySelector('[data-day-done-note]')).toBeNull()
    expect(document.querySelector('[data-review-step]')).toBeNull()
    expect(doneState()!.textContent).not.toMatch(/streak|score/i)
    expect(doneState()!.querySelector('[data-reopen-day]')).not.toBeNull()
    await flush(60)
    expect(await db.outbox.count()).toBe(outbox)
    // Escape goes back to Today as well.
    await key(document.activeElement!, 'Escape')
    await waitFor(() => location.pathname === '/today')
    await r.unmount()
  })

  it('Nothing was planned: "Nothing was planned today", no figures beyond it, no quoted line', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await closeFromNote('')
    expect(document.querySelector('[data-day-done-figures]')!.textContent).toBe('Nothing was planned today')
    expect(document.querySelector('[data-day-done-note]')).toBeNull()
    await r.unmount()
  })

  it('Reload: the route shows the ordinary first step with "Day closed" in its header', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await closeFromNote('')
    await r.unmount()
    const r2 = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'summary')
    expect(document.querySelector('[data-day-done]')).toBeNull()
    expect(document.body.textContent).toMatch(/Day closed, (18:42|6:42\sPM)/)
    await r2.unmount()
  })

  it('Note preview: the third step says where the note appears', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'summary')
    await key(document.body, ']')
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'note')
    expect(titleEl()!.textContent).toBe('A note for tomorrow morning')
    expect(document.querySelector('[data-close-note-preview]')!.textContent).toContain('Leave it empty')
    await type(document.querySelector<HTMLInputElement>('[data-close-note-input]')!, 'Call Ana first')
    await waitFor(() => document.querySelector('[data-close-note-preview]')!.textContent === 'Tomorrow your Daily check starts with: “Call Ana first”')
    await r.unmount()
  })

  it('Closing across midnight: opened at 23:59, closed at 00:02, the day started on is the day closed', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 14, 23, 59))
    const done = await createTask({ title: 'Done tonight', due: { date: TODAY } })
    await db.tasks.update(done, { completed_at: new Date(2026, 9, 14, 20, 0).getTime() })
    const ids = await Promise.all(['Left 1', 'Left 2', 'Left 3'].map((title) => createTask({ title, due: { date: TODAY } })))
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => figure('planned') === '4' && figure('done') === '1')
    // Midnight passes while the screen is open; the app's minute tick runs.
    vi.setSystemTime(new Date(2026, 9, 15, 0, 2))
    await act(async () => { vi.advanceTimersByTime(60_000) })
    await flush(60)
    expect([figure('planned'), figure('done')]).toEqual(['4', '1'])
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'carry' && lines().length === 3)
    await key(document.body, ']')
    await waitFor(() => toast().includes('3 tasks rescheduled'))
    for (const id of ids) expect((await task(id)).due).toEqual({ date: '2026-10-15' })
    await waitFor(() => stepOf() === 'note')
    await type(document.querySelector<HTMLInputElement>('[data-close-note-input]')!, 'Start with the invoice')
    const input = document.querySelector<HTMLInputElement>('[data-close-note-input]')!
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => !!document.querySelector('[data-day-done]'))
    expect(await db.review.get('me')).toMatchObject({ closed_day: TODAY, tomorrow_note: 'Start with the invoice' })
    // The day closed has ended, so no Reopen; Thursday's Daily check starts with the note.
    expect(document.querySelector('[data-day-done] [data-reopen-day]')).toBeNull()
    await r.unmount()
    const r2 = await shell({ view: 'review', step: 'daily' })
    await waitFor(() => (document.querySelector('[data-daily-note]')?.textContent ?? '').includes('Start with the invoice'))
    await r2.unmount()
  })

  it('Reduced motion: the state only fades in (an opacity transition), with no movement', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await closeFromNote('')
    const cls = doneState()!.className
    expect(cls).toContain('transition-opacity')
    expect(cls).not.toMatch(/translate|scale|animate-/)
    await waitFor(() => doneState()!.className.includes('opacity-100'))
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
    await act(async () => { await closeDay('', '2026-10-15') })
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

describe('Reopen the day (ux-feedback-2)', () => {
  const carry = async (ids: string[]) => {
    const tasks = await Promise.all(ids.map(task))
    return applyCarryOver(new Map(), tasks.map((x) => ({ task: x, editable: true })), TODAY)
  }

  it('Apply records what it changed on the review row, and its Undo empties the record again', async () => {
    const timed = await createTask({ title: 'Timed', due: { date: TODAY, time: '14:00' } })
    const started = await createTask({ title: 'Started' })
    await db.tasks.update(started, { start: '2026-10-13' })
    const r = await carry([timed, started])
    const record = carryOverOf(await db.review.get('me'))!
    expect(record.date).toBe(TODAY)
    expect(record.items).toEqual(expect.arrayContaining([
      { id: timed, field: 'due', before: { date: TODAY, time: '14:00' }, after: { date: '2026-10-15', time: '14:00' } },
      { id: started, field: 'start', before: '2026-10-13', after: null },
    ]))
    const u = await undoBatch(r.entry!.id)
    expect(u.restored).toBe(2)
    expect((await db.review.get('me'))?.carry_over).toBe('')
  })

  it('Reopen after the toast is gone: tasks back in Today, the row offers Close the day, the note is kept', async () => {
    const ids = await Promise.all(['One', 'Two', 'Three', 'Four'].map((title) => createTask({ title, due: { date: TODAY } })))
    await carry(ids)
    await closeDay('Start with the invoice', TODAY)
    hideBulkToast()
    const r = await shell({ view: 'today' })
    await waitFor(() => !!document.querySelector('[data-reopen-day]'))
    await click(document.querySelector('[data-reopen-day]')!)
    await waitFor(() => toast().includes('Day reopened, 4 tasks back in Today'))
    expect(toast()).toContain('Undo')
    for (const id of ids) expect((await task(id)).due).toEqual({ date: TODAY })
    const row = await db.review.get('me')
    expect([row?.closed_at, row?.carry_over, row?.tomorrow_note]).toEqual([0, '', 'Start with the invoice'])
    await waitFor(() => document.querySelector('[data-close-day]')?.getAttribute('data-close-day') === 'open')
    expect(document.querySelector('[data-reopen-day]')).toBeNull()
    await r.unmount()
  })

  it('A task changed since the close stays where it is and is named', async () => {
    const ids = await Promise.all(['A1', 'A2', 'A3', 'A4', 'Moved by hand'].map((title) => createTask({ title, due: { date: TODAY } })))
    await carry(ids)
    await closeDay('', TODAY)
    await db.tasks.update(ids[4], { due: { date: '2026-10-16' } })
    const result = await reopenDay(TODAY)
    expect([result.restored, result.skipped]).toEqual([4, ['Moved by hand']])
    expect((await task(ids[4])).due).toEqual({ date: '2026-10-16' })
    expect((await task(ids[0])).due).toEqual({ date: TODAY })
  })

  it('Next morning: no Reopen for yesterday, and the row offers Close the day', async () => {
    await closeDay('', '2026-10-13', new Date(2026, 9, 13, 21, 0).getTime())
    expect(canReopenDay(await db.review.get('me'), TODAY)).toBe(false)
    expect((await reopenDay(TODAY)).entry).toBeNull()
    const r = await shell({ view: 'today' })
    await waitFor(() => document.querySelector('[data-close-day]')?.getAttribute('data-close-day') === 'open')
    expect(document.querySelector('[data-reopen-day]')).toBeNull()
    await r.unmount()
  })

  it('The Close the day screen offers Reopen while the day is closed', async () => {
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', closed_at: NOW.getTime() - 60_000, _clock: {} })
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => !!document.querySelector('[data-reopen-day]'))
    await click(document.querySelector('[data-reopen-day]')!)
    await waitFor(() => toast().includes('Day reopened'))
    expect((await db.review.get('me'))?.closed_at).toBe(0)
    await r.unmount()
  })
})
