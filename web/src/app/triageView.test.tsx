// @vitest-environment happy-dom
// Process the Inbox (OpenSpec change inbox-triage, tasks 2.1-2.6, 5.1, 5.2): the
// route and the Process control, the queue and its progress, each decision, the
// pickers and their Escape, delegating in one batch, Someday, the empty state,
// leaving with the task selected, and the Vim list state.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { formatTime, localDueOf, setDateTime } from '../lib/dates'
import { isInboxTask } from '../lib/inbox'
import { createProject, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { click, flush, key, render, type } from '../ui/test-utils'
import { listState } from './listActions'
import { panelTaskId, resetPanel, setPanelTaskId } from './panel'
import { parseRoute } from './router'
import { selectTask } from './signals'
import { delegateEntries, TriageView } from './TriageView'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  await setCurrentUserId('me')
  history.pushState(null, '', '/triage')
  window.dispatchEvent(new PopStateEvent('popstate'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const cardTitle = () => document.querySelector('[data-triage-card] h2')?.textContent
const progressText = () => document.querySelector('[data-triage-progress]')?.textContent
async function inbox(...titles: string[]) {
  const ids: string[] = []
  for (const t of titles) ids.push(await createTask({ title: t }))
  return ids
}

describe('the triage mode', () => {
  it('parses /triage and walks the Inbox with t, j and k, counting decisions and skips', async () => {
    expect(parseRoute('/triage')).toEqual({ view: 'triage' })
    const ids = await inbox('One', 'Two', 'Three', 'Four', 'Five')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'One')
    expect(progressText()).toBe('1 of 5')
    await key(document.body, 't')
    await waitFor(() => cardTitle() === 'Two')
    expect((await db.tasks.get(ids[0]))!.due).toEqual({ date: '2026-10-14' })
    await key(document.body, 'j')
    await waitFor(() => cardTitle() === 'Three')
    expect(progressText()).toBe('3 of 5')
    await key(document.body, 'k')
    await waitFor(() => cardTitle() === 'Two')
    expect(progressText()).toBe('2 of 5')
    expect(document.querySelector('[data-triage-live]')!.textContent).toContain('2 of 5: Two')
    await r.unmount()
  })

  it('completes with c, trashes with Delete, and follows arrivals and departures', async () => {
    const [a, b] = await inbox('Alpha', 'Beta', 'Gamma')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Alpha')
    await key(document.body, 'c')
    await waitFor(() => cardTitle() === 'Beta')
    expect((await db.tasks.get(a))!.completed_at).not.toBeNull()
    await key(document.body, 'Delete')
    await waitFor(() => cardTitle() === 'Gamma')
    expect((await db.tasks.get(b))!.deleted_at).not.toBeNull()
    await createTask({ title: 'Arrived' })
    // Decided tasks keep their place, so the count stays stable and the arrival joins the end.
    await waitFor(() => progressText() === '3 of 4')
    await r.unmount()
  })

  it('schedules with a typed date, cancels a picker with Escape, and leaves with the task selected', async () => {
    const [first] = await inbox('Plan trip', 'Pay rent')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Plan trip')
    await key(document.body, 'm')
    await waitFor(() => document.querySelector('[role="dialog"]') !== null)
    await key(document.querySelector('[role="dialog"]')!, 'Escape')
    await waitFor(() => document.querySelector('[role="dialog"]') === null)
    expect(cardTitle()).toBe('Plan trip')
    expect(await db.outbox.count()).toBeGreaterThan(0)
    const before = await db.outbox.count()
    await key(document.body, 's')
    await waitFor(() => !!document.querySelector('[role="dialog"] input'))
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await type(input, 'fri')
    await key(input, 'Enter')
    await waitFor(() => cardTitle() === 'Pay rent')
    expect((await db.tasks.get(first))!.due).toEqual({ date: '2026-10-16' })
    expect(await db.outbox.count()).toBeGreaterThan(before)
    await key(document.body, 'Escape')
    expect(location.pathname).toBe('/')
    expect(selectTask.take()).not.toBeNull()
    await r.unmount()
  })

  it('opens the panel with Enter and parks with y', async () => {
    const [a] = await inbox('Maybe learn Rust', 'Other')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Maybe learn Rust')
    await key(document.body, 'Enter')
    expect(panelTaskId()).toBe(a)
    await act(async () => { setPanelTaskId(null) })
    await flush(20)
    await key(document.body, 'y')
    await waitFor(() => cardTitle() === 'Other')
    expect((await db.tasks.get(a))!.start).toBe('someday')
    await r.unmount()
  })

  it('disables Delegate without a shared project, and delegates into a project in one batch', async () => {
    await inbox('Fix the gate')
    let r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Fix the gate')
    expect(document.querySelector<HTMLButtonElement>('[data-decision="delegate"]')!.disabled).toBe(true)
    await key(document.body, 'a')
    await flush(20)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await r.unmount()

    const home = await createProject({ name: 'Household' })
    await db.memberships.put({ projectId: home, role: 'owner', ownerId: 'me', members: [{ userId: 'me', name: 'Me', email: 'me@example.com', role: 'owner' }, { userId: 'ana', name: 'Ana', email: 'ana@example.com', role: 'editor' }] })
    expect(delegateEntries(await db.memberships.toArray(), await db.projects.toArray(), 'me').map((d) => d.label)).toEqual(['Ana · Household'])
    r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Fix the gate')
    const before = await db.outbox.count()
    await key(document.body, 'a')
    await waitFor(() => !!document.querySelector('[role="dialog"] [role="option"]'))
    await click(document.querySelector('[role="dialog"] [role="option"]')!)
    await waitFor(() => document.querySelector('[data-triage-card]') === null)
    const moved = (await db.tasks.toArray()).find((t) => t.title === 'Fix the gate' && !t.deleted_at)!
    expect([moved.project_id, moved.assignee_id]).toEqual([home, 'ana'])
    const ops = (await db.outbox.toArray()).slice(before)
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    await r.unmount()
  })

  it('shows Inbox zero when nothing is left, and lets the Vim layer skip and trash through the list state', async () => {
    let r = await render(<TriageView />)
    await waitFor(() => document.body.textContent!.includes('Inbox zero'))
    await r.unmount()
    const [, b] = await inbox('First', 'Second', 'Third')
    r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'First')
    const s = listState()!
    await act(async () => { s.select(s.rows()[1].id) })
    await waitFor(() => cardTitle() === 'Second')
    expect(progressText()).toBe('2 of 3')
    await act(async () => { await s.toggleComplete(b, true) })
    await waitFor(() => cardTitle() === 'Third')
    await r.unmount()
  })
})

describe('entering', () => {
  it('the Inbox header shows Process with the open count and opens the mode', async () => {
    const { TaskListView } = await import('./TaskListView')
    await inbox('One', 'Two')
    history.pushState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!document.querySelector('[data-triage-start]'))
    expect(document.querySelector('[data-triage-start]')!.textContent).toContain('2')
    await click(document.querySelector('[data-triage-start]')!)
    expect(location.pathname).toBe('/triage')
    await r.unmount()
  })
})

describe('dates on the card (ux-feedback-2)', () => {
  afterEach(() => setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }))

  // Only a task decided this session can have a date on the card (a dated task is not an
  // Inbox task, inbox-means-unplaced): skip it, come back with k, and date it elsewhere.
  async function datedOnCard(title: string, due: { date: string; time: string; tz?: string }) {
    const id = await createTask({ title })
    await createTask({ title: 'Other' })
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === title)
    await key(document.body, 'j')
    await waitFor(() => cardTitle() === 'Other')
    await key(document.body, 'k')
    await waitFor(() => cardTitle() === title)
    await act(async () => { await updateTask(id, { due }) })
    await waitFor(() => (document.querySelector('[data-triage-card] p')?.textContent ?? '') !== '')
    return r
  }

  it('shows a due time in the 12-hour format and a zone-fixed due in the viewer\'s zone, never the raw HH:MM', async () => {
    setDateTime({ date_format: 'month-day', time_format: '12h', week_start: 'sun' }, { order: 'DM', hour12: false, weekStart: 1 })
    const meta = () => document.querySelector('[data-triage-card] p')?.textContent ?? ''
    const r = await datedOnCard('Floating', { date: '2026-10-15', time: '15:00' })
    expect(meta()).toMatch(/3:00\sPM/)
    expect(meta()).not.toContain('15:00')
    await r.unmount()
    await db.tasks.clear()
    const zoned = { date: '2026-10-15', time: '15:00', tz: 'Pacific/Auckland' }
    const r2 = await datedOnCard('Zoned', zoned)
    expect(meta()).toContain(formatTime(localDueOf(zoned).time!))
    await r2.unmount()
  })
})

describe('the scheduling sheet (inbox-means-unplaced)', () => {
  afterEach(() => setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }))
  const sheet = () => document.querySelector('[data-testid="schedule-sheet"]')
  const relative = () => [...document.querySelectorAll<HTMLButtonElement>('[data-relative]')].map((b) => [b.getAttribute('aria-keyshortcuts'), b.dataset.relative])

  it('A week before the deadline: s then 4 sets the do-on date, keeps the deadline, leaves the Inbox and moves on', async () => {
    const id = await createTask({ title: 'Tax return', deadline: '2026-10-30' })
    await createTask({ title: 'Next one' })
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Tax return')
    await key(document.body, 's')
    await waitFor(() => !!sheet())
    expect(relative().map(([k]) => k)).toEqual(['1', '2', '3', '4', '5'])
    await key(document.body, '4')
    await waitFor(() => cardTitle() === 'Next one')
    const task = (await db.tasks.get(id))!
    expect(task.due).toEqual({ date: '2026-10-23' })
    expect(task.deadline).toBe('2026-10-30')
    expect(isInboxTask(task)).toBe(false)
    expect(sheet()).toBeNull()
    await r.unmount()
  })

  it('Choices in the past are left out and the others keep their keys', async () => {
    await createTask({ title: 'Soon', deadline: '2026-10-17' })
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Soon')
    await key(document.body, 's')
    await waitFor(() => !!sheet())
    expect(relative()).toEqual([['1', 'on'], ['2', 'day'], ['3', 'three-days']])
    await r.unmount()
  })

  it('No deadline: the quick choices come first and there is no relative row nor "No date"', async () => {
    await createTask({ title: 'Plain' })
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Plain')
    await key(document.body, 's')
    await waitFor(() => !!sheet())
    expect(document.querySelector('[data-relative-choices]')).toBeNull()
    expect([...document.querySelectorAll<HTMLElement>('[data-choice]')].map((b) => b.dataset.choice)).toEqual(['today', 'tomorrow', 'weekend', 'next-week'])
    await r.unmount()
  })

  it("User's date format: every date in the sheet follows month-day order", async () => {
    setDateTime({ date_format: 'month-day', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
    await createTask({ title: 'Format', deadline: '2026-10-23' })
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Format')
    await key(document.body, 's')
    await waitFor(() => !!sheet())
    const text = sheet()!.textContent ?? ''
    expect(text).toContain('Oct 23')
    expect(text).not.toContain('23 Oct')
    await r.unmount()
  })

  it('Cancel: Escape writes nothing, closes the sheet and keeps the same task', async () => {
    const id = await createTask({ title: 'Stay', deadline: '2026-10-30' })
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Stay')
    const before = await db.outbox.count()
    await key(document.body, 's')
    await waitFor(() => !!sheet())
    await key(sheet()!, 'Escape')
    await waitFor(() => sheet() === null)
    expect(cardTitle()).toBe('Stay')
    expect(await db.outbox.count()).toBe(before)
    expect((await db.tasks.get(id))!.due).toBeNull()
    await r.unmount()
  })

  it('number keys do nothing while typing in the date field', async () => {
    const id = await createTask({ title: 'Typing', deadline: '2026-10-30' })
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Typing')
    await key(document.body, 's')
    await waitFor(() => !!document.querySelector('[data-date-words]'))
    await key(document.querySelector('[data-date-words]')!, '4')
    await flush(40)
    expect(sheet()).not.toBeNull()
    expect((await db.tasks.get(id))!.due).toBeNull()
    await r.unmount()
  })

  it('Offline, and the count stays stable: three tasks scheduled from the sheet leave the Inbox and queue their operations', async () => {
    const ids = await inbox('One', 'Two', 'Three')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'One')
    const before = await db.outbox.count()
    for (const next of ['Two', 'Three']) {
      await key(document.body, 's')
      await waitFor(() => !!document.querySelector('[data-choice="tomorrow"]'))
      await click(document.querySelector('[data-choice="tomorrow"]')!)
      await waitFor(() => cardTitle() === next)
      expect(progressText()).toBe(`${next === 'Two' ? 2 : 3} of 3`)
    }
    await key(document.body, 's')
    await waitFor(() => !!document.querySelector('[data-choice="tomorrow"]'))
    await click(document.querySelector('[data-choice="tomorrow"]')!)
    await waitFor(() => document.body.textContent!.includes('Inbox zero'))
    for (const id of ids) expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-15' })
    expect(await db.outbox.count()).toBeGreaterThan(before)
    await r.unmount()
  })
})
