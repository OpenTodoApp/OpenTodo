// @vitest-environment happy-dom
// The time blocks of OpenSpec change assistant-time-blocks (task 2.2): tracked time
// per project, free time between meetings, and deadlines in date order, each drawn
// from this device's rows.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../lib/assistantStatus'
import { resetSkills } from '../lib/assistantSkills'
import { db, setMeta, type AssistantBlock, type AssistantMessage } from '../lib/db'
import { addDaysISO, logicalToday } from '../lib/dates'
import { createProject, createTask, resetDeviceId, TIME_ENTRY_DEFAULTS } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { click, render, waitFor } from '../ui/test-utils'
import { AssistantPanelBody, type PanelViewProps } from './assistant/AssistantPanel'
import { panelTaskId } from './panel'
import { parseRoute } from './router'

const currentRoute = () => parseRoute(location.pathname)

const noop = () => {}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'm', consented: true,
  disclosure_version: 4, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}
const props = (blocks: AssistantBlock[]): PanelViewProps => ({
  status, connected: true, messages: [{ role: 'assistant', text: '', blocks: blocks.map((block) => ({ at: 0, block })), at: 2 } as AssistantMessage],
  streaming: null, announce: '', statusAnnounce: '', review: null, result: null, reviewBusy: false, error: null,
  draft: '', consentBusy: false, consentError: null, threads: null, onToggle: noop, onApply: noop, onDiscard: noop, onUndo: noop, onDraft: noop,
  onSend: noop, onStop: noop, onAccept: noop, onPickThread: noop,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetAssistantStatus()
  resetSkills([])
  setAssistantStatus(status)
  await setCurrentUserId('me')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { vi.unstubAllGlobals() })

const at = (date: string, h: number, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime() }
const entry = (id: string, taskId: string, start: number, minutes: number, user = 'me') =>
  ({ ...TIME_ENTRY_DEFAULTS, id, task_id: taskId, user_id: user, started_at: start, ended_at: start + minutes * 60_000, _clock: {} })

describe('time block', () => {
  it('a week by project: one bar per project with its total, and the overall total; a bar opens Statistics', async () => {
    const website = await createProject({ name: 'Website' })
    const home = await createProject({ name: 'Home' })
    const a = await createTask({ title: 'Landing page', project_id: website })
    const b = await createTask({ title: 'Fix the tap', project_id: home })
    await db.timeEntries.bulkPut([
      entry('e1', a, at('2026-11-10', 9), 240), entry('e2', a, at('2026-11-11', 9), 120), entry('e3', b, at('2026-11-12', 18), 120),
      // Someone else's time and time outside the week are not the user's week.
      entry('e4', a, at('2026-11-12', 9), 60, 'someone'), entry('e5', b, at('2026-11-20', 9), 60),
    ] as never)
    const r = await render(<AssistantPanelBody {...props([{ kind: 'time', from: '2026-11-09', to: '2026-11-15', group_by: 'project' }])} />)
    await waitFor(() => r.container.querySelectorAll('[data-time-group]').length === 2, 'two bars')
    const bars = [...r.container.querySelectorAll('[data-time-group]')].map((li) => li.textContent)
    expect(bars).toEqual(['Website6h', 'Home2h'])
    expect(r.container.querySelector('[data-time-total]')!.textContent).toBe('Total8h')
    await click(r.container.querySelector<HTMLElement>(`[data-time-group="${website}"] button`)!)
    expect(currentRoute().view).toBe('stats')
  })

  it('by day lists every day of a short range, and says when nothing was tracked', async () => {
    const t1 = await createTask({ title: 'Write' })
    await db.timeEntries.bulkPut([entry('e1', t1, at('2026-11-10', 9), 90)] as never)
    const r = await render(<AssistantPanelBody {...props([{ kind: 'time', from: '2026-11-09', to: '2026-11-11', group_by: 'day' }, { kind: 'time', from: '2026-12-01', to: '2026-12-02', group_by: 'day' }])} />)
    await waitFor(() => r.container.querySelectorAll('[data-time-group]').length === 3, 'three days')
    expect([...r.container.querySelectorAll('[data-time-group]')].map((li) => li.getAttribute('data-time-group'))).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
    await waitFor(() => r.container.textContent!.includes('No time tracked on these days.'), 'the empty block')
  })
})

describe('free time block', () => {
  it('two free hours: meetings 9 to 11 and 13 to 15 in an 8 to 18 working day leave nothing shorter than two hours', async () => {
    const day = '2031-01-16'
    await setMeta('calendar.grid', { startHour: 8, endHour: 18, dayLength: 480 })
    await db.calendarEvents.bulkPut([
      { id: 'm1', subscriptionId: 's', uid: 'a', summary: 'enc:v1:unreadable', location: '', start: { date: day, time: '09:00' }, end: { date: day, time: '11:00' }, allDay: false, free: false },
      { id: 'm2', subscriptionId: 's', uid: 'b', summary: 'Standup', location: '', start: { date: day, time: '13:00' }, end: { date: day, time: '15:00' }, allDay: false, free: false },
    ])
    // A short stretch between a timed task and the second meeting is left out.
    await createTask({ title: 'Call', due: { date: day, time: '12:00' }, estimate_minutes: 30 })
    const r = await render(<AssistantPanelBody {...props([{ kind: 'free_time', date: day, span: 'day', min_minutes: 120 }])} />)
    await waitFor(() => !!r.container.querySelector('[data-free-day]'), 'the day')
    const stretches = [...r.container.querySelectorAll('[data-free-stretch]')].map((li) => li.getAttribute('data-free-stretch'))
    expect(stretches).toEqual(['15:00-18:00'])
    expect(r.container.querySelector('[data-free-day]')!.textContent).toContain('3h free')
    // No title of an event is shown, readable or not.
    expect(r.container.textContent).not.toContain('Standup')
    await click(r.container.querySelector<HTMLElement>('[data-free-day] button')!)
    expect(currentRoute()).toMatchObject({ view: 'day', date: day })
  })

  it('a week lists seven days, and a past day has no free time left', async () => {
    const yesterday = addDaysISO(logicalToday(), -1)
    const r = await render(<AssistantPanelBody {...props([{ kind: 'free_time', date: yesterday, span: 'week', min_minutes: 30 }])} />)
    await waitFor(() => r.container.querySelectorAll('[data-free-day]').length === 7, 'seven days')
    expect(r.container.querySelector(`[data-free-day="${yesterday}"]`)!.textContent).toContain('No free time')
  })
})

describe('deadlines block', () => {
  it('before Friday: the open tasks with deadlines in date order with their countdowns; a row opens the task', async () => {
    const today = logicalToday()
    const wed = addDaysISO(today, 2)
    const fri = addDaysISO(today, 4)
    await createTask({ title: 'Ship the release', deadline: fri })
    const first = await createTask({ title: 'Send the invoice', deadline: wed })
    await createTask({ title: 'Already done', deadline: wed, completed: true })
    await createTask({ title: 'Later', deadline: addDaysISO(today, 10) })
    const r = await render(<AssistantPanelBody {...props([{ kind: 'deadlines', from: today, to: fri }])} />)
    await waitFor(() => r.container.querySelectorAll('[data-deadline-task]').length === 2, 'two rows')
    const rows = [...r.container.querySelectorAll('[data-deadline-task]')]
    expect(rows.map((li) => li.querySelector('.user-text')!.textContent)).toEqual(['Send the invoice', 'Ship the release'])
    expect(rows.map((li) => li.querySelector('[data-deadline]')!.textContent!.split('Deadline')[0])).toEqual(['2d', '4d'])
    await click(rows[0].querySelector<HTMLElement>('button')!)
    await waitFor(() => panelTaskId() === first || location.href.includes(first), 'the task opens')
  })
})
