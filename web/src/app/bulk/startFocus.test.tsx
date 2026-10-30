// @vitest-environment happy-dom
// Start focus in the task Actions menu (OpenSpec change focus-everywhere, task
// 2.4): one open task the user can edit gets it beside Start tracking, in every
// way the menu opens (the selection bar with one ticked task too); several tasks,
// a completed or trashed task and a viewer's task do not. The palette lists it
// through flatItems, and choosing it opens the Focus screen with a session.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../../lib/db'
import { readFocus } from '../../lib/focus/state'
import { createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import type { Membership, Task } from '../../lib/types'
import { flatItems } from '../menus/ActionMenu'
import { navigate } from '../router'
import { bulkMenuGroups } from './BulkActions'
import { bulkToast, hideBulkToast } from './toastStore'

let n = 0
beforeEach(async () => {
  useDatabase(`bulk-focus-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('u1')
  navigate({ view: 'inbox' }, { replace: true })
})
afterEach(() => { hideBulkToast(); vi.unstubAllGlobals() })

const task = (over: Partial<Task> = {}) => ({ id: 't1', title: 'Write the report', project_id: null, labels: [], completed_at: null, deleted_at: null, ...over }) as unknown as Task
const handlers = { review: () => {}, pickDate: () => {}, schedule: () => {} }
const data = (tasks: Task[], memberships = new Map<string, Membership>()) => ({ tasks, labels: [], projects: [], sections: [], memberships, runningTask: null })
const ids = (tasks: Task[], m?: Map<string, Membership>) => flatItems(bulkMenuGroups(tasks.map((x) => x.id), data(tasks, m), handlers)).map((i) => i.id)

describe('Start focus in the Actions menu', () => {
  it('Start focus from the phone bar: one ticked task lists Complete, Schedule…, Start tracking and Start focus at the top', () => {
    expect(ids([task()]).slice(0, 4)).toEqual(['complete', 'schedule', 'track', 'focus'])
  })

  it('Several tasks: neither Start tracking nor Start focus', () => {
    const list = ids([task(), task({ id: 't2' }), task({ id: 't3' })])
    expect(list).not.toContain('focus')
    expect(list).not.toContain('track')
  })

  it('Viewer and completed tasks: no Start focus', () => {
    expect(ids([task({ completed_at: 1 })])).not.toContain('focus')
    expect(ids([task({ deleted_at: 1 })])).not.toContain('focus')
    const viewer = new Map<string, Membership>([['p1', { projectId: 'p1', role: 'viewer', ownerId: 'u2', members: [] }]])
    expect(ids([task({ project_id: 'p1' })], viewer)).not.toContain('focus')
  })

  it('From the keyboard: choosing Start focus opens the Focus screen on the task with a session running', async () => {
    const id = await createTask({ title: 'Write the report' })
    const items = flatItems(bulkMenuGroups([id], data([task({ id })]), handlers))
    const item = items.find((i) => i.id === 'focus')
    if (!item || item.kind !== 'action') throw new Error('no Start focus')
    item.onSelect()
    await vi.waitFor(async () => expect((await readFocus())?.phase).toBe('work'))
    expect((await readFocus())?.taskId).toBe(id)
    await vi.waitFor(() => expect(location.pathname).toBe(`/focus/${id}`))
  })

  it('Switching from another task: the toast names the task left, and Undo brings it back', async () => {
    const anna = await createTask({ title: 'Email Anna' })
    const report = await createTask({ title: 'Write the report' })
    const start = async (id: string) => {
      const item = flatItems(bulkMenuGroups([id], data([task({ id })]), handlers)).find((i) => i.id === 'focus')
      if (item?.kind === 'action') item.onSelect()
      await vi.waitFor(async () => expect((await readFocus())?.taskId).toBe(id))
    }
    await start(anna)
    await start(report)
    await vi.waitFor(() => expect(bulkToast()?.label).toBe('Left Email Anna'))
    bulkToast()!.action!.run()
    await vi.waitFor(async () => expect((await readFocus())?.taskId).toBe(anna))
    expect((await readFocus())?.phase).toBe('work')
    await vi.waitFor(() => expect(location.pathname).toBe(`/focus/${anna}`))
  })
})
