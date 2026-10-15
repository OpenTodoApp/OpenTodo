// @vitest-environment happy-dom
// One row anatomy (OpenSpec change ux-overhaul, task-list-presentation): every
// list reserves the same leading slot, so checkboxes align across flat and tree
// views, and the metadata line exists only when there is metadata.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { Task } from '../lib/types'
import { flush, render } from '../ui/test-utils'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})
afterEach(() => { document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'Task', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)

/** The children of a row before its checkbox: the leading slot, and the tick box when the list offers one. */
function anatomy(li: Element): string[] {
  const out: string[] = []
  for (const child of li.children) {
    if (child.querySelector('button[aria-label="Complete task"], button[aria-label="Reopen task"]') || child.matches('button[aria-label="Complete task"]')) break
    if (child.hasAttribute('data-drop-indicator')) continue
    out.push(child.hasAttribute('data-leading-slot') ? 'slot' : child.tagName.toLowerCase())
  }
  return out
}

describe('leading slot', () => {
  it('is reserved in flat and tree views alike, with the chevron only on rows with children', async () => {
    const project = await createProject({ name: 'Home' })
    const parent = await createTask({ title: 'Plan trip', project_id: project, due: { date: '2026-10-14' } })
    await createTask({ title: 'Book flights', project_id: project, parent_id: parent })
    await createTask({ title: 'Call mum', due: { date: '2026-10-14' } })
    const { setDateTime } = await import('../lib/dates')
    setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
    const { vi } = await import('vitest')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    try {
      const today = await render(<TaskListView route={{ view: 'today' }} />)
      await waitFor(() => today.container.textContent!.includes('Call mum'))
      const flat = [...today.container.querySelectorAll('[data-task-id]')]
      expect(flat.length).toBeGreaterThan(0)
      for (const li of flat) expect(anatomy(li)[0]).toBe('slot')
      expect(today.container.querySelector('[data-leading-slot] button')).toBeNull()
      await today.unmount()

      const list = await render(<TaskListView route={{ view: 'project', id: project }} />)
      await waitFor(() => list.container.textContent!.includes('Book flights'))
      const rows = [...list.container.querySelectorAll('[data-task-id]')]
      for (const li of rows) expect(anatomy(li)[0]).toBe('slot')
      const parentRow = rows.find((r) => r.getAttribute('data-task-id') === parent)!
      expect(parentRow.querySelector('[data-leading-slot] button[aria-expanded]')).toBeTruthy()
      const childRow = rows.find((r) => r.textContent?.includes('Book flights'))!
      expect(childRow.querySelector('[data-leading-slot] button')).toBeNull()
      await list.unmount()
    } finally {
      vi.useRealTimers()
      setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
    }
  })
})

describe('metadata line', () => {
  it('is absent on a bare task and present once there is something to show', async () => {
    const bare = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    expect(bare.container.querySelector('[data-row-meta]')).toBeNull()
    await bare.unmount()
    const dated = await render(<ul><TaskRow task={task({ estimate_minutes: 30 })} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    expect(dated.container.querySelector('[data-row-meta]')).toBeTruthy()
    await dated.unmount()
  })
})
