// @vitest-environment happy-dom
// The example plugin (OpenSpec change plugin-section, design D6): the command
// copies today's open tasks as a Markdown checklist in list order; an empty day
// is one line saying so; completed and undated tasks are left out.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logicalToday } from '../lib/dates'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { copyTodayMarkdown, todayMarkdown } from './daily-digest'

const writeText = vi.fn(async (_text: string) => {})

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  writeText.mockClear()
  vi.stubGlobal('navigator', { clipboard: { writeText } })
})

describe('the Daily digest plugin', () => {
  it("copies today's open tasks in list order as a Markdown checklist", async () => {
    const day = logicalToday()
    const second = await createTask({ title: 'Second', due: { date: day } })
    const first = await createTask({ title: 'First', due: { date: day } })
    await db.tasks.update(second, { position: 2 })
    await db.tasks.update(first, { position: 1 })
    await createTask({ title: 'Another day', due: { date: '2020-01-01' } })
    await copyTodayMarkdown()
    expect(writeText).toHaveBeenCalledWith('- [ ] First\n- [ ] Second')
  })

  it('leaves out completed tasks, and an empty day is one line', async () => {
    const day = logicalToday()
    const done = await createTask({ title: 'Done already', due: { date: day } })
    await db.tasks.update(done, { completed_at: Date.now() })
    expect(await todayMarkdown()).toBe('Nothing is due today.')
  })
})
