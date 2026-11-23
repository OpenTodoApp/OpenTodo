// @vitest-environment happy-dom
// A plain rename is one step of undo history (OpenSpec change undo-rename, #1748): every
// title editor commits through commitTitleEdit (the list's inline editor, the task panel, Triage).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { redoBatch, topUndo, undoBatch } from '../lib/undo'
import { commitTitleEdit } from './titleEdit'

let n = 0
beforeEach(() => {
  useDatabase(`title-edit-${Date.now()}-${n++}`)
  resetDeviceId()
})

const rename = async (id: string, title: string) => commitTitleEdit((await db.tasks.get(id))!, { patch: { title }, labels: [], reminders: [] }, [])
const step = async () => topUndo(await db.assistantUndo.toArray())

describe('a plain rename', () => {
  it('records one step named with both titles; undo and redo', async () => {
    const id = await createTask({ title: 'Milk' })
    await rename(id, 'Oat milk')
    expect((await db.tasks.get(id))!.title).toBe('Oat milk')
    const s = await step()
    expect(s?.label).toBe('Renamed “Milk” → “Oat milk”')
    await undoBatch(s!.id)
    expect((await db.tasks.get(id))!.title).toBe('Milk')
    await redoBatch(s!.id)
    expect((await db.tasks.get(id))!.title).toBe('Oat milk')
  })

  it('names a long rename with each title clipped', async () => {
    const id = await createTask({ title: 'a'.repeat(60) })
    await rename(id, 'b'.repeat(60))
    expect((await step())?.label).toBe(`Renamed “${'a'.repeat(49)}…” → “${'b'.repeat(49)}…”`)
    expect((await db.tasks.get(id))!.title).toBe('b'.repeat(60))
  })

  it('the same title records nothing; a repeating task is renamed as before, without a step', async () => {
    const id = await createTask({ title: 'Milk' })
    await rename(id, 'Milk')
    const rep = await createTask({ title: 'Take the bins out', due: { date: '2030-01-07' }, recurrence: 'every week' })
    await rename(rep, 'Take the bins and recycling out')
    expect((await db.tasks.get(rep))!.title).toBe('Take the bins and recycling out')
    expect(await db.assistantUndo.count()).toBe(0)
  })
})
