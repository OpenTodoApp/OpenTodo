// OpenSpec change rule-boards, task 2.3: a drop on a board column as one undoable batch.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createTask, resetDeviceId, updateTask } from './ops'
import type { OnDropRule } from './types'
import { undoBatch } from './undo'
import { dropOnPanel } from './undoActions'

let n = 0
beforeEach(() => {
  useDatabase(`undo-actions-${Date.now()}-${n++}`)
  resetDeviceId()
})

const TODAY = '2026-10-14'
const URGENT_IMPORTANT = { name: 'Urgent and important', query: '(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)', on_drop: { priority: 1, due: 'today' } as OnDropRule }
const IMPORTANT = { name: 'Important, not urgent', query: '(p1 | p2) & !(due <= tomorrow | deadline <= tomorrow) & !someday', on_drop: { priority: 2, due: 'next-week' } as OnDropRule }

async function drop(id: string, view: typeof URGENT_IMPORTANT) {
  const [labels, projects, sections, tasks] = await Promise.all([db.labels.toArray(), db.projects.toArray(), db.sections.toArray(), db.tasks.toArray()])
  return dropOnPanel(id, view, { filter: { today: TODAY, labels, projects, tasks }, names: { labels, projects, sections }, today: TODAY })
}

describe('dropOnPanel', () => {
  it('writes one batch, names the column and the changes, and Undo restores (spec "Toast and undo")', async () => {
    const id = await createTask({ title: 'Report', priority: 3 })
    await db.outbox.clear()
    const r = await drop(id, URGENT_IMPORTANT)
    expect(r.label).toBe('Moved to Urgent and important: priority 1, due today')
    expect(r.matches).toBe(true)
    expect(await db.tasks.get(id)).toMatchObject({ priority: 1, due: { date: TODAY } })
    const stamps = new Set((await db.outbox.toArray()).map((o) => `${o.ts}|${o.device}`))
    expect(stamps.size).toBe(1)
    const u = await undoBatch(r.entry!.id)
    expect(u.skipped).toEqual([])
    expect(await db.tasks.get(id)).toMatchObject({ priority: 3, due: null })
  })

  it('Undo keeps a field changed again since and names the task', async () => {
    const id = await createTask({ title: 'Report', priority: 3 })
    const r = await drop(id, URGENT_IMPORTANT)
    await updateTask(id, { priority: 2 })
    const u = await undoBatch(r.entry!.id)
    expect(u.skipped).toEqual(['Report'])
    expect(await db.tasks.get(id)).toMatchObject({ priority: 2, due: null })
  })

  it('writes nothing for a task that already matches the rule (spec "Nothing to change")', async () => {
    const id = await createTask({ title: 'Report', priority: 1, due: { date: TODAY } })
    await db.outbox.clear()
    const r = await drop(id, URGENT_IMPORTANT)
    expect(r).toMatchObject({ entry: null, changed: false, label: 'Report already matches Urgent and important' })
    expect(await db.outbox.count()).toBe(0)
  })

  it('says when the task still does not match the column (spec "Still not matching after the rule")', async () => {
    const id = await createTask({ title: 'Tax return', priority: 4, deadline: '2026-10-15' })
    const r = await drop(id, IMPORTANT)
    expect(r.matches).toBe(false)
    expect(r.label).toBe('Moved to Important, not urgent: priority 2, due next week It does not match the column’s filter.')
    expect((await db.tasks.get(id))!.priority).toBe(2)
  })
})
