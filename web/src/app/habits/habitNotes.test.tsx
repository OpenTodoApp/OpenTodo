// @vitest-environment happy-dom
// Notes on habits (OpenSpec change habit-notes, tasks 2.1, 2.2, 3.1): the "How did it
// go?" line after a check-in, Note on a past day, the Check-ins list, the note marks
// and their names, and the records that copy no note.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { setDayNote, setPastDay } from '../../lib/habitActions'
import { habitRowsOf, habitStats } from '../../lib/habits'
import { occurrenceId } from '../../lib/ids'
import { completeTask, createTask, resetDeviceId, updateTask } from '../../lib/ops'
import { undoBatch } from '../../lib/undo'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { bulkToast } from '../bulk/toastStore'
import { resetPanel } from '../panel'
import { makeTaskEntry } from '../palette/index'
import { HabitPage } from './HabitPage'
import HabitsScreen from './HabitsScreen'
import { closeNote } from './checkInNoteStore'
import { dayNote } from './dayNoteStore'

const originalMedia = window.matchMedia

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 11, 12, 0)) // Wednesday 11 November 2026
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  closeNote()
  dayNote.set(null)
  localStorage.clear()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.matchMedia = originalMedia
  resetPanel()
})

async function habit(title: string, rule: string, due: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true, ...extra })
  return id
}
const row = (id: string) => document.querySelector<HTMLElement>(`[data-habit-row="${id}"]`)
const line = () => document.querySelector<HTMLInputElement>('[data-note-line]')

describe('the "How did it go?" line', () => {
  it('A line after the run: Enter saves the note, the day shows a mark, one Undo removes the note and keeps the check-in', async () => {
    const run = await habit('Run', 'every day', '2026-11-11', { description: 'Training for the 10k in March' })
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!row(run), 'the row')
    const check = row(run)!.querySelector<HTMLElement>(`[data-check-in="${run}"]`)!
    check.focus()
    await click(check)
    await waitFor(() => !!line(), 'the line')
    // Focus stays where it was; Tab reaches the line.
    expect(document.activeElement).not.toBe(line())
    expect(line()!.getAttribute('aria-label')).toBe('How did it go? Run')
    expect(line()!.placeholder).toBe('How did it go?')
    const record = occurrenceId(run, '2026-11-11')
    // The record copies no note from the habit (D1).
    expect((await db.tasks.get(record))!.description).toBe('')
    line()!.focus()
    await type(line()!, '5k, knee a bit sore')
    await key(line()!, 'Enter')
    await waitFor(async () => (await db.tasks.get(record))?.description === '5k, knee a bit sore', 'the note')
    expect(line()).toBeNull()
    await waitFor(() => !!row(run)!.querySelector('[data-note-mark="2026-11-11"]'), 'the note mark')
    expect(row(run)!.querySelector('[aria-label="Wednesday 11 November, done, with a note"]')).not.toBeNull()
    // One Undo takes back the note only.
    await waitFor(() => bulkToast()?.label === 'Note saved', 'the toast')
    await undoBatch(bulkToast()!.undoId!)
    const after = (await db.tasks.get(record))!
    expect(after.description).toBe('')
    expect(after.completed_at).toBeTruthy()
    expect((await db.tasks.get(run))!.description).toBe('Training for the 10k in March')
    await r.unmount()
  })

  it('Nothing to say: Escape closes the line and only the check-in is written', async () => {
    const read = await habit('Read', 'every day', '2026-11-11')
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!row(read), 'the row')
    await click(row(read)!.querySelector<HTMLElement>(`[data-check-in="${read}"]`)!)
    await waitFor(() => !!line(), 'the line')
    line()!.focus()
    await type(line()!, 'never mind')
    await key(line()!, 'Escape')
    await waitFor(() => !line(), 'the line closed')
    const rec = (await db.tasks.get(occurrenceId(read, '2026-11-11')))!
    expect(rec.completed_at).toBeTruthy()
    expect(rec.description).toBe('')
    await r.unmount()
  })

  it('On a touch screen it is "Add a note" first, so a check-in stays one tap', async () => {
    window.matchMedia = ((media: string) => ({ matches: media.includes('coarse'), media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as typeof window.matchMedia
    const read = await habit('Read', 'every day', '2026-11-11')
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!row(read), 'the row')
    await click(row(read)!.querySelector<HTMLElement>(`[data-check-in="${read}"]`)!)
    await waitFor(() => !!document.querySelector('[data-add-note]'), 'Add a note')
    expect(line()).toBeNull()
    await click(document.querySelector<HTMLElement>('[data-add-note]')!)
    await waitFor(() => !!line(), 'the line')
    await r.unmount()
  })
})

describe('Note on a past day', () => {
  it('A note for yesterday: Note opens the day\'s note; the streak is unchanged', async () => {
    const run = await habit('Run', 'every day', '2026-11-09')
    await completeTask(run, { today: '2026-11-09' })
    await completeTask(run, { today: '2026-11-10' })
    const before = habitStats((await db.tasks.get(run))!, habitRowsOf(await db.tasks.toArray())((await db.tasks.get(run))!), '2026-11-11')
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!row(run), 'the row')
    await click(row(run)!.querySelector<HTMLElement>('[aria-label="Tuesday 10 November, done"]')!)
    await waitFor(() => !!document.querySelector('[role="menuitem"]'), 'the day menu')
    const note = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((x) => x.textContent?.includes('Note'))!
    await click(note)
    await waitFor(() => !!document.querySelector('[data-testid="day-note"]'), 'the dialog')
    expect(document.querySelector('[data-testid="day-note"]')!.textContent).toContain('Run')
    await setDayNote(occurrenceId(run, '2026-11-10'), 'Easy pace')
    await waitFor(() => !!row(run)!.querySelector('[aria-label="Tuesday 10 November, done, with a note"]'), 'the day named with its note')
    const series = (await db.tasks.get(run))!
    expect(habitStats(series, habitRowsOf(await db.tasks.toArray())(series), '2026-11-11')).toEqual(before)
    await r.unmount()
  })

  it('A missed day asks for its state first, then opens the note of the record it wrote', async () => {
    const run = await habit('Run', 'every day', '2026-11-11')
    await setPastDay(run, '2026-11-08', 'done', Date.now(), '2026-11-11')
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!row(run), 'the row')
    expect(row(run)!.querySelector('[aria-label="Monday 9 November, missed"]')).not.toBeNull()
    dayNote.set({ seriesId: run, date: '2026-11-09' })
    await waitFor(() => !!document.querySelector('[data-day-note-state]'), 'the state choice')
    const done = [...document.querySelectorAll<HTMLElement>('[data-day-note-state] button')].find((b) => b.textContent === 'Done')!
    await click(done)
    await waitFor(async () => !!(await db.tasks.get(occurrenceId(run, '2026-11-09')))?.completed_at, 'the record')
    await waitFor(() => !document.querySelector('[data-day-note-state]'), 'the note in place of the choice')
    await r.unmount()
  })
})

describe('Check-ins on the habit\'s page', () => {
  it('A month of runs: 12 notes in October, newest first, and 12 marked days in the grid', async () => {
    const run = await habit('Run', 'every day', '2026-10-01', { description: 'Training for the 10k in March' })
    const days = ['02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22', '24']
    for (const d of days) {
      await setPastDay(run, `2026-10-${d}`, 'done', Date.now(), '2026-11-11')
      await setDayNote(occurrenceId(run, `2026-10-${d}`), `Run on the ${d}th`)
    }
    // A record written before D1 holding only a copy of the habit's note is no check-in.
    await setPastDay(run, '2026-10-26', 'done', Date.now(), '2026-11-11')
    await updateTask(occurrenceId(run, '2026-10-26'), { description: 'Training for the 10k in March' })
    const r = await render(<HabitPage id={run} />)
    await waitFor(() => !!document.querySelector('[data-check-ins]'), 'Check-ins')
    const entries = [...document.querySelectorAll<HTMLElement>('[data-check-in-entry]')].map((e) => e.dataset.checkInEntry)
    expect(entries).toEqual([...days].reverse().map((d) => `2026-10-${d}`))
    // The habit's own note comes first on the page.
    expect(document.querySelector('[data-habit-note]')).not.toBeNull()
    await click(document.querySelector<HTMLElement>('[aria-label="Previous month"]')!)
    await waitFor(() => document.querySelectorAll('[data-habit-history] [data-note]').length === 12, 'twelve marked days')
    // Screen reader: the date, the state and "with a note".
    expect(document.querySelector('[data-date="2026-10-02"]')!.getAttribute('aria-label')).toBe('2 October, done, with a note')
    expect(document.querySelector('[data-date="2026-10-26"]')!.getAttribute('aria-label')).toBe('26 October, done')
    // An entry opens that day's note.
    await click(document.querySelector<HTMLElement>('[data-check-in-entry="2026-10-24"] button')!)
    expect(dayNote.get()).toEqual({ seriesId: run, date: '2026-10-24' })
    await r.unmount()
  })
})

describe('a check-in note is a task note', () => {
  it('is found by search with the habit\'s title and the date', async () => {
    const run = await habit('Run', 'every day', '2026-11-09')
    await completeTask(run, { today: '2026-11-09' })
    const id = occurrenceId(run, '2026-11-09')
    await setDayNote(id, '5k, knee a bit sore')
    const entry = makeTaskEntry([], '2026-11-11')((await db.tasks.get(id))!)
    expect(entry.label).toBe('Run')
    expect(entry.secondary).toContain('5k, knee a bit sore')
    expect(entry.secondary).toMatch(/9 Nov|Monday/)
  })
})
