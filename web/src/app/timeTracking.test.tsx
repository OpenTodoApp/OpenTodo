// @vitest-environment happy-dom
// Time tracking in the lists and the shell (OpenSpec change time-tracking, tasks
// 3.2, 3.3 and 5.2): the tracked figure on rows, the `y` key, Today's totals and
// the running indicator.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { applyOps, createTask, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { logTime, startTracking } from '../lib/timeEntries'
import type { Task } from '../lib/types'
import { click, flush, key, render, spokenText, visibleText } from '../ui/test-utils'
import { PanelHost } from './PanelHost'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'
import { TrackingIndicator, TrackingPill } from './TrackingIndicator'
import { TriageView } from './TriageView'

let n = 0
const NOW = new Date(2026, 9, 14, 12, 0)
const original = window.matchMedia
let width = 1280
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useDatabase(`tracking-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('u1')
  width = 1280
  window.matchMedia = ((q: string) => ({
    matches: Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  window.matchMedia = original
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'Task', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)
const noop = () => {}

describe('Chip with tracked and estimate (task-list-presentation)', () => {
  it('Detailed: one chip reads 35m / 1h, spoken as minutes tracked of the estimate', async () => {
    const r = await render(<ul><TaskRow task={task({ estimate_minutes: 60 })} tracked={35} selected={false} showProject={false} onToggle={noop} onOpen={noop} detail="detailed" /></ul>)
    const chips = r.container.querySelectorAll('[data-estimate]')
    expect(chips).toHaveLength(1)
    expect(visibleText(chips[0])).toBe('35m / 1h')
    expect(spokenText(chips[0])).toContain('35 minutes tracked of 1 hour estimated')
    expect(r.container.querySelector('[data-row-counts]')).toBeNull()
  })

  it('Detailed without an estimate: 35m tracked', async () => {
    const r = await render(<ul><TaskRow task={task({})} tracked={35} selected={false} showProject={false} onToggle={noop} onOpen={noop} detail="detailed" /></ul>)
    expect(visibleText(r.container.querySelector('[data-tracked]')!)).toBe('35m tracked')
  })

  it('Calm: the figure moves into the quiet trailing group, and the estimate chip leaves the metadata line', async () => {
    const r = await render(<ul><TaskRow task={task({ estimate_minutes: 60 })} tracked={35} selected={false} showProject={false} onToggle={noop} onOpen={noop} detail="calm" /></ul>)
    expect(r.container.querySelector('[data-estimate]')).toBeNull()
    const quiet = r.container.querySelector('[data-row-counts] [data-tracked]')!
    expect(visibleText(quiet)).toBe('35m / 1h')
    expect(spokenText(quiet)).toContain('35 minutes tracked of 1 hour estimated')
  })

  it('a row without entries keeps the plain estimate chip', async () => {
    const r = await render(<ul><TaskRow task={task({ estimate_minutes: 60 })} selected={false} showProject={false} onToggle={noop} onOpen={noop} detail="detailed" /></ul>)
    expect(visibleText(r.container.querySelector('[data-estimate]')!)).toBe('1h')
  })
})

describe('the y key in Today (time-tracking "Start and stop from the web app")', () => {
  it('Keyboard start: y starts an entry, the chip reads 0m / 1h and the indicator names the task; y again stops it', async () => {
    const id = await createTask({ title: 'Write the report', due: { date: '2026-10-14' }, estimate_minutes: 60 })
    const r = await render(<><TaskListView route={{ view: 'today' }} /><TrackingIndicator /><PanelHost /></>)
    await waitFor(() => r.container.textContent!.includes('Write the report'))
    await key(document.body, 'j')
    await key(document.body, 'y')
    await waitFor(() => !!r.container.querySelector('[data-tracking-indicator]'))
    const entries = await db.timeEntries.where('task_id').equals(id).toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].ended_at).toBeNull()
    expect(visibleText(r.container.querySelector('[data-tracking-text]')!)).toBe('0m · Write the report')
    await waitFor(() => !!r.container.querySelector('[data-row-counts] [data-tracked]') || !!r.container.querySelector('[data-tracked]'))
    expect(visibleText((r.container.querySelector('[data-row-counts] [data-tracked]') ?? r.container.querySelector('[data-tracked]'))!)).toBe('0m / 1h')
    expect(r.container.querySelector('[data-tracking-announcer]')!.textContent).toBe('Tracking time on Write the report')
    // Keyboard stop.
    await key(document.body, 'y')
    await waitFor(() => !r.container.querySelector('[data-tracking-indicator]'))
    expect((await db.timeEntries.get(entries[0].id))!.ended_at).toBe(NOW.getTime())
    expect(r.container.querySelector('[data-tracking-announcer]')!.textContent).toBe('Tracking stopped')
  })

  it('Today totals: the header reads planned and tracked, counting only entries that started today', async () => {
    const a = await createTask({ title: 'Plan', due: { date: '2026-10-14' }, estimate_minutes: 120 })
    await createTask({ title: 'Call', due: { date: '2026-10-14' }, estimate_minutes: 60 })
    await logTime(a, new Date(2026, 9, 13, 23, 30).getTime(), new Date(2026, 9, 13, 23, 59).getTime())
    await logTime(a, new Date(2026, 9, 14, 9, 0).getTime(), new Date(2026, 9, 14, 10, 20).getTime())
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!r.container.querySelector('[data-page-meta]')?.textContent?.includes('tracked'))
    expect(r.container.querySelector('[data-page-meta]')!.textContent).toContain('3h planned · 1h 20m tracked')
  })

  it('Triage keeps its key: y parks the task in Someday and starts no entry', async () => {
    const id = await createTask({ title: 'Inbox thing' })
    const r = await render(<TriageView />)
    await waitFor(() => r.container.textContent!.includes('Inbox thing'))
    await key(document.body, 'y')
    await waitFor(() => r.container.textContent!.includes('Inbox') && true)
    await flush(60)
    expect((await db.tasks.get(id))!.start).toBe('someday')
    expect(await db.timeEntries.count()).toBe(0)
  })
})

describe('the running indicator', () => {
  it('Indicator on a desktop: 1:05 · the title, Stop, and activation opens the task', async () => {
    const id = await createTask({ title: 'Write the report' })
    await startTracking(id, { now: NOW.getTime() - 65 * 60000 })
    const r = await render(<><TrackingIndicator /><PanelHost /></>)
    await waitFor(() => !!r.container.querySelector('[data-tracking-text]'))
    expect(visibleText(r.container.querySelector('[data-tracking-text]')!)).toBe('1:05 · Write the report')
    const open = r.container.querySelector<HTMLButtonElement>('[data-tracking-open]')!
    expect(open.getAttribute('aria-label')).toBe('Tracking 1:05 · Write the report')
    await click(open)
    await waitFor(() => !!document.querySelector('[data-task-title]'))
    await click(r.container.querySelector('[data-tracking-stop]')!)
    await waitFor(() => !r.container.querySelector('[data-tracking-indicator]'))
  })

  it('Indicator on a phone: the bar shows the time; the sheet has the title, Open and Stop', async () => {
    width = 390
    const id = await createTask({ title: 'Write the report' })
    await startTracking(id, { now: NOW.getTime() - 65 * 60000 })
    const r = await render(<TrackingPill />)
    await waitFor(() => !!r.container.querySelector('[data-tracking-pill]'))
    expect(visibleText(r.container.querySelector('[data-tracking-pill]')!)).toBe('1:05')
    await click(r.container.querySelector('[data-tracking-pill]')!)
    const sheet = document.querySelector('[data-testid="tracking-sheet"]')!
    expect(sheet.getAttribute('data-placement')).toBe('sheet')
    expect(sheet.textContent).toContain('Write the report')
    const stop = [...sheet.querySelectorAll('button')].find((b) => b.textContent === 'Stop tracking')!
    await click(stop)
    await waitFor(() => !r.container.querySelector('[data-tracking-pill]'))
  })

  it('Nothing running: no tracking control', async () => {
    const r = await render(<><TrackingIndicator /><TrackingPill /></>)
    await flush(60)
    expect(r.container.querySelector('[data-tracking-indicator], [data-tracking-pill]')).toBeNull()
  })

  it('Stopped on another device: a remote ended_at removes it without a reload, with one announcement each way', async () => {
    const id = await createTask({ title: 'Write the report' })
    const r = await render(<TrackingIndicator />)
    const announcer = () => r.container.querySelector('[data-tracking-announcer]')!.textContent
    expect(announcer()).toBe('')
    const entry = await startTracking(id, { now: NOW.getTime() - 10 * 60000 })
    await waitFor(() => !!r.container.querySelector('[data-tracking-indicator]'))
    expect(announcer()).toBe('Tracking time on Write the report')
    await applyOps([{ id: 'remote-stop', entity: 'time_entry', entityId: entry, field: 'ended_at', value: NOW.getTime(), ts: Date.now() + 10_000_000, device: 'phone' }])
    await waitFor(() => !r.container.querySelector('[data-tracking-indicator]'))
    expect(announcer()).toBe('Tracking stopped')
  })
})
