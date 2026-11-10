// @vitest-environment happy-dom
// The project view blocks of OpenSpec change assistant-project-blocks (tasks 2.1,
// 2.2): a board column, a fitted timeline, activity, statistics tiles, one task in
// full and a habit's grid and streak, each drawn read-only from this device's rows.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../lib/assistantStatus'
import { resetSkills } from '../lib/assistantSkills'
import { db, type AssistantBlock, type AssistantMessage } from '../lib/db'
import { addDaysISO, logicalToday } from '../lib/dates'
import { occurrenceId } from '../lib/ids'
import { createComment } from '../lib/comments'
import { createProject, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { createSection } from '../lib/sections'
import { setCurrentUserId } from '../lib/sharing'
import type { Task } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { AssistantPanelBody, type PanelViewProps } from './assistant/AssistantPanel'
import { panelTaskId } from './panel'
import { parseRoute } from './router'

const noop = () => {}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'm', consented: true,
  disclosure_version: 5, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
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

const opened = (id: string) => waitFor(() => panelTaskId() === id || location.href.includes(id), 'the task opens')

/** Website launch: In progress holds two cards, Done one; one card has no section. */
async function websiteLaunch() {
  const project = await createProject({ name: 'Website launch' })
  const progress = await createSection(project, 'In progress')
  const done = await createSection(project, 'Review')
  const a = await createTask({ title: 'Landing page copy', project_id: project, section_id: progress })
  const b = await createTask({ title: 'Pricing table', project_id: project, section_id: progress })
  await createTask({ title: 'Press kit', project_id: project, section_id: done })
  await createTask({ title: 'Loose idea', project_id: project })
  return { project, progress, done, a, b }
}

const titles = (root: ParentNode, sel: string) => [...root.querySelectorAll(`${sel} .user-text`)].map((n) => n.textContent)

describe('board block', () => {
  it('the In progress column of Website launch: that column\'s cards as on the board; a card opens its task', async () => {
    const w = await websiteLaunch()
    const r = await render(<AssistantPanelBody {...props([{ kind: 'board', id: w.project, section_id: w.progress }])} />)
    await waitFor(() => r.container.querySelectorAll('[data-board-cards] li').length === 2, 'two cards')
    expect(r.container.querySelector('[data-board-column-name]')!.textContent).toBe('In progress')
    expect(r.container.textContent).not.toContain('Press kit')
    // No column switcher when the model named one, and nothing scrolls sideways.
    expect(r.container.querySelector('[data-board-columns]')).toBeNull()
    expect(r.container.querySelector('[data-assistant-board] [data-scroll-x]')).toBeNull()
    const card = [...r.container.querySelectorAll<HTMLElement>('[data-board-cards] li')].find((li) => li.textContent?.includes('Landing page copy'))!
    await click(card)
    await opened(w.a)
  })

  it('without a column: the first with cards, and the others to switch to', async () => {
    const w = await websiteLaunch()
    const r = await render(<AssistantPanelBody {...props([{ kind: 'board', id: w.project }])} />)
    await waitFor(() => r.container.querySelectorAll('[data-board-column]').length === 3, 'three columns')
    const chips = [...r.container.querySelectorAll<HTMLElement>('[data-board-column]')]
    expect(chips.map((c) => c.textContent)).toEqual(['No section1', 'In progress2', 'Review1'])
    expect(chips[0].getAttribute('aria-pressed')).toBe('true')
    await click(chips[2])
    await waitFor(() => r.container.querySelector('[data-board-cards]')?.getAttribute('data-board-cards') === w.done, 'Review shows')
    expect(r.container.textContent).toContain('Press kit')
  })

  it('a column that is gone says so', async () => {
    const w = await websiteLaunch()
    const r = await render(<AssistantPanelBody {...props([{ kind: 'board', id: w.project, section_id: 'gone' }])} />)
    await waitFor(() => r.container.textContent!.includes('Removed'), 'removed')
  })
})

describe('timeline block', () => {
  it('bars from start to deadline on an axis fitted to the block, late ones in the late tone, undated ones counted', async () => {
    const today = logicalToday()
    const project = await createProject({ name: 'Renovation' })
    const late = await createTask({ title: 'Order tiles', project_id: project, start: addDaysISO(today, -6), deadline: addDaysISO(today, -2) })
    await createTask({ title: 'Paint walls', project_id: project, start: addDaysISO(today, 1), deadline: addDaysISO(today, 8) })
    await createTask({ title: 'Some day', project_id: project })
    const r = await render(<AssistantPanelBody {...props([{ kind: 'timeline', id: project }])} />)
    await waitFor(() => r.container.querySelectorAll('[data-timeline-row]').length === 2, 'two rows')
    expect(titles(r.container, '[data-timeline-row]')).toEqual(['Order tiles', 'Paint walls'])
    expect(r.container.querySelector(`[data-timeline-row="${late}"]`)!.getAttribute('data-late')).toBe('true')
    expect(r.container.querySelector(`[data-bar="${late}"]`)!.className).toContain('ui-block--late')
    expect(r.container.querySelector('[data-today-mark]')).not.toBeNull()
    expect(r.container.textContent).toContain('1 task without dates')
    // The row's name is its visible title, then its dates and lateness.
    const row = r.container.querySelector<HTMLElement>(`[data-timeline-row="${late}"] button`)!
    expect(row.textContent).toMatch(/^Order tiles, .+, 2 days late$/)
    expect(r.container.querySelector('[data-assistant-timeline] [data-scroll-x], [data-assistant-timeline] [title]')).toBeNull()
    await click(row)
    await opened(late)
  })
})

describe('activity block', () => {
  it('a project\'s latest changes, newest first, naming their tasks', async () => {
    const project = await createProject({ name: 'Website launch' })
    const a = await createTask({ title: 'Landing page copy', project_id: project })
    await updateTask(a, { priority: 1 })
    const r = await render(<AssistantPanelBody {...props([{ kind: 'activity', of: 'project', id: project }])} />)
    await waitFor(() => r.container.querySelector('[data-event]')?.textContent?.includes('Landing page copy') ?? false, 'events naming the task')
    const events = [...r.container.querySelectorAll('[data-event]')]
    expect(events.length).toBeLessThanOrEqual(20)
    expect(events[0].textContent).toContain('You')
    expect(events[0].textContent).toContain('Landing page copy')
  })

  it('a task with no activity on this device says so', async () => {
    const r = await render(<AssistantPanelBody {...props([{ kind: 'activity', of: 'task', id: 'nothing' }])} />)
    await waitFor(() => r.container.textContent!.includes('No activity on this device yet.'), 'empty')
  })
})

describe('stats block', () => {
  it('done on the days, overdue, the Inbox and Today against the Today limit', async () => {
    const today = logicalToday()
    await db.userPrefs.put({ id: 'me', today_limit: 3, _clock: {} } as never)
    await createTask({ title: 'Done today', due: { date: today }, completed: true })
    await createTask({ title: 'Late', due: { date: addDaysISO(today, -3) } })
    await createTask({ title: 'Today one', due: { date: today } })
    await createTask({ title: 'Unplaced' })
    const r = await render(<AssistantPanelBody {...props([{ kind: 'stats', from: addDaysISO(today, -6), to: today }])} />)
    await waitFor(() => r.container.querySelectorAll('[data-tile]').length === 4, 'four tiles')
    const tile = (id: string) => r.container.querySelector(`[data-tile="${id}"] [data-tile-value]`)!.textContent
    expect([tile('done'), tile('earlier'), tile('inbox'), tile('today')]).toEqual(['1', '1', '1', '2 of 3'])
  })
})

describe('task block', () => {
  it('one task in full: its notes, subtasks and latest comments, read-only, with Open task', async () => {
    const id = await createTask({ title: 'Write the brief', description: 'Keep it **short**.' })
    await createTask({ title: 'Outline', parent_id: id })
    await createTask({ title: 'Draft', parent_id: id, completed: true })
    for (const body of ['First', 'Second', 'Third', 'Fourth']) await createComment({ taskId: id, body })
    const r = await render(<AssistantPanelBody {...props([{ kind: 'task', id }])} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-comments] li').length === 3, 'three comments')
    expect(r.container.querySelector('[data-task-notes]')!.textContent).toBe('Keep it short.')
    expect(r.container.querySelector('[data-subtasks]')!.textContent).toContain('1 of 2')
    expect([...r.container.querySelectorAll('[data-task-comments] li')].map((li) => li.textContent)).toEqual([expect.stringContaining('Second'), expect.stringContaining('Third'), expect.stringContaining('Fourth')])
    // No editors: no add line, no composer, no text field.
    expect(r.container.querySelector('[data-assistant-task] input, [data-assistant-task] textarea, [data-assistant-task] [contenteditable]')).toBeNull()
    await click([...r.container.querySelectorAll<HTMLElement>('[data-assistant-task] button')].find((b) => b.textContent === 'Open task')!)
    await opened(id)
  })
})

describe('habit block', () => {
  it('the habit Run with a 5-day streak: the grid and "5 days"', async () => {
    const today = logicalToday()
    const series = await createTask({ title: 'Run', recurrence: 'every day', due: { date: today } })
    await updateTask(series, { habit: true } as Partial<Task>)
    const records = [1, 2, 3, 4, 5].map((n) => {
      const date = addDaysISO(today, -n)
      return { id: occurrenceId(series, date), title: 'Run', description: '', project_id: null, parent_id: null, priority: 4, due: { date }, labels: [], position: 0,
        created_at: 1, completed_at: 1, deleted_at: null, series_id: series, occurrence_date: date, _clock: {} }
    })
    await db.tasks.bulkPut(records as never)
    const r = await render(<AssistantPanelBody {...props([{ kind: 'habit', id: series }])} />)
    await waitFor(() => !!r.container.querySelector('[data-testid="habit-streak"]'), 'the streak')
    expect(r.container.querySelector('[data-testid="habit-streak"]')!.textContent).toContain('5 days')
    expect(r.container.querySelector('[data-habit-history] [role="grid"]')).not.toBeNull()
    expect(r.container.querySelector(`[data-date="${addDaysISO(today, -1)}"]`)!.getAttribute('data-state')).toBe('done')
  })
})

it('the six blocks add no scroll region to the transcript (design "Interface budget")', async () => {
  const w = await websiteLaunch()
  const today = logicalToday()
  const r = await render(<AssistantPanelBody {...props([
    { kind: 'board', id: w.project }, { kind: 'timeline', id: w.project }, { kind: 'activity', of: 'project', id: w.project },
    { kind: 'stats', from: today, to: today }, { kind: 'task', id: w.a }, { kind: 'habit', id: w.b },
  ])} />)
  await waitFor(() => !!r.container.querySelector('[data-board-cards]') && !!r.container.querySelector('[data-assistant-task]') && !!r.container.querySelector('[data-assistant-stats]'), 'the blocks')
  const scrollers = [...r.container.querySelectorAll('[data-assistant-block] *')].filter((el) => /overflow-(x|y|auto)|overflow-auto|overflow-scroll/.test(el.getAttribute('class') ?? '') || el.hasAttribute('data-scroll-x'))
  expect(scrollers.map((el) => el.outerHTML.slice(0, 80))).toEqual([])
})

it('a block names its kind', async () => {
  const r = await render(<AssistantPanelBody {...props([{ kind: 'stats', from: '2026-11-09', to: '2026-11-15' }])} />)
  await waitFor(() => !!r.container.querySelector('[data-assistant-block="stats"]'), 'the frame')
  expect(r.container.querySelector('[data-assistant-block="stats"]')!.getAttribute('aria-label')).toContain('Statistics')
  expect(parseRoute('/').view).toBeDefined()
})
