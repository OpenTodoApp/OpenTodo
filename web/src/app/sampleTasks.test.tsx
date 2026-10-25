// @vitest-environment happy-dom
// Sample tasks in the lists and the panel (OpenSpec change moments-and-onboarding,
// task 2.3; first-run "Sample tasks"): the muted word on sample rows only, the
// panel's notice, and "Remove sample tasks" from the Inbox header's menu as one
// batch whose Undo restores every task, edits included.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { completeTask, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { createSampleTasks } from '../lib/sampleTasks'
import { click, flush, render } from '../ui/test-utils'
import { hideBulkToast } from './bulk/toastStore'
import { UndoToast } from './bulk/UndoToast'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`samples-${Date.now()}-${n++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  hideBulkToast()
  resetPanel()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const q = (sel: string) => document.querySelector<HTMLElement>(sel)

describe('sample tasks in the Inbox', () => {
  it('the word "Sample" is on sample rows only', async () => {
    await createSampleTasks('2026-10-14')
    await createTask({ title: 'Real task' })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => document.body.textContent!.includes('Real task'))
    await waitFor(() => r.container.querySelectorAll('[data-sample]').length >= 2)
    for (const row of r.container.querySelectorAll('[data-task-id]')) {
      const title = row.textContent ?? ''
      expect(!!row.querySelector('[data-sample]'), title).toBe(!title.includes('Real task'))
    }
    expect(r.container.querySelector('[data-sample]')!.textContent).toBe('Sample')
    await r.unmount()
  })

  it('Remove in one tap: completed and edited samples go to the Trash as one batch; Undo restores all with the edit', async () => {
    const ids = await createSampleTasks('2026-10-14')
    await completeTask(ids[0])
    await updateTask(ids[2], { title: 'My own words' })
    await createTask({ title: 'Real task' })
    const r = await render(<><TaskListView route={{ view: 'inbox' }} /><UndoToast /></>)
    await waitFor(() => !!q('[data-inbox-menu]'))
    await click(q('[data-inbox-menu]')!)
    await waitFor(() => !!q('[role="menu"] [data-remove-samples]'))
    await click(q('[role="menu"] [data-remove-samples]')!)
    await waitFor(() => !!q('[data-bulk-toast]'))
    expect(q('[data-bulk-toast] [role="status"]')!.textContent).toBe('3 sample tasks removed')
    const live = async () => (await db.tasks.toArray()).filter((t) => !t.deleted_at)
    expect((await live()).map((t) => t.title)).toEqual(['Real task'])
    // The menu leaves with the last sample.
    await waitFor(() => !q('[data-inbox-menu]'))
    const undo = [...document.querySelectorAll<HTMLButtonElement>('[data-bulk-toast] button')].find((b) => b.textContent === 'Undo')!
    await act(async () => { undo.click() })
    await waitFor(() => !document.querySelector('[data-bulk-toast] [data-toast-undo]'))
    const back = await live()
    expect(back).toHaveLength(5)
    expect(back.find((t) => t.id === ids[2])!.title).toBe('My own words')
    expect(back.find((t) => t.id === ids[0])!.completed_at).toBeTruthy()
    await r.unmount()
  })

  it('the panel notice offers the same removal', async () => {
    const { TaskDetail } = await import('./task-detail/TaskDetail')
    const [id] = await createSampleTasks('2026-10-14')
    const real = await createTask({ title: 'Real task' })
    const r = await render(<><TaskDetail taskId={id} userId="u" projects={[]} labelMap={new Map()} onClose={() => {}} /><UndoToast /></>)
    await waitFor(() => !!q('[data-sample-notice]'))
    expect(q('[data-sample-notice]')!.textContent).toBe('A sample task · Remove sample tasks')
    await r.unmount()
    const r2 = await render(<TaskDetail taskId={real} userId="u" projects={[]} labelMap={new Map()} onClose={() => {}} />)
    await waitFor(() => document.body.textContent!.includes('Real task') || !!q('[data-facets]'))
    await flush(60)
    expect(q('[data-sample-notice]')).toBeNull()
    await r2.unmount()
  })
})
