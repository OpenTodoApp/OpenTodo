// @vitest-environment happy-dom
// The planning list's Time sectors source (OpenSpec change time-sectors, task 3.4):
// offered while the switch is on, grouped with counts and estimates, only available
// tasks with a waiting footer, Do today as one undoable change, and a remembered
// source read as the Inbox once the switch is off.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createTask, mutateMany, resetDeviceId } from '../../lib/ops'
import { setTimeSectors } from '../../lib/sectorPrefs'
import type { Task } from '../../lib/types'
import { undoBatch } from '../../lib/undo'
import { click, render, visibleText, waitFor } from '../../ui/test-utils'
import { PanelHost } from '../PanelHost'
import { openPanel, resetPanel } from '../panel'
import { PLAN_PANEL, PlanPanel } from './PlanPanel'
import { planSources, resolveSource, saveTray } from './planSource'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 12, 0)) // Wednesday of 2026-W44
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
})

const data = { projects: [], labels: [], views: [] }
const sector = async (title: string, value: string, extra: { estimate_minutes?: number } = {}) => {
  const id = await createTask({ title, ...extra })
  await mutateMany([{ entity: 'task', entityId: id, patch: { sector: value } }])
  return id
}

describe('the Time sectors source', () => {
  it('is offered only with the switch on; a remembered one reads as the Inbox when off', () => {
    expect(planSources(data, { sectors: true }).some((s) => s.key === 'sectors')).toBe(true)
    const off = planSources(data)
    expect(off.some((s) => s.key === 'sectors')).toBe(false)
    expect(resolveSource('sectors', off).key).toBe('inbox')
  })

  it('groups available tasks, counts the waiting ones, and Do today dates a task in one undoable change', async () => {
    await setTimeSectors(true)
    saveTray('sectors')
    const draft = await sector('Draft the budget', '2026-W44', { estimate_minutes: 30 })
    await sector('Book the venue', '2026-W45')
    await sector('Sort the photos', '2026-W42')
    const blocker = await createTask({ title: 'Get the quote' })
    const sign = await sector('Sign the contract', '2026-W44')
    await mutateMany([{ entity: 'task', entityId: sign, patch: { blocked_by: [blocker] } }])
    openPanel(PLAN_PANEL, () => <PlanPanel />)
    const r = await render(<PanelHost />)
    const group = (g: string) => document.querySelector(`[data-sector-group="${g}"]`) as HTMLElement | null
    await waitFor(() => !!group('this-week'), 'the groups')
    expect([...document.querySelectorAll('[data-sector-group]')].map((e) => e.getAttribute('data-sector-group'))).toEqual(['carried', 'this-week', 'next-week'])
    expect(visibleText(group('this-week')!)).toContain('This week1 · 30m')
    expect([...group('this-week')!.querySelectorAll('[data-tray-task]')].map((b) => b.textContent)).toEqual(['Draft the budget30m'])
    const footer = group('this-week')!.querySelector('[data-sector-waiting]')!
    expect(footer.textContent).toBe('1 waiting')
    await click(footer)
    await waitFor(() => group('this-week')!.querySelector('[data-tray-task]')?.textContent === 'Sign the contract', 'the waiting task')
    await click(footer)

    await click(group('this-week')!.querySelector(`[data-sector-today="${draft}"]`)!)
    await waitFor(async () => !!(await db.tasks.get(draft))?.due, 'dated')
    const t = (await db.tasks.get(draft)) as Task
    expect(t.due).toEqual({ date: '2026-10-28' })
    expect(t.sector).toBe('')
    await waitFor(() => !group('this-week')?.querySelector(`[data-tray-task="${draft}"]`), 'it leaves the list')
    const entry = (await db.assistantUndo.toArray()).at(-1)!
    await undoBatch(entry.id)
    await waitFor(async () => (await db.tasks.get(draft))?.sector === '2026-W44', 'undone')
    expect((await db.tasks.get(draft))?.due).toBeNull()
    await r.unmount()
  })
})
