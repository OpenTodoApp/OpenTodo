// @vitest-environment happy-dom
// The planning list from a label or a saved view (GitHub issue 369, OpenSpec change
// plan-list-sources): label tasks "week", open the Calendar, plan from "week".
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createLabel } from '../../lib/labels'
import { createProject, createTask, resetDeviceId, setTaskCompleted } from '../../lib/ops'
import type { Label, Project, Task, View } from '../../lib/types'
import { createView } from '../../lib/views'
import { click, flush, render, type } from '../../ui/test-utils'
import { PanelHost } from '../PanelHost'
import { openPanel, resetPanel } from '../panel'
import { PLAN_PANEL, PlanPanel } from './PlanPanel'
import { planSources, planSourceTasks, resolveSource, TRAY_KEY } from './planSource'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
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

const task = (p: Partial<Task>): Task => ({
  id: p.id ?? 't', title: 'T', description: '', project_id: null, parent_id: null, section_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, updated_at: 0, completed_at: null, deleted_at: null, recurrence: null, estimate_minutes: null, assignee_id: null, _clock: {}, ...p,
} as unknown as Task)

describe('planSources and planSourceTasks', () => {
  const projects = [{ id: 'p1', name: 'Home', archived: false, deleted_at: null }, { id: 'p2', name: 'Old', archived: true, deleted_at: null }] as unknown as Project[]
  const labels = [{ id: 'l1', name: 'week', color: '#f97316', deleted_at: null }, { id: 'l2', name: 'gone', deleted_at: 1 }] as unknown as Label[]
  const views = [{ id: 'v1', name: 'Quick wins', kind: 'list', query: 'p1', deleted_at: null }, { id: 'v2', name: 'Board', kind: 'dashboard', query: '', deleted_at: null }] as unknown as View[]

  it('offers the lists, live projects, labels and list views, and falls back to the Inbox', () => {
    const s = planSources({ projects, labels, views })
    expect(s.map((x) => x.key)).toEqual(['inbox', 'nodate', 'overdue', 'project:p1', 'label:l1', 'view:v1'])
    expect(resolveSource('label:l2', s).key).toBe('inbox')
    expect(resolveSource('label:l1', s).label).toBe('week')
  })

  it('a label lists its open tasks, by due date then priority', () => {
    const tasks = [
      task({ id: 'a', labels: ['l1'], due: { date: '2026-10-20' } }),
      task({ id: 'b', labels: ['l1'], priority: 1 }),
      task({ id: 'c', labels: ['l1'], completed_at: 1 }),
      task({ id: 'd', labels: ['l1'], project_id: 'p2' }),
      task({ id: 'e' }),
    ]
    const s = resolveSource('label:l1', planSources({ projects, labels, views }))
    expect(planSourceTasks(s, { projects, labels, views, tasks, today: '2026-10-14' }).map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('the picker in the planning list', () => {
  it('plans from a label and from a saved view, found by typing, and remembers the choice on this device', async () => {
    const week = await createLabel({ name: 'week' })
    const home = await createProject({ name: 'Home' })
    await createTask({ title: 'Renew passport' })
    await createTask({ title: 'Paint the fence', project_id: home, labels: [week] })
    await createTask({ title: 'Fix the tap', project_id: home, priority: 1 })
    const done = await createTask({ title: 'Old chore', labels: [week] })
    await setTaskCompleted(done, true)
    await createView({ name: 'Urgent', query: 'p1' })

    openPanel(PLAN_PANEL, () => <PlanPanel />)
    const r = await render(<PanelHost />)
    const frame = () => document.querySelector('[data-panel-frame="calendar-plan"]')!
    const titles = () => [...frame().querySelectorAll('[data-tray-task]')].map((b) => b.textContent)
    await waitFor(() => titles().join() === 'Renew passport')

    const pick = async (query: string, name: string) => {
      await click(frame().querySelector('button[aria-label="Plan from"]')!)
      await waitFor(() => document.querySelector('[data-combobox] input[role="combobox"]') !== null)
      await type(document.querySelector<HTMLInputElement>('[data-combobox] input[role="combobox"]')!, query)
      await waitFor(() => [...document.querySelectorAll('[role="option"]')].some((o) => o.textContent?.trim() === name))
      await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim() === name)!)
      await flush(30)
    }

    await pick('wee', 'week')
    await waitFor(() => titles().join() === 'Paint the fence')
    expect(localStorage.getItem(TRAY_KEY)).toBe(`label:${week}`)
    expect(frame().querySelector('[data-plan-source]')!.textContent).toContain('week')

    await pick('urg', 'Urgent')
    await waitFor(() => titles().join() === 'Fix the tap')
    expect(localStorage.getItem(TRAY_KEY)!.startsWith('view:')).toBe(true)
    await r.unmount()

    // Opened again, the list starts from the remembered view.
    resetPanel()
    openPanel(PLAN_PANEL, () => <PlanPanel />)
    const again = await render(<PanelHost />)
    await waitFor(() => titles().join() === 'Fix the tap')
    await again.unmount()
  })
})
