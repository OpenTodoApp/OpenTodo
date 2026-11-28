// @vitest-environment happy-dom
// The phone UI in the shell (OpenSpec changes phone-ui-trial and phone-ui-only): the width
// alone chooses the screens, below 768 px; the phone Today lists what the desktop Today lists and
// its row writes through the shared code; the phone task page shows a task's facts
// as rows and buttons and edits them with the present editors and the date sheet.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setTodayLimit } from '../lib/closedListPrefs'
import { addDaysISO, logicalToday } from '../lib/dates'
import { readString, writeString } from '../lib/deviceStorage'
import { createProject, createSubtask, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, minWidthPx, render, waitFor } from '../ui/test-utils'
import { resetPanel } from '../app/panel'
import { navigate } from '../app/router'
import { Shell } from '../app/Shell'
import { resetTaskTrail } from '../app/taskTrail'


/** The element once it is there. */
async function found<T extends Element>(get: () => T | null, what: string): Promise<T> {
  await waitFor(() => get() !== null, what)
  return get()!
}
const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
let width = 390
const original = window.matchMedia
const today = logicalToday()

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  resetTaskTrail()
  width = 390
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width') ? minWidthPx(q) <= width : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  navigate({ view: 'today' })
})
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals() })

const screen = (name: string) => document.querySelector(`[data-phone-screen="${name}"]`)
const rowIds = () => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].map((el) => el.dataset.taskId!)
const row = (id: string) => document.querySelector<HTMLElement>(`[data-phone-row="${id}"]`)!
const stored = (id: string) => db.tasks.get(id)

async function seed() {
  const work = await createProject({ name: 'Work' })
  const late = await createTask({ title: 'Send the invoice', due: { date: addDaysISO(today, -2) }, project_id: work, priority: 1 })
  const timed = await createTask({ title: 'Write the notes', due: { date: today, time: '09:30' } })
  const plain = await createTask({ title: 'Call the bank', due: { date: today } })
  const daily = await createTask({ title: 'Water the plants', due: { date: today }, recurrence: 'every day' })
  return { work, late, timed, plain, daily }
}

describe('where the phone screens are shown', () => {
  it('shows the phone screens below 768 px, whatever the "New phone screens" switch had stored, and removes that value', async () => {
    await seed()
    // The switch is gone (phone-ui-only): its "off" is not read, and the shell drops the key.
    writeString('opentodo.phoneUi', '0')
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!screen('list') && rowIds().length === 4, 'the phone Today')
    // It draws its own bar: the shell's phone bar is left out, the tab bar stays.
    expect(document.querySelector('[data-phone-bar]')).toBeNull()
    expect(document.querySelector('[data-tab-bar]')).not.toBeNull()
    // Every task list is the phone list (phone-lists), and every other screen has the phone header (phone-all-screens).
    navigate({ view: 'inbox' })
    await waitFor(() => document.querySelector('[data-phone-list]')?.getAttribute('data-phone-list') === 'inbox', 'the Inbox as the phone list')
    navigate({ view: 'labels' })
    await waitFor(() => !screen('list') && !!document.querySelector('[data-phone-header]') && !document.querySelector('[data-phone-bar]'), 'Labels under the phone header')
    expect(readString('opentodo.phoneUi')).toBeNull()
    await r.unmount()
  })

  it('shows them at 767 px too', async () => {
    await seed()
    width = 767
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!screen('list') && rowIds().length === 4, 'the phone Today')
    await r.unmount()
  })

  it('keeps the desktop screens from 768 px', async () => {
    await seed()
    width = 768
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => rowIds().length === 4, 'the desktop Today')
    expect(screen('list')).toBeNull()
    await r.unmount()
  })
})

describe('the phone Today', () => {
  it('lists the tasks of the desktop Today, in its groups and order', async () => {
    await seed()
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => rowIds().length === 4, 'the present Today')
    const desktop = rowIds()
    await waitFor(() => !!screen('list') && rowIds().length === 4, 'the phone Today')
    expect(rowIds()).toEqual(desktop)
    const names = [...screen('list')!.querySelectorAll('[data-group-label]')].map((h) => h.textContent)
    expect(names).toEqual(['Earlier', 'Today'])
    // No add field in the page, and no grip on a row.
    expect(screen('list')!.querySelector('input, textarea')).toBeNull()
    expect(screen('list')!.querySelector('[data-grip], [data-drag-handle]')).toBeNull()
    await r.unmount()
  })

  it('a row shows the check, the title and one line of facts', async () => {
    const s = await seed()
    await createSubtask(s.plain, 'Find the card')
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => rowIds().length === 4 && !!row(s.plain).querySelector('[data-fact="subtasks"]'), 'the rows')
    expect(row(s.late).querySelector('[data-fact="project"]')!.textContent).toBe('Work')
    expect(row(s.late).querySelector('[data-fact="due"]')!.className).toContain('text-danger')
    expect(row(s.plain).querySelector('[data-fact="subtasks"]')!.textContent).toBe('0/1')
    expect(row(s.daily).querySelector('[data-fact="repeat"]')!.textContent).toBe('every day')
    for (const id of rowIds()) expect(row(id).querySelectorAll('[data-phone-facts] > [data-fact]').length).toBeLessThanOrEqual(4)
    expect(row(s.timed).querySelector('[data-phone-check]')!.className).toContain('h-14 w-12')
    await r.unmount()
  })

  it('the check completes through the shared write: Undo is offered, a recurring task moves on', async () => {
    const s = await seed()
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => rowIds().length === 4, 'the rows')
    await click(row(s.plain).querySelector('[data-phone-check]')!)
    await waitFor(async () => !!(await stored(s.plain))?.completed_at, 'the task completed')
    await waitFor(() => !!document.querySelector('[data-undo]') || /Undo/.test(document.body.textContent ?? ''), 'the Undo toast')
    await click(row(s.daily).querySelector('[data-phone-check]')!)
    await waitFor(async () => (await stored(s.daily))?.due?.date === addDaysISO(today, 1), 'the recurring task due tomorrow')
    expect((await stored(s.daily))?.completed_at ?? null).toBeNull()
    await r.unmount()
  })

  it('a task from another device appears without a reload', async () => {
    await seed()
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => rowIds().length === 4, 'the rows')
    const added = await createTask({ title: 'Buy stamps', due: { date: today } })
    await waitFor(() => rowIds().includes(added), 'the new task')
    await r.unmount()
  })

  it('the overdue group keeps its actions', async () => {
    const s = await seed()
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    // One Reschedule pill on a phone, Today its first choice (phone-calm D5).
    const pill = await found(() => screen('list')?.querySelector<HTMLElement>('[data-group-actions] [data-earlier-reschedule]') ?? null, 'the group actions')
    expect(screen('list')!.querySelectorAll('[data-group-actions] button')).toHaveLength(1)
    await click(pill)
    const item = await found(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent === 'Today') ?? null, 'Today in the menu')
    await click(item)
    await waitFor(async () => (await stored(s.late))?.due?.date === today, 'the overdue task moved to today')
    await r.unmount()
  })

  it('keeps the Today limit: its line under the date, the rest folded under Waiting for a slot, which opens', async () => {
    await createTask({ title: 'One', due: { date: today } })
    await createTask({ title: 'Two', due: { date: today } })
    await createTask({ title: 'Three', due: { date: today } })
    await setTodayLimit(2)
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    const waiting = () => [...document.querySelectorAll<HTMLElement>('[data-group-toggle]')].find((el) => el.textContent?.includes('Waiting for a slot'))
    await waitFor(() => rowIds().length === 2 && !!waiting(), 'two slots and a folded group')
    expect(document.querySelector('[data-phone-summary]')!.textContent).toContain('2 of 2')
    const fold = waiting()!
    expect(fold.textContent).toContain('Waiting for a slot')
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    await click(fold)
    await waitFor(() => rowIds().length === 3, 'the waiting task shown')
    expect(waiting()!.getAttribute('aria-expanded')).toBe('true')
    await r.unmount()
  })

  it('the menu button opens the drawer', async () => {
    await seed()
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!screen('list'), 'the phone Today')
    const aside = document.querySelector('aside[data-sidebar]')!
    expect(aside.className).toContain('-translate-x-full')
    await click(screen('list')!.querySelector('[data-phone-header] button')!)
    await waitFor(() => !aside.className.includes('-translate-x-full'), 'the drawer open')
    await r.unmount()
  })
})

describe('the phone task page', () => {
  async function open(patch: Parameters<typeof createTask>[0]) {
    const id = await createTask(patch)
    navigate({ view: 'task', id })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!screen('task'), 'the phone task page')
    return { id, r }
  }
  const part = (id: string) => screen('task')!.querySelector<HTMLElement>(`[data-part="${id}"]`)

  it('opens from Today on a tap, with the way back named and the tab bar hidden', async () => {
    const s = await seed()
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => rowIds().length === 4, 'the rows')
    await click(row(s.timed).querySelector('[data-phone-open]')!)
    await waitFor(() => !!screen('task'), 'the task page')
    expect(location.pathname).toBe(`/task/${s.timed}`)
    expect(document.querySelector('[data-tab-bar]')).toBeNull()
    expect(document.querySelector('[data-phone-bar]')).toBeNull()
    expect(screen('task')!.querySelector('[data-page-back]')!.textContent).toBe('Today')
    // The bar holds Back and the menu (phone-calm D2); the second of four steps both ways from the menu.
    expect(screen('task')!.querySelector('[data-phone-header] [data-task-next]')).toBeNull()
    await click(screen('task')!.querySelector('[data-phone-header] button[aria-label="Task actions"]')!)
    const next = await found(() => document.querySelector<HTMLButtonElement>('[role="menuitem"][data-task-next]'), 'Next task in the menu')
    expect(next.disabled).toBe(false)
    expect(next.textContent).toContain('2 of 4')
    await click(next)
    await waitFor(() => location.pathname === `/task/${s.plain}`, 'the next task')
    await r.unmount()
  })

  it('draws what the task has as rows and what it lacks as buttons, none behind a "more"', async () => {
    const { r } = await open({ title: 'Renew passport', due: { date: addDaysISO(today, 1) }, priority: 2, estimate_minutes: 45 })
    await waitFor(() => !!part('estimate'), 'the facts')
    const rows = [...screen('task')!.querySelectorAll('[data-fact]')].map((el) => el.getAttribute('data-fact'))
    expect(rows).toEqual(expect.arrayContaining(['due', 'project', 'priority', 'estimate']))
    const adds = [...screen('task')!.querySelectorAll('[data-fact-add]')].map((el) => el.getAttribute('data-fact-add'))
    expect(adds).toEqual(expect.arrayContaining(['deadline', 'reminders', 'repeat', 'location', 'labels']))
    expect(adds).not.toContain('estimate')
    expect(screen('task')!.querySelector('[data-facts-more]')).toBeNull()
    for (const el of screen('task')!.querySelectorAll('[data-fact] > button')) expect(el.className).toContain('min-h-12')
    await r.unmount()
  })

  it('a task without a date still has its Do row, which opens the date sheet; Tomorrow sets the date and closes it', async () => {
    const { id, r } = await open({ title: 'Renew passport' })
    await waitFor(() => !!part('due'), 'the Do row')
    await click(part('due')!)
    await waitFor(() => !!document.querySelector('[data-phone-date]'), 'the date sheet')
    expect([...document.querySelectorAll('[data-date-choice]')].map((el) => el.getAttribute('data-date-choice'))).toEqual(['today', 'tomorrow', 'weekend', 'next-week'])
    await click(document.querySelector('[data-date-choice="tomorrow"]')!)
    await waitFor(async () => (await stored(id))?.due?.date === addDaysISO(today, 1), 'the date set')
    await waitFor(() => !document.querySelector('[data-phone-date]'), 'the sheet closed')
    await r.unmount()
  })

  it('a day of the month sets the date, and Clear removes it', async () => {
    const { id, r } = await open({ title: 'Renew passport', due: { date: today, time: '15:00' } })
    await waitFor(() => !!part('due'), 'the Do row')
    await click(part('due')!)
    await waitFor(() => !!document.querySelector('[data-date-next]'), 'the month')
    await click(document.querySelector('[data-date-next]')!)
    const day = document.querySelector<HTMLElement>('[data-date-day$="-14"]')!
    await click(day)
    await waitFor(async () => (await stored(id))?.due?.date === day.dataset.dateDay, 'the day set')
    // The task keeps its time.
    expect((await stored(id))?.due?.time).toBe('15:00')
    await click(part('due')!)
    await waitFor(() => !!document.querySelector('[data-date-clear]'), 'Clear')
    await click(document.querySelector('[data-date-clear]')!)
    await waitFor(async () => !(await stored(id))?.due, 'the date cleared')
    await r.unmount()
  })

  it('every other fact opens its present editor, which writes as on the desktop', async () => {
    const { id, r } = await open({ title: 'Renew passport', priority: 2 })
    await waitFor(() => !!part('priority'), 'the Priority row')
    await click(part('priority')!)
    await waitFor(() => !!document.querySelector('[data-facet-editor]'), 'the priority editor')
    const p1 = [...document.querySelectorAll<HTMLElement>('[data-facet-editor] button')].find((b) => /1/.test(b.textContent ?? ''))!
    await click(p1)
    await waitFor(async () => (await stored(id))?.priority === 1, 'priority 1')
    await r.unmount()
  })

  it('the check completes the task', async () => {
    const { id, r } = await open({ title: 'Renew passport' })
    await click(screen('task')!.querySelector('[data-phone-check]')!)
    await waitFor(async () => !!(await stored(id))?.completed_at, 'the task completed')
    await r.unmount()
  })
})
