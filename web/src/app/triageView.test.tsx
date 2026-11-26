// @vitest-environment happy-dom
// Process the Inbox (OpenSpec change inbox-triage, tasks 2.1-2.6, 5.1, 5.2): the
// route and the Process control, the queue and its progress, each decision, the
// pickers and their Escape, delegating in one batch, Someday, the empty state,
// leaving with the task selected, and the Vim list state. On a phone (phone-triage):
// the bar and its More menu, the swipes on the card, the pickers as bottom sheets.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { formatTime, localDueOf, setDateTime } from '../lib/dates'
import { isInboxTask } from '../lib/inbox'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { click, flush, key, minWidthPx, render, type, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { listState } from './listActions'
import { panelTaskId, resetPanel, setPanelTaskId } from './panel'
import { parseRoute } from './router'
import { selectTask } from './signals'
import { delegateEntries, TriageCard, TriageView } from './TriageView'

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
})

const cardTitle = () => document.querySelector<HTMLInputElement>('[data-triage-title]')?.value
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

  it('edits the title on the card, and the decision keys wait until the field is left', async () => {
    const [a] = await inbox('Call teh plumber', 'Next')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Call teh plumber')
    const field = document.querySelector<HTMLInputElement>('[data-triage-title]')!
    expect(field.closest('[data-triage-card]')!.querySelector('input, button, a, select, textarea')).toBe(field)
    await act(async () => { field.focus() })
    await key(field, 't')
    expect(cardTitle()).toBe('Call teh plumber')
    expect((await db.tasks.get(a))!.due ?? null).toBeNull()
    await type(field, 'Call the plumber')
    await act(async () => { field.blur() })
    await waitFor(async () => (await db.tasks.get(a))!.title === 'Call the plumber')
    expect(cardTitle()).toBe('Call the plumber')
    expect(progressText()).toBe('1 of 2')
    await act(async () => { field.focus() })
    await type(field, 'Nope')
    await key(field, 'Escape')
    await flush()
    expect((await db.tasks.get(a))!.title).toBe('Call the plumber')
    expect(cardTitle()).toBe('Call the plumber')
    await key(document.body, 'j')
    await waitFor(() => cardTitle() === 'Next')
    await r.unmount()
  })

  it('opens the panel with Enter and parks with y', async () => {
    const [a] = await inbox('Maybe learn Rust', 'Other')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Maybe learn Rust')
    await key(document.body, 'Enter')
    expect(panelTaskId()).toBe(a)
    await act(async () => { setPanelTaskId(null) })
    await waitFor(() => !document.querySelector('[data-detail-for]'), 'the panel closed')
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
    await flush()
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
  it('the Inbox header shows Process as its primary action, the open count in its meta, and opens the mode', async () => {
    const { TaskListView } = await import('./TaskListView')
    await inbox('One', 'Two')
    history.pushState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!document.querySelector('[data-triage-start]'))
    // inbox-split D3: the count moved to the header's meta ("2 to sort").
    expect(document.querySelector('[data-triage-start]')!.textContent).toContain('Process')
    expect(document.querySelector('header')!.textContent).toContain('2 to sort')
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
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- a digit typed in the field must not act as a shortcut; nothing happening leaves no signal
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

// On a phone (OpenSpec change phone-triage): the decisions are a bar pinned at the end of
// the page with a More menu, the card takes a task row's two swipes, and Move, Delegate
// and Labels are bottom sheets. Every control writes what the key of the same name writes.
describe('on a phone (phone-triage)', () => {
  const original = window.matchMedia
  let coarse = true
  beforeEach(() => {
    coarse = true
    // A phone: 390 px wide, a touch screen unless the test says a mouse.
    window.matchMedia = ((q: string) => ({
      matches: /pointer:\s*coarse/.test(q) ? coarse : q.includes('min-width') ? minWidthPx(q) <= 390 : false, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
  })
  afterEach(() => { window.matchMedia = original; vi.restoreAllMocks(); hideBulkToast() })

  const bar = () => document.querySelector<HTMLElement>('[data-triage-bar]')!
  const inBar = (k: string) => bar().querySelector<HTMLButtonElement>(`[data-decision="${k}"]`)
  const more = () => document.querySelector<HTMLButtonElement>('[data-triage-more]')!
  const item = (k: string) => document.querySelector<HTMLButtonElement>(`[role="menuitem"][data-decision="${k}"]`)
  const card = () => document.querySelector<HTMLElement>('[data-triage-card]')!
  // The header's lead line is in the phone's bar below 768 px; the card names its position.
  const position = () => card().getAttribute('aria-label')
  const sheet = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const option = (name: string) => [...document.querySelectorAll<HTMLElement>('[role="dialog"] [role="option"]')].find((o) => o.textContent!.includes(name))
  async function openMore() {
    await click(more())
    await waitFor(() => !!item('trash'), 'the More menu')
  }
  /** A swipe on the card: the press, the moves, the release, 120 ms apart (as rowSwipe.test.tsx drives it). */
  async function swipe(xs: number[], pointerType = 'touch') {
    let now = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    await act(async () => { card().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, pointerType, clientX: 200, clientY: 50 })) })
    for (const x of xs) {
      now += 120
      await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 3, pointerType, clientX: 200 + x, clientY: 50 })) })
    }
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, pointerType, clientX: 200 + xs[xs.length - 1], clientY: 50 })) })
    clock.mockRestore()
  }

  it('The bar at 390 px: Today, Schedule, Move, Complete and More, then Back and Skip, pinned, with no key', async () => {
    await inbox('One', 'Two')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'One')
    expect([...bar().querySelectorAll<HTMLElement>('button')].map((b) => b.dataset.decision ?? (b.hasAttribute('data-triage-more') ? 'more' : '?')))
      .toEqual(['today', 'schedule', 'move', 'complete', 'more', 'back', 'skip'])
    expect(more().textContent).toBe('More')
    expect(bar().querySelector('.ui-kbd')).toBeNull()
    expect(bar().className).toContain('sticky')
    expect(inBar('back')!.disabled).toBe(true)
    // The rest is in the menu, not on the page.
    expect(document.querySelector('[data-decision="trash"], [data-decision="open"], [data-decision="labels"], [data-decision="delegate"], [data-decision="someday"]')).toBeNull()
    await openMore()
    expect([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((m) => m.dataset.decision)).toEqual(['delegate', 'labels', 'someday', 'open', 'trash'])
    expect(document.querySelector('[role="menu"] .ui-kbd, [role="dialog"] .ui-kbd')).toBeNull()
    await r.unmount()
  })

  it('Today from the bar, Trash and Someday from More: each writes what its key writes, queues it and moves on (offline)', async () => {
    const [a, b, c] = await inbox('Alpha', 'Beta', 'Gamma', 'Delta')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Alpha')
    const before = await db.outbox.count()
    await click(inBar('today')!)
    await waitFor(() => cardTitle() === 'Beta')
    expect((await db.tasks.get(a))!.due).toEqual({ date: '2026-10-14' })
    await openMore()
    await click(item('trash')!)
    await waitFor(() => cardTitle() === 'Gamma')
    expect((await db.tasks.get(b))!.deleted_at).not.toBeNull()
    expect(bulkToast()?.undoId).toBeTruthy()
    await openMore()
    await click(item('someday')!)
    await waitFor(() => cardTitle() === 'Delta')
    expect((await db.tasks.get(c))!.start).toBe('someday')
    // The network answers nothing here: the three decisions are on the device and queued.
    expect(await db.outbox.count()).toBeGreaterThanOrEqual(before + 3)
    expect(position()).toBe('Task 4 of 4')
    await r.unmount()
  })

  it('Complete from the bar, and Open from More', async () => {
    const [a, b] = await inbox('Done already', 'Look closer')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Done already')
    await click(inBar('complete')!)
    await waitFor(() => cardTitle() === 'Look closer')
    expect((await db.tasks.get(a))!.completed_at).not.toBeNull()
    await openMore()
    await click(item('open')!)
    // Below 768 px a task opens as its page.
    expect(location.pathname).toBe(`/task/${b}`)
    await r.unmount()
  })

  it('Nobody to delegate to: Delegate is disabled in More and says why', async () => {
    await inbox('Fix the gate')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Fix the gate')
    await openMore()
    expect(item('delegate')!.disabled).toBe(true)
    expect(item('delegate')!.textContent).toContain('Delegating needs a project you share with someone.')
    await r.unmount()
  })

  it('Skip and Back walk the queue and write nothing', async () => {
    await inbox('One', 'Two', 'Three')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'One')
    const before = await db.outbox.count()
    await click(inBar('skip')!)
    await waitFor(() => cardTitle() === 'Two')
    expect(position()).toBe('Task 2 of 3')
    expect(inBar('back')!.disabled).toBe(false)
    await click(inBar('back')!)
    await waitFor(() => cardTitle() === 'One')
    expect(position()).toBe('Task 1 of 3')
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })

  it('A wide window keeps its bar: every decision a button with its key, no More menu, centred pickers', async () => {
    window.matchMedia = original
    await inbox('One')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'One')
    expect([...bar().querySelectorAll<HTMLElement>('button')].map((b) => b.dataset.decision))
      .toEqual(['today', 'schedule', 'move', 'delegate', 'labels', 'someday', 'complete', 'trash', 'skip', 'back', 'open'])
    expect(bar().querySelectorAll('.ui-kbd').length).toBe(11)
    expect(document.querySelector('[data-triage-more]')).toBeNull()
    expect(bar().className).not.toContain('sticky')
    expect(card().hasAttribute('data-swipeable')).toBe(false)
    await click(inBar('move')!)
    await waitFor(() => !!sheet('triage-move'))
    expect(sheet('triage-move')!.hasAttribute('data-placement')).toBe(false)
    await r.unmount()
  })

  it('inside the Clarify move the two rows follow the card and are not pinned', async () => {
    await inbox('One')
    const r = await render(<TriageCard onLeave={() => {}} />)
    await waitFor(() => cardTitle() === 'One')
    expect(bar().dataset.triageBar).toBe('phone')
    expect(bar().className).not.toContain('sticky')
    expect(inBar('today')).not.toBeNull()
    await r.unmount()
  })

  it('Swipe to complete: past the commit distance the task is completed with Undo and the next one is shown', async () => {
    const [a] = await inbox('Call the plumber', 'Next')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Call the plumber')
    expect(card().hasAttribute('data-swipeable')).toBe(true)
    const before = await db.outbox.count()
    await swipe([20, 60, 110])
    await waitFor(() => cardTitle() === 'Next')
    expect((await db.tasks.get(a))!.completed_at).not.toBeNull()
    expect(bulkToast()?.undoId).toBeTruthy()
    // Offline: on the device at once, and queued.
    expect(await db.outbox.count()).toBeGreaterThan(before)
    await r.unmount()
  })

  it('Swipe to schedule: the sheet opens and nothing is written until a day is chosen', async () => {
    const [a] = await inbox('Plan trip', 'Next')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Plan trip')
    const before = await db.outbox.count()
    await swipe([-20, -60, -110])
    await waitFor(() => !!sheet('schedule-sheet'), 'the scheduling sheet')
    expect(await db.outbox.count()).toBe(before)
    expect(cardTitle()).toBe('Plan trip')
    await click(document.querySelector('[data-choice="tomorrow"]')!)
    await waitFor(() => cardTitle() === 'Next')
    expect((await db.tasks.get(a))!.due).toEqual({ date: '2026-10-15' })
    await r.unmount()
  })

  it('A short swipe returns the card, and a mouse never swipes: nothing is written', async () => {
    await inbox('Stay', 'Next')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Stay')
    const before = await db.outbox.count()
    await swipe([20, 40])
    await swipe([20, 60, 110], 'mouse')
    expect(document.querySelector('[data-testid="schedule-sheet"]')).toBeNull()
    expect(cardTitle()).toBe('Stay')
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
    // A narrow window with a mouse: the card is not swipeable at all.
    coarse = false
    const r2 = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Stay')
    expect(card().hasAttribute('data-swipeable')).toBe(false)
    await swipe([20, 60, 110])
    expect(cardTitle()).toBe('Stay')
    expect(await db.outbox.count()).toBe(before)
    await r2.unmount()
  })

  it('a press in the title while it is edited belongs to the text, not to a swipe', async () => {
    await inbox('Edit me', 'Next')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Edit me')
    const field = document.querySelector<HTMLElement>('[data-triage-title]')!
    await act(async () => { field.focus() })
    const before = await db.outbox.count()
    await act(async () => { field.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 50 })) })
    for (const x of [20, 60, 110]) await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 200 + x, clientY: 50 })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, pointerType: 'touch', clientX: 310, clientY: 50 })) })
    expect(cardTitle()).toBe('Edit me')
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })

  it('Move with one tap: a bottom sheet lists the projects, a tap moves the task and moves on; closing it writes nothing', async () => {
    const home = await createProject({ name: 'Home' })
    const [a] = await inbox('Fix the tap', 'Next')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Fix the tap')
    const before = await db.outbox.count()
    await click(inBar('move')!)
    await waitFor(() => !!option('Home'), 'the projects listed in the sheet')
    expect(sheet('triage-move')!.dataset.placement).toBe('bottom')
    // The list is what was asked for: the keyboard stays closed until the field is tapped.
    expect(document.activeElement?.tagName).not.toBe('INPUT')
    await key(sheet('triage-move')!, 'Escape')
    await waitFor(() => sheet('triage-move') === null)
    expect(cardTitle()).toBe('Fix the tap')
    expect(await db.outbox.count()).toBe(before)
    await click(inBar('move')!)
    await waitFor(() => !!option('Home'))
    await click(option('Home')!)
    await waitFor(() => cardTitle() === 'Next')
    expect((await db.tasks.get(a))!.project_id).toBe(home)
    // Offline: the move is on the device and queued.
    expect(await db.outbox.count()).toBeGreaterThan(before)
    await r.unmount()
  })

  it('Labels stay on the task: the sheet adds a label and the same task is shown; Delegate is a sheet too', async () => {
    const errand = await createLabel({ name: 'errand' })
    const home = await createProject({ name: 'Household' })
    await db.memberships.put({ projectId: home, role: 'owner', ownerId: 'me', members: [{ userId: 'me', name: 'Me', email: 'me@example.com', role: 'owner' }, { userId: 'ana', name: 'Ana', email: 'ana@example.com', role: 'editor' }] })
    const [a] = await inbox('Buy screws', 'Next')
    const r = await render(<TriageView />)
    await waitFor(() => cardTitle() === 'Buy screws')
    await openMore()
    await click(item('labels')!)
    await waitFor(() => !!option('errand'), 'the labels listed in the sheet')
    expect(sheet('triage-labels')!.dataset.placement).toBe('bottom')
    await click(option('errand')!)
    await waitFor(async () => (await db.tasks.get(a))!.labels.includes(errand))
    await key(sheet('triage-labels')!, 'Escape')
    await waitFor(() => sheet('triage-labels') === null)
    expect(cardTitle()).toBe('Buy screws')
    expect(position()).toBe('Task 1 of 2')
    await openMore()
    expect(item('delegate')!.disabled).toBe(false)
    await click(item('delegate')!)
    await waitFor(() => !!option('Ana · Household'), 'the people listed in the sheet')
    expect(sheet('triage-delegate')!.dataset.placement).toBe('bottom')
    await click(option('Ana · Household')!)
    await waitFor(() => cardTitle() === 'Next')
    const moved = (await db.tasks.toArray()).find((t) => t.title === 'Buy screws' && !t.deleted_at)!
    expect([moved.project_id, moved.assignee_id, moved.labels]).toEqual([home, 'ana', [errand]])
    await r.unmount()
  })
})
