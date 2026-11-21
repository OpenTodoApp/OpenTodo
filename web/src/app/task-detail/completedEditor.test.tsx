// @vitest-environment happy-dom
// Editing when a completed task was completed (GitHub issue 1667, OpenSpec
// change edit-completed-at): a completed plain task shows its completion on
// the panel with an editor that writes the new time; a recurring task shows
// none, and a viewer reads the value without a control.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createTask, setTaskCompleted } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { click, flush, type, visibleText, waitFor } from '../../ui/test-utils'
import { open, setupTaskDetailTests } from './taskDetail.testkit'

setupTaskDetailTests()

const completedAtOf = async (id: string) => ((await db.tasks.get(id)) as Task | undefined)?.completed_at ?? null
const atNoon = (day: number) => new Date(2026, 9, day, 12, 0).getTime()

describe('editing the completion time', () => {
  it('a completed task shows the Completed row and editing the day writes the new time', async () => {
    const id = await createTask({ title: 'Report', completed: true })
    expect(await completedAtOf(id)).toBe(atNoon(14))
    const view = await open(id)
    await waitFor(() => !!view.row('completed'), 'the Completed part')
    expect(visibleText(view.row('completed'))).toContain('Completed 14 Oct, 12:00')
    await click(view.valueButton('completed'))
    await waitFor(() => !!view.editor()?.querySelector('[data-completed-day]'), 'the editor')
    const day = view.editor()!.querySelector<HTMLInputElement>('[data-completed-day]')!
    expect(day.value).toBe('2026-10-14')
    await type(day, '2026-10-11')
    await waitFor(async () => (await completedAtOf(id)) === atNoon(11), 'the new completion')
    await waitFor(() => visibleText(view.row('completed')).includes('Completed 11 Oct, 12:00'), 'the part')
    await flush()
    await view.unmount()
  })

  it('Clear reopens the task', async () => {
    const id = await createTask({ title: 'Report', completed: true })
    const view = await open(id)
    await waitFor(() => !!view.row('completed'), 'the Completed part')
    await click(view.valueButton('completed'))
    await waitFor(() => !!view.editor()?.querySelector('[data-facet-clear]'), 'Clear')
    await click(view.editor()!.querySelector('[data-facet-clear]')!)
    await waitFor(async () => (await completedAtOf(id)) === null, 'reopened')
    await waitFor(() => !view.row('completed'), 'the part gone')
    await view.unmount()
  })

  it('a recurring task shows no Completed row', async () => {
    const id = await createTask({ title: 'Water plants', recurrence: 'every day', due: { date: '2026-10-14' } })
    await setTaskCompleted(id, true)
    const view = await open(id)
    await waitFor(() => !!view.row('repeat'), 'the Repeat part')
    expect(view.row('completed')).toBeNull()
    await view.unmount()
  })

  it('a viewer sees the value without a control', async () => {
    const id = await createTask({ title: 'Shared', completed: true })
    const view = await open(id, { readOnly: true })
    await waitFor(() => !!view.row('completed'), 'the Completed part')
    expect(view.row('completed').tagName).not.toBe('BUTTON')
    expect(visibleText(view.row('completed'))).toContain('Completed 14 Oct, 12:00')
    expect(view.addButton()).toBeNull()
    await view.unmount()
  })
})
