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
import { createProject, createTask, resetDeviceId } from '../lib/ops'
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

  it('shows a due time in the 12-hour format and a zone-fixed due in the viewer\'s zone, never the raw HH:MM', async () => {
    setDateTime({ date_format: 'month-day', time_format: '12h', week_start: 'sun' }, { order: 'DM', hour12: false, weekStart: 1 })
    await createTask({ title: 'Floating', due: { date: '2026-10-15', time: '15:00' } })
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Floating')
    const meta = () => document.querySelector('[data-triage-card] p')?.textContent ?? ''
    expect(meta()).toMatch(/3:00\sPM/)
    expect(meta()).not.toContain('15:00')
    await r.unmount()
    await db.tasks.clear()
    const zoned = { date: '2026-10-15', time: '15:00', tz: 'Pacific/Auckland' }
    await createTask({ title: 'Zoned', due: zoned })
    const r2 = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Zoned')
    expect(meta()).toContain(formatTime(localDueOf(zoned).time!))
    await r2.unmount()
  })
})
