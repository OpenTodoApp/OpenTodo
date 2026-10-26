// @vitest-environment happy-dom
// The task panel's Time tab (OpenSpec change time-tracking, task 4.1; web-app
// "Task panel tabs"; time-tracking "Time tab and manual entries").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, createTask, resetDeviceId, applyOps } from '../../lib/ops'
import { db, useDatabase } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { setCurrentUserId } from '../../lib/sharing'
import { logTime } from '../../lib/timeEntries'
import type { HistoryPage, Task } from '../../lib/types'
import { click, key, render, type, visibleText, waitFor } from '../../ui/test-utils'
import { ConversationTabs } from './ConversationTabs'
import { TimeTab } from './TimeTab'

vi.mock('../../lib/history', async (orig) => ({ ...(await orig<typeof import('../../lib/history')>()), fetchHistory: async (): Promise<HistoryPage> => ({ entity: 'task', id: 'x', changeSets: [], more: false }) }))

const NOW = new Date(2026, 9, 14, 12, 0)
let k = 0
let task: Task
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  useDatabase(`timetab-${Date.now()}-${k++}`)
  resetDeviceId()
  await setCurrentUserId('me')
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  task = (await db.tasks.get(await createTask({ title: 'Write the report' })))!
})
afterEach(() => {
  vi.useRealTimers()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
})

const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-time-entry]')]
const at = (h: number, m: number) => new Date(2026, 9, 14, h, m).getTime()

describe('Time tab', () => {
  it('Time tab by keyboard: the arrows reach "Time · 35m", Tab reaches Start tracking first, Enter starts an entry at the top', async () => {
    await logTime(task.id, at(9, 0), at(9, 35))
    const v = await render(<ConversationTabs task={task} userId="me" readOnly={false} />)
    await waitFor(() => !!v.container.querySelector('[role="tab"][aria-selected="true"]'), 'the tabs')
    let current = v.container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!
    for (let i = 0; i < 3; i++) {
      current.focus()
      await key(current, 'ArrowRight')
      current = document.activeElement as HTMLElement
    }
    await waitFor(() => current.textContent === 'Time · 35m' && !!v.container.querySelector('[data-time-tab]'), 'the Time tab with its total')
    expect(current.textContent).toBe('Time · 35m')
    const panel = v.container.querySelector('[data-time-tab]')!
    const firstFocusable = panel.querySelector<HTMLElement>('button, input, [tabindex="0"]')!
    expect(firstFocusable.textContent).toBe('Start tracking')
    await click(firstFocusable)
    await waitFor(() => !!rows(v.container)[0]?.hasAttribute('data-running'), 'the running entry')
    expect(rows(v.container)[0].hasAttribute('data-running')).toBe(true)
    expect(visibleText(panel.querySelector('[data-time-toggle]')!)).toBe('Stop tracking')
    await v.unmount()
  })

  it('Log past work: 1h30 adds a closed 90-minute entry ending now at the top, and the total grows', async () => {
    await logTime(task.id, at(8, 0), at(8, 30))
    const v = await render(<TimeTab task={task} readOnly={false} />)
    await waitFor(() => !!v.container.querySelector('[data-time-total]')?.textContent?.includes('30m'), 'the total')
    expect(visibleText(v.container.querySelector('[data-time-total]')!)).toBe('Total 30m')
    await click(v.container.querySelector('[data-time-add-open]')!)
    await type(v.container.querySelector<HTMLInputElement>('[data-time-duration]')!, '1h30')
    await click([...v.container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!)
    await waitFor(async () => (await db.timeEntries.count()) === 2 && rows(v.container).length === 2, 'the new entry')
    const top = (await db.timeEntries.toArray()).sort((a, b) => b.started_at - a.started_at)[0]
    expect(top).toMatchObject({ started_at: NOW.getTime() - 90 * 60000, ended_at: NOW.getTime() })
    expect(rows(v.container)[0].getAttribute('data-time-entry')).toBe(top.id)
    expect(visibleText(v.container.querySelector('[data-time-total]')!)).toBe('Total 2h')
    await v.unmount()
  })

  it('End before start: the form shows the error and writes nothing', async () => {
    const v = await render(<TimeTab task={task} readOnly={false} />)
    await waitFor(() => !!v.container.querySelector('[data-time-add-open]'), 'the Log time button')
    await click(v.container.querySelector('[data-time-add-open]')!)
    await click([...v.container.querySelectorAll('button')].find((b) => b.textContent === 'Enter a start and an end')!)
    await type(v.container.querySelector<HTMLInputElement>('[data-time-start]')!, '10:30')
    await type(v.container.querySelector<HTMLInputElement>('[data-time-end]')!, '10:00')
    await click([...v.container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!)
    await waitFor(() => !!v.container.querySelector('[data-time-error]'), 'the error')
    expect(v.container.querySelector('[data-time-error]')!.textContent).toBe('The end is before the start')
    expect(await db.timeEntries.count()).toBe(0)
    await v.unmount()
  })

  it('Edit an end time offline: the entry reads 15 minutes longer at once', async () => {
    const id = await logTime(task.id, at(10, 0), at(10, 30))
    const v = await render(<TimeTab task={task} readOnly={false} />)
    // The entry's menu comes once its owner is known.
    await waitFor(() => !!rows(v.container)[0]?.querySelector('button'), 'the entry with its menu')
    await click(document.querySelector('[data-time-entry] button[aria-haspopup]') ?? rows(v.container)[0].querySelector('button')!)
    await waitFor(() => !!document.querySelector('[data-time-entry-edit]'), 'the entry menu')
    await click(document.querySelector('[data-time-entry-edit]')!)
    await waitFor(() => !!v.container.querySelector('[data-time-edit] [data-time-end]'), 'the edit form')
    const end = v.container.querySelector<HTMLInputElement>('[data-time-edit] [data-time-end]')!
    await type(end, '10:45')
    await click([...v.container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!)
    await waitFor(async () => (await db.timeEntries.get(id))!.ended_at === at(10, 45) && !v.container.querySelector('[data-time-edit]'), 'the edit saved')
    expect((await db.timeEntries.get(id))!.ended_at).toBe(at(10, 45))
    expect(visibleText(rows(v.container)[0].querySelector('[data-time-duration-text]')!)).toBe('45m')
    expect((await db.outbox.toArray()).some((o) => o.entityId === id && o.field === 'ended_at')).toBe(true)
    await v.unmount()
  })

  it('Who tracked what: each entry names its author, the total sums both, only own entries carry a menu', async () => {
    const p = await createProject({ name: 'Client A' })
    const shared = (await db.tasks.get(await createTask({ title: 'Offer', project_id: p })))!
    await db.memberships.put({ projectId: p, role: 'owner', ownerId: 'me', members: [
      { userId: 'me', name: 'Me', email: 'me@example.com', role: 'owner' }, { userId: 'ana', name: 'Ana', email: 'ana@example.com', role: 'editor' }] })
    await logTime(shared.id, at(9, 0), at(9, 20))
    const field = (f: string, value: unknown) => ({ id: `ana-${f}`, entity: 'time_entry' as const, entityId: 'ana-1', field: f, value, ts: 5, device: 'ana-phone' })
    await applyOps([field('task_id', shared.id), field('user_id', 'ana'), field('started_at', at(10, 0)), field('ended_at', at(10, 30)), field('note', ''), field('deleted_at', null)])
    const v = await render(<TimeTab task={shared} readOnly={false} />)
    // Authors and menus come once the members are read.
    await waitFor(() => rows(v.container).length === 2 && rows(v.container).every((r) => !!r.querySelector('[data-time-author]')) && !!rows(v.container)[1].querySelector('button'), 'both entries with their authors')
    const list = rows(v.container)
    expect(list.map((r) => r.querySelector('[data-time-author]')!.textContent)).toEqual(['Ana', 'You'])
    expect(visibleText(v.container.querySelector('[data-time-total]')!)).toBe('Total 50m')
    expect(list[0].querySelector('button')).toBeNull()
    expect(list[1].querySelector('button')).not.toBeNull()
    const axe = (await import('axe-core')).default
    const res = await axe.run(v.container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    expect(res.violations.map((x) => x.id)).toEqual([])
    await v.unmount()
  })
})
