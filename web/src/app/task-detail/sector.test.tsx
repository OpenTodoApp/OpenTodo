// @vitest-environment happy-dom
// The When popover's Sector segment (OpenSpec change time-sectors, task 3.2):
// offered while the switch is on or the task has a sector, one batch that writes
// the sector and clears the do-on date and start (the deadline kept), one Undo,
// the reverse when a date is set, disabled for a repeating task, text for a viewer.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { addDaysISO, currentDateTime, logicalToday } from '../../lib/dates'
import { db } from '../../lib/db'
import { createTask, mutateMany } from '../../lib/ops'
import { setTimeSectors } from '../../lib/sectorPrefs'
import { currentPeriods } from '../../lib/sectors'
import type { Task } from '../../lib/types'
import { undoBatch } from '../../lib/undo'
import { click, visibleText } from '../../ui/test-utils'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

const task = async (id: string) => (await db.tasks.get(id)) as Task
const tab = () => document.querySelector<HTMLButtonElement>('[data-when-tab="sector"]')
const choice = (sector: string) => document.querySelector<HTMLButtonElement>(`[data-sector-choice="${sector}"]`)

describe('the Sector segment', () => {
  it('replaces a fake date in one batch, keeps the deadline, and one Undo restores it', async () => {
    await setTimeSectors(true)
    const today = logicalToday()
    const due = { date: addDaysISO(today, 1) }
    const deadline = addDaysISO(today, 4)
    const id = await createTask({ title: 'Draft the budget', due, deadline, start: today })
    const view = await open(id)
    await click(view.valueButton('due'))
    await waitFor(() => !!tab(), 'the Sector tab')
    await click(tab()!)
    const week = currentPeriods(today, currentDateTime().weekStart)['this-week']
    await waitFor(() => !!choice(week), 'the quick choices')
    expect(visibleText(document.querySelector('[data-sector-segment]')!)).toContain('This week')
    await db.outbox.clear()
    await click(choice(week)!)
    await waitFor(async () => (await task(id)).sector === week, 'the sector')
    const t = await task(id)
    expect(t.due).toBeNull()
    expect(t.start).toBeNull()
    expect(t.deadline).toBe(deadline)
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id)
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    expect(ops.map((o) => o.field).sort()).toEqual(['due', 'sector', 'start'])
    await waitFor(() => !view.editor(), 'the popover closed')
    await waitFor(() => !!view.row('sector') && visibleText(view.row('sector')).includes('This week'), 'the When line')
    const entry = (await db.assistantUndo.toArray()).at(-1)!
    await undoBatch(entry.id)
    await waitFor(async () => (await task(id)).sector === '', 'undone')
    expect((await task(id)).due).toEqual(due)
    await view.unmount()
  })

  it('dating a sectored task clears the sector in the same batch', async () => {
    const id = await createTask({ title: 'Call Ana' })
    await mutateMany([{ entity: 'task', entityId: id, patch: { sector: '2026-W45' } }])
    await db.outbox.clear()
    await mutateMany([{ entity: 'task', entityId: id, patch: { due: { date: '2026-11-04' } } }])
    const t = await task(id)
    expect(t.sector).toBe('')
    const ops = (await db.outbox.toArray()).filter((o) => o.entity === 'task')
    expect(ops.map((o) => o.field).sort()).toEqual(['due', 'sector'])
  })

  it('switch off: no Sector tab for a task without a sector; one from elsewhere shows with Clear', async () => {
    const plain = await createTask({ title: 'Plain', due: { date: logicalToday() } })
    let view = await open(plain)
    await click(view.valueButton('due'))
    await waitFor(() => !!document.querySelector('[data-when-tab="due"]'), 'the When tabs')
    expect(tab()).toBeNull()
    await view.unmount()

    const id = await createTask({ title: 'From the CLI' })
    await mutateMany([{ entity: 'task', entityId: id, patch: { sector: currentPeriods(logicalToday(), currentDateTime().weekStart)['next-week'] } }])
    view = await open(id)
    await waitFor(() => !!view.row('sector'), 'the sector part')
    expect(visibleText(view.row('sector'))).toContain('Next week')
    await click(view.valueButton('sector'))
    await waitFor(() => !!view.editor()?.querySelector('[data-facet-clear]'), 'Clear')
    await click(view.editor()!.querySelector('[data-facet-clear]')!)
    await waitFor(async () => (await task(id)).sector === '', 'cleared')
    await view.unmount()
  })

  it('a repeating task keeps a date', async () => {
    await setTimeSectors(true)
    const id = await createTask({ title: 'Stretch', due: { date: logicalToday() }, recurrence: 'every monday' })
    const view = await open(id)
    await click(view.valueButton('due'))
    await waitFor(() => !!tab(), 'the Sector tab')
    await click(tab()!)
    await waitFor(() => !!document.querySelector('[data-sector-disabled]'), 'the disabled segment')
    expect(visibleText(document.querySelector('[data-sector-disabled]')!)).toContain('Repeating tasks keep a date')
    await view.unmount()
  })

  it('a viewer reads the sector as text', async () => {
    const id = await createTask({ title: 'Shared' })
    await mutateMany([{ entity: 'task', entityId: id, patch: { sector: currentPeriods(logicalToday(), currentDateTime().weekStart)['this-month'] } }])
    const view = await open(id, { readOnly: true })
    await waitFor(() => !!view.row('sector'), 'the sector part')
    expect(view.row('sector').tagName).not.toBe('BUTTON')
    expect(visibleText(view.row('sector'))).toContain('This month')
    await view.unmount()
  })
})
