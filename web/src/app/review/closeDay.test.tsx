// @vitest-environment happy-dom
// Close the day on screen (OpenSpec changes close-the-day, close-the-day-v2 and
// close-the-day-redesign): the entry points, the three steps (Done, What moves,
// Tomorrow's first thing), nothing written before the close, the close as one batch
// with one Undo, Reopen, the Today row and yesterday's note.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId, REVIEW_DEFAULTS, setTaskCompleted } from '../../lib/ops'
import { closeTheDay } from '../../lib/closeDay'
import { canReopenDay, carryOverOf, closeDay, reopenDay } from '../../lib/review'
import { SHORTCUTS } from '../../lib/shortcuts'
import { undoBatch } from '../../lib/undo'
import type { Task, User } from '../../lib/types'
import { click, flush, key, render, type, waitFor } from '../../ui/test-utils'
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
  resetPanel()
})

const shell = async (route: Parameters<typeof navigate>[0]) => { navigate(route); return render(<Shell user={user} onLogout={() => {}} />) }
const stepOf = () => document.querySelector('[data-close-step]')?.getAttribute('data-close-step')
const titleEl = () => document.getElementById('close-step-title')
const figure = (k: string) => document.querySelector(`[data-close-figure="${k}"]`)?.textContent
const doneRows = () => [...document.querySelectorAll('[data-close-done-row]')].map((x) => x.textContent)
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-carry-row]')]
const row = (title: string) => rows().find((l) => l.querySelector('[data-carry-title]')?.textContent === title)!
const rowDecision = (title: string) => row(title)?.getAttribute('data-carry-decision')
const current = () => rows().find((l) => l.getAttribute('aria-current') === 'true')?.querySelector('[data-carry-title]')?.textContent
const doneState = () => document.querySelector<HTMLElement>('[data-day-done]')
const toast = () => document.querySelector('[data-bulk-toast]')?.textContent ?? ''
const task = async (id: string) => (await db.tasks.get(id)) as Task
const toMoves = async () => {
  await waitFor(() => stepOf() === 'done')
  await key(document.body, ']')
  await waitFor(() => stepOf() === 'moves')
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
    await waitFor(() => location.pathname === '/review/close' && stepOf() === 'done')
    await waitFor(() => document.activeElement === titleEl())
    expect(titleEl()!.textContent).toBe('What got done')
    await r.unmount()
  })

  it('Keyboard path: g then Shift+D opens the screen; the cheat sheet lists it under Go to a view', async () => {
    const r = await shell({ view: 'inbox' })
    await waitFor(() => !!document.querySelector('main h1'), 'the Inbox')
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
  it('A day with a focus: the five completed tasks in completion order, the lead "5 of 8 done · focus 2 of 3"', async () => {
    const ids: string[] = []
    for (let i = 1; i <= 8; i++) ids.push(await createTask({ title: `T${i}`, due: { date: TODAY } }))
    for (const [i, id] of ids.slice(0, 5).entries()) await db.tasks.update(id, { completed_at: NOW.getTime() - (5 - i) * 60_000 })
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', focus_date: TODAY, focus: [ids[0], ids[1], ids[6]].join(','), _clock: {} })
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => figure('planned') === '8' && figure('done') === '5')
    expect(figure('focus')).toBe('2 of 3')
    expect(document.querySelector('[data-close-summary]')!.textContent).toBe('5 of 8 done · focus 2 of 3')
    expect(doneRows()).toEqual(['T1', 'T2', 'T3', 'T4', 'T5'])
    // No card: the step is a titled section with Back / Next at its end.
    expect(document.querySelector('[data-close-step] [data-close-nav]')).not.toBeNull()
    await r.unmount()
  })

  it('More than eight: the first eight and "and n more", which shows the rest in place', async () => {
    for (let i = 1; i <= 11; i++) {
      const id = await createTask({ title: `D${i}`, due: { date: TODAY } })
      await db.tasks.update(id, { completed_at: NOW.getTime() - (12 - i) * 60_000 })
    }
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => doneRows().length === 8)
    expect(document.querySelector('[data-close-done-more]')!.textContent).toBe('and 3 more')
    await click(document.querySelector('[data-close-done-more]')!)
    await waitFor(() => doneRows().length === 11 && !document.querySelector('[data-close-done-more]'))
    await r.unmount()
  })

  it('Agrees with Statistics: the done figure is the per-day count, a deleted task counts nowhere', async () => {
    const kept = await createTask({ title: 'Counted', due: { date: TODAY } })
    const gone = await createTask({ title: 'Deleted', due: { date: TODAY } })
    await setTaskCompleted(kept, true)
    await setTaskCompleted(gone, true)
    await db.tasks.update(gone, { deleted_at: NOW.getTime() })
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => figure('done') === '1')
    expect(doneRows()).toEqual(['Counted'])
    await r.unmount()
  })

  it('Nothing was planned: one line, and Next still leads to What moves', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => !!document.querySelector('[data-close-empty]'))
    await click(document.querySelector('[data-close-next]')!)
    await waitFor(() => stepOf() === 'moves')
    expect(document.querySelector('[data-close-nothing]')).not.toBeNull()
    await r.unmount()
  })

  it('Walk the three steps: ] twice and Enter both continue, the third dot is current, the primary action is Close the day, focus follows the title', async () => {
    await createTask({ title: 'Open', due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'done' && document.activeElement === titleEl())
    expect(titleEl()!.textContent).toBe('What got done')
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'moves' && document.activeElement === titleEl())
    expect(titleEl()!.textContent).toBe('What moves')
    await key(document.body, 'Enter')
    await waitFor(() => stepOf() === 'first' && document.activeElement === titleEl())
    expect(titleEl()!.textContent).toBe('Tomorrow’s first thing')
    expect(document.querySelector('[data-progress-step="first"]')!.getAttribute('aria-current')).toBe('step')
    expect(document.querySelectorAll('[data-progress-step]')).toHaveLength(3)
    expect(document.querySelector('[data-close-finish]')!.textContent).toBe('Close the day')
    expect(document.querySelector('[data-close-now]')).toBeNull()
    await key(document.body, '[')
    await waitFor(() => stepOf() === 'moves')
    expect(document.querySelector('[data-close-now]')!.textContent).toBe('Close the day')
    await r.unmount()
  })

  it('Past Carry over: the What moves dot reads decided, nothing has moved, and no count is shown', async () => {
    const id = await createTask({ title: 'Later', due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'first')
    const dot = document.querySelector('[data-progress-step="moves"]')!
    expect(dot.getAttribute('data-progress-state')).toBe('decided')
    expect(dot.getAttribute('aria-label')).toBe('What moves, decided, not moved yet')
    expect(document.querySelector('[data-review-progress]')!.textContent).not.toMatch(/\d+ left/)
    expect((await task(id)).due).toEqual({ date: TODAY })
    expect(await db.assistantUndo.count()).toBe(0)
    await r.unmount()
  })

  it('Skip to the close: "Close the day" on the first step moves four tasks to tomorrow and shows Done for today', async () => {
    const ids = await Promise.all(['A', 'B', 'C', 'D'].map((title) => createTask({ title, due: { date: TODAY } })))
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'done' && figure('planned') === '4')
    await click(document.querySelector('[data-close-now]')!)
    await waitFor(() => !!doneState())
    for (const id of ids) expect((await task(id)).due).toEqual({ date: '2026-10-15' })
    expect((await db.review.get('me'))?.closed_day).toBe(TODAY)
    expect(toast()).toContain('Day closed · 4 moved to tomorrow')
    await r.unmount()
  })

  it('Leave without closing: three decisions, then Esc, write nothing and the tasks stay in Today', async () => {
    const ids = await Promise.all(['One', 'Two', 'Three'].map((title) => createTask({ title, due: { date: TODAY } })))
    const queued = await db.outbox.count()
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await key(document.body, 'y')
    await key(document.body, 'h')
    await key(document.body, 'd')
    await waitFor(() => rowDecision('Three') === 'done')
    await key(document.body, 'Escape')
    await waitFor(() => location.pathname === '/today')
    expect(await db.outbox.count()).toBe(queued)
    for (const id of ids) expect(await task(id)).toMatchObject({ due: { date: TODAY }, completed_at: null })
    await r.unmount()
  })
})

describe('What moves', () => {
  it('Default carry-over: every row on Tomorrow; closing writes ONE batch, "Day closed · 3 moved to tomorrow", Undo puts all back', async () => {
    const timed = await createTask({ title: 'Timed', due: { date: TODAY, time: '14:00' } })
    const overdue = await createTask({ title: 'Overdue', due: { date: '2026-10-12' } })
    const started = await createTask({ title: 'Started' })
    await db.tasks.update(started, { start: '2026-10-13' })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await waitFor(() => rows().length === 3)
    expect(rows().map((l) => l.getAttribute('data-carry-decision'))).toEqual(['tomorrow', 'tomorrow', 'tomorrow'])
    expect(row('Timed').querySelector('[data-carry-reason]')!.textContent).toMatch(/Due today at (14:00|2:00\sPM)/)
    expect(row('Overdue').querySelector('[data-carry-reason]')!.textContent).toContain('Open since')
    expect(row('Started').querySelector('[data-carry-reason]')!.textContent).toBe('Started')
    expect(row('Timed').querySelector('[data-segment="tomorrow"]')!.getAttribute('aria-checked')).toBe('true')
    await click(document.querySelector('[data-close-now]')!)
    await waitFor(() => toast().includes('Day closed · 3 moved to tomorrow'))
    expect((await task(timed)).due).toEqual({ date: '2026-10-15', time: '14:00' })
    expect((await task(overdue)).due).toEqual({ date: '2026-10-15' })
    expect([(await task(started)).due, (await task(started)).start]).toEqual([{ date: '2026-10-15' }, null])
    expect(await db.assistantUndo.count()).toBe(1)
    await click([...document.querySelectorAll('[data-bulk-toast] button')].find((b) => b.textContent === 'Undo')!)
    await waitFor(() => toast().includes('3 restored'))
    expect((await task(timed)).due).toEqual({ date: TODAY, time: '14:00' })
    expect((await task(started)).start).toBe('2026-10-13')
    expect((await db.review.get('me'))?.closed_at).toBe(0)
    await r.unmount()
  })

  it('Mixed decisions: y on the first row, h on the second, Friday through p on the third; y parks instead of tracking time; one Undo', async () => {
    const a = await createTask({ title: 'Alpha', due: { date: TODAY }, priority: 1 })
    const b = await createTask({ title: 'Bravo', due: { date: TODAY }, priority: 2 })
    const c = await createTask({ title: 'Charlie', due: { date: TODAY }, priority: 3 })
    const outboxAtStart = await db.outbox.count()
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await waitFor(() => current() === 'Alpha')
    await key(document.body, 'y')
    await waitFor(() => current() === 'Bravo' && rowDecision('Alpha') === 'someday')
    expect(await db.timeEntries.count()).toBe(0)
    await key(document.body, 'h')
    await waitFor(() => current() === 'Charlie' && rowDecision('Bravo') === 'keep')
    await key(document.body, 'p')
    await waitFor(() => !!document.querySelector('[role="dialog"] input'))
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await type(input, '2026-10-16')
    await key(input, 'Enter')
    await waitFor(() => rowDecision('Charlie') === 'day' && !!row('Charlie').querySelector('[data-carry-day]'))
    expect(await db.outbox.count()).toBe(outboxAtStart)
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'first')
    await click(document.querySelector('[data-close-finish]')!)
    await waitFor(() => toast().includes('Day closed · 2 tasks carried over'))
    expect([(await task(a)).start, (await task(a)).due]).toEqual(['someday', null])
    expect((await task(b)).due).toEqual({ date: TODAY })
    expect((await task(c)).due).toEqual({ date: '2026-10-16' })
    await key(document.body, 'z', { ctrlKey: true })
    await waitFor(() => toast().includes('2 restored'))
    expect([(await task(a)).start, (await task(a)).due, (await task(c)).due]).toEqual([null, { date: TODAY }, { date: TODAY }])
    await r.unmount()
  })

  it('Read-only task: its row keeps its place with no choice, and closing writes nothing for it', async () => {
    const shared = await createProject({ name: 'Family' })
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'someone', members: [] })
    const viewer = await createTask({ title: 'Their task', project_id: shared, due: { date: TODAY } })
    const mine = await createTask({ title: 'Mine', due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await waitFor(() => rows().length === 2)
    expect(row('Their task').querySelector('[data-carry-choices]')).toBeNull()
    expect(row('Their task').querySelector('[data-carry-readonly]')!.textContent).toBe('Keeps its place')
    expect(rowDecision('Their task')).toBe('keep')
    await click(document.querySelector('[data-close-now]')!)
    await waitFor(() => toast().includes('Day closed · 1 moved to tomorrow'))
    expect((await task(viewer)).due).toEqual({ date: TODAY })
    expect((await task(mine)).due).toEqual({ date: '2026-10-15' })
    await r.unmount()
  })

  it('Done already: d completes a task and rolls a weekly series in the same batch; the row menu offers it too', async () => {
    const finished = await createTask({ title: 'Finished', due: { date: TODAY } })
    const weekly = await createTask({ title: 'Weekly', due: { date: TODAY }, recurrence: 'every wednesday' })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await waitFor(() => rows().length === 2)
    await key(document.body, 'd')
    await waitFor(() => rowDecision('Finished') === 'done')
    // The second through its row menu.
    await click(row('Weekly').querySelector('[data-carry-menu]')!)
    await waitFor(() => !!document.querySelector('[data-carry-choice="done"]'))
    await click(document.querySelector('[data-carry-choice="done"]')!)
    await waitFor(() => rowDecision('Weekly') === 'done')
    expect((await task(finished)).completed_at).toBeNull()
    await click(document.querySelector('[data-close-now]')!)
    await waitFor(() => toast().includes('Day closed · 2 tasks carried over'))
    expect((await task(finished)).completed_at).not.toBeNull()
    expect(await task(weekly)).toMatchObject({ completed_at: null, due: { date: '2026-10-21' } })
    await r.unmount()
  })

  it('Change an earlier decision: k goes back to the first row and t sets Tomorrow again', async () => {
    const first = await createTask({ title: 'First', due: { date: TODAY }, priority: 1 })
    await createTask({ title: 'Second', due: { date: TODAY }, priority: 2 })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await waitFor(() => current() === 'First')
    await key(document.body, 'y')
    await waitFor(() => current() === 'Second' && rowDecision('First') === 'someday')
    await key(document.body, 'k')
    await waitFor(() => current() === 'First')
    await key(document.body, 't')
    await waitFor(() => rowDecision('First') === 'tomorrow')
    expect(row('First').querySelector('[data-segment="tomorrow"]')!.getAttribute('aria-checked')).toBe('true')
    await key(document.body, 'j')
    await waitFor(() => current() === 'Second')
    await click(document.querySelector('[data-close-now]')!)
    await waitFor(() => !!doneState())
    expect((await task(first)).due).toEqual({ date: '2026-10-15' })
    await r.unmount()
  })

  it('All to tomorrow: Shift+T and the lead button reset Someday and Later to Tomorrow', async () => {
    for (const title of ['R1', 'R2', 'R3', 'R4', 'R5']) await createTask({ title, due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await waitFor(() => rows().length === 5)
    await click(row('R2').querySelector('[data-segment="someday"]')!)
    await click(row('R4').querySelector('[data-segment="day"]')!)
    await waitFor(() => !!document.querySelector('[role="dialog"] input'))
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await type(input, '2026-10-20')
    await key(input, 'Enter')
    await waitFor(() => rowDecision('R4') === 'day' && rowDecision('R2') === 'someday')
    await key(document.body, 'T', { shiftKey: true })
    await waitFor(() => rows().every((l) => l.getAttribute('data-carry-decision') === 'tomorrow'))
    await click(row('R1').querySelector('[data-segment="someday"]')!)
    await waitFor(() => rowDecision('R1') === 'someday')
    await click(document.querySelector('[data-close-all-tomorrow]')!)
    await waitFor(() => rows().every((l) => l.getAttribute('data-carry-decision') === 'tomorrow'))
    await r.unmount()
  })

  it('No accidental completion: clicking a row or the list writes nothing until the day is closed', async () => {
    const id = await createTask({ title: 'Careful', due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await waitFor(() => rows().length === 1)
    const queued = await db.outbox.count()
    await click(row('Careful').querySelector('[data-carry-title]')!)
    await click(row('Careful'))
    await click(row('Careful').querySelector('[data-segment="someday"]')!)
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- asserts the absence of a write
    await flush(60)
    expect(row('Careful').querySelector('[role="checkbox"], [data-check]')).toBeNull()
    expect([await db.outbox.count(), (await task(id)).completed_at, (await task(id)).due]).toEqual([queued, null, { date: TODAY }])
    await r.unmount()
  })
})

describe('Tomorrow’s first thing', () => {
  it('Pick the first thing: tomorrow lists tonight’s moves; the pick becomes tomorrow’s focus, which the Daily check shows the next morning', async () => {
    await createTask({ title: 'Call the plumber', due: { date: TODAY } })
    const invoice = await createTask({ title: 'Send the invoice to Ana', due: { date: '2026-10-15' } })
    await createTask({ title: 'Parked', due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await waitFor(() => rows().length === 2)
    await click(row('Parked').querySelector('[data-segment="someday"]')!)
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'first')
    const options = () => [...document.querySelectorAll<HTMLElement>('[data-close-first]')].map((x) => x.textContent)
    expect(options()).toEqual(expect.arrayContaining(['Call the plumber', 'Send the invoice to Ana']))
    expect(options()).not.toContain('Parked')
    expect([...document.querySelectorAll('[data-close-first]')].every((x) => x.getAttribute('aria-checked') === 'false')).toBe(true)
    await click(document.querySelector(`[data-close-first="${invoice}"]`)!)
    await waitFor(() => document.querySelector(`[data-close-first="${invoice}"]`)!.getAttribute('aria-checked') === 'true')
    await click(document.querySelector('[data-close-finish]')!)
    await waitFor(() => !!doneState())
    expect(document.querySelector('[data-day-done-first]')!.textContent).toBe('Tomorrow starts with Send the invoice to Ana')
    expect(await db.review.get('me')).toMatchObject({ focus_date: '2026-10-15', focus: invoice })
    await r.unmount()
    vi.setSystemTime(new Date(2026, 9, 15, 8, 0))
    const r2 = await shell({ view: 'review', step: 'daily' })
    await waitFor(() => (document.querySelector('[data-group="focus"]')?.textContent ?? '').includes('Send the invoice to Ana'))
    await r2.unmount()
  })

  it('Nothing chosen: closing writes no focus field; the note preview says where the line appears', async () => {
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', focus_date: TODAY, focus: 'x', _clock: {} })
    await createTask({ title: 'Tomorrow thing', due: { date: '2026-10-15' } })
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'done')
    await key(document.body, ']')
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'first')
    expect(document.querySelector('[data-close-note-preview]')).toBeNull()
    await type(document.querySelector<HTMLInputElement>('[data-close-note-input]')!, 'Call Ana first')
    await waitFor(() => document.querySelector('[data-close-note-preview]')?.textContent === 'Tomorrow your Daily check starts with: “Call Ana first”')
    const queued = await db.outbox.count()
    await click(document.querySelector('[data-close-finish]')!)
    await waitFor(() => !!doneState())
    expect((await db.outbox.toArray()).slice(queued).some((o) => o.field.startsWith('focus'))).toBe(false)
    expect(await db.review.get('me')).toMatchObject({ focus_date: TODAY, focus: 'x', tomorrow_note: 'Call Ana first' })
    expect(document.querySelector('[data-day-done-first]')).toBeNull()
    await r.unmount()
  })

  it('Undo restores the focus: today’s two focus tasks come back and nothing is seeded for tomorrow', async () => {
    const f1 = await createTask({ title: 'Focus 1', due: { date: TODAY } })
    const f2 = await createTask({ title: 'Focus 2', due: { date: TODAY } })
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', focus_date: TODAY, focus: `${f1},${f2}`, _clock: {} })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'first' && !!document.querySelector(`[data-close-first="${f1}"]`))
    await click(document.querySelector(`[data-close-first="${f1}"]`)!)
    await key(document.body, 'Enter')
    await waitFor(() => !!doneState())
    expect(await db.review.get('me')).toMatchObject({ focus_date: '2026-10-15', focus: f1 })
    await click([...document.querySelectorAll('[data-bulk-toast] button')].find((b) => b.textContent === 'Undo')!)
    await waitFor(() => toast().includes('restored'))
    expect(await db.review.get('me')).toMatchObject({ focus_date: TODAY, focus: `${f1},${f2}`, closed_at: 0 })
    expect([(await task(f1)).due, (await task(f2)).due]).toEqual([{ date: TODAY }, { date: TODAY }])
    await r.unmount()
  })
})

describe('Closing the day', () => {
  const closeFromFirst = async (note: string) => {
    await waitFor(() => stepOf() === 'done')
    await key(document.body, ']')
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'first')
    const input = document.querySelector<HTMLInputElement>('[data-close-note-input]')!
    if (note) await type(input, note)
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => !!doneState())
    return input
  }

  it('Close with a note: the review row holds the time and the trimmed note; Done for today; Back to Today ends with "Day closed"', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'done')
    expect(document.querySelector<HTMLInputElement>('[data-close-note-input]')).toBeNull()
    await closeFromFirst('  Start with the invoice ')
    const row = await db.review.get('me')
    expect([row?.closed_at, row?.closed_day, row?.tomorrow_note]).toEqual([NOW.getTime(), TODAY, 'Start with the invoice'])
    expect(document.querySelector('[data-day-done-note]')!.textContent).toBe('“Start with the invoice”')
    expect(document.activeElement).toBe(document.querySelector('[data-day-done-back]'))
    await click(document.querySelector('[data-day-done-back]')!)
    await waitFor(() => location.pathname === '/today')
    await waitFor(() => /Day closed, (18:42|6:42\sPM)/.test(document.querySelector('[data-close-day]')?.textContent ?? ''))
    await r.unmount()
  })

  it('Close with carry-over: 5 done, 3 moved to tomorrow, 1 kept, the first thing named, the drawing and no score; showing it wrote nothing', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await createTask({ title: `Done ${i}`, due: { date: TODAY } })
      await db.tasks.update(id, { completed_at: NOW.getTime() - 3_600_000 })
    }
    for (const title of ['Move a', 'Move b', 'Move c', 'Stay']) await createTask({ title, due: { date: TODAY } })
    const r = await shell({ view: 'review', step: 'close' })
    await toMoves()
    await waitFor(() => rows().length === 4)
    await click(row('Stay').querySelector('[data-carry-menu]')!)
    await waitFor(() => !!document.querySelector('[data-carry-choice="keep"]'))
    await click(document.querySelector('[data-carry-choice="keep"]')!)
    await waitFor(() => rowDecision('Stay') === 'keep')
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'first' && document.querySelectorAll('[data-close-first]').length === 3)
    await click([...document.querySelectorAll('[data-close-first]')].find((x) => x.textContent === 'Move b')!)
    const input = document.querySelector<HTMLInputElement>('[data-close-note-input]')!
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => !!doneState())
    const outbox = await db.outbox.count()
    expect(doneState()!.querySelector('[data-illustration="day-done"]')!.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(doneState()!.querySelector('h2')!.textContent).toMatch(/^Day closed, (18:42|6:42\sPM)$/)
    expect(document.querySelector('[data-day-done-figures]')!.textContent).toBe('5 done, 3 moved to tomorrow, 1 kept')
    expect(document.querySelector('[data-day-done-first]')!.textContent).toBe('Tomorrow starts with Move b')
    expect(document.querySelector('[data-day-done-note]')).toBeNull()
    expect(document.querySelector('[data-close-step]')).toBeNull()
    expect(doneState()!.textContent).not.toMatch(/streak|score/i)
    expect(doneState()!.querySelector('[data-reopen-day]')).not.toBeNull()
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- asserts the absence of a write
    await flush(60)
    expect(await db.outbox.count()).toBe(outbox)
    // Escape goes back to Today as well.
    await key(document.activeElement!, 'Escape')
    await waitFor(() => location.pathname === '/today')
    await r.unmount()
  })

  it('Nothing was planned: "Nothing was planned today", no figures beyond it, no quoted line', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await closeFromFirst('')
    expect(document.querySelector('[data-day-done-figures]')!.textContent).toBe('Nothing was planned today')
    expect(document.querySelector('[data-day-done-note]')).toBeNull()
    await r.unmount()
  })

  it('Reload: the route shows the ordinary first step with "Day closed" in its header', async () => {
    const r = await shell({ view: 'review', step: 'close' })
    await closeFromFirst('')
    await r.unmount()
    const r2 = await shell({ view: 'review', step: 'close' })
    await waitFor(() => stepOf() === 'done')
    expect(document.querySelector('[data-day-done]')).toBeNull()
    expect(document.body.textContent).toMatch(/Day closed, (18:42|6:42\sPM)/)
    await r2.unmount()
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
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- asserts the figures do not change after the tick
    await flush(60)
    expect([figure('planned'), figure('done')]).toEqual(['4', '1'])
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'moves' && rows().length === 3)
    await key(document.body, ']')
    await waitFor(() => stepOf() === 'first')
    await type(document.querySelector<HTMLInputElement>('[data-close-note-input]')!, 'Start with the invoice')
    const input = document.querySelector<HTMLInputElement>('[data-close-note-input]')!
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => !!document.querySelector('[data-day-done]'))
    for (const id of ids) expect((await task(id)).due).toEqual({ date: '2026-10-15' })
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
    await closeFromFirst('')
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
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- asserts the note stays away after the write
    await flush(100)
    expect(document.querySelector('[data-daily-note]')).toBeNull()
    await r.unmount()
  })
})

describe('Reopen the day (ux-feedback-2)', () => {
  const carry = async (ids: string[], note = '') => {
    const tasks = await Promise.all(ids.map(task))
    return closeTheDay({ decisions: new Map(), tasks: tasks.map((x) => ({ task: x, editable: true })), day: TODAY, note, first: null })
  }

  it('Closing records what it changed on the review row, and its Undo empties the record again', async () => {
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
    await carry(ids, 'Start with the invoice')
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
