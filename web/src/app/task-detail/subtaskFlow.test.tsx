// @vitest-environment happy-dom
// "One at a time" in a task's subtasks (OpenSpec change subtask-flow, GitHub issue
// 1046): the switch shows with two subtasks or more, writes the task's flow with Undo,
// and a viewer only sees it once it is on.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { render, waitFor } from '../../ui/test-utils'
import { Subtasks } from './Subtasks'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

const toggle = () => document.querySelector<HTMLButtonElement>('[data-subtask-flow] [role="switch"]')
const get = async (id: string) => (await db.tasks.get(id)) as Task

async function parentWith(n: number) {
  const parent = await createTask({ title: 'Paint the doghouse' })
  const items: Task[] = []
  for (let i = 0; i < n; i++) items.push(await get(await createTask({ title: `Step ${i + 1}`, parent_id: parent })))
  return { parent: await get(parent), items }
}

const view = (task: Task, items: Task[], readOnly = false) =>
  render(<Subtasks task={task} items={items} progress={{ done: 0, total: items.length }} readOnly={readOnly} boxed onToggle={() => {}} />)

describe('subtask flow (issue 1046)', () => {
  it('turns on one at a time for two subtasks or more, and off again', async () => {
    const { parent, items } = await parentWith(2)
    const r = await view(parent, items)
    expect(toggle()?.getAttribute('aria-checked')).toBe('false')
    await act(async () => { toggle()!.click() })
    await waitFor(async () => (await get(parent.id)).flow_mode === 'sequential', 'the flow written')
    await r.unmount()
    const again = await view(await get(parent.id), items)
    expect(toggle()?.getAttribute('aria-checked')).toBe('true')
    await act(async () => { toggle()!.click() })
    await waitFor(async () => (await get(parent.id)).flow_mode === '', 'the flow cleared')
    await again.unmount()
  })

  it('is not offered for a single subtask, nor to a viewer while it is off', async () => {
    const one = await parentWith(1)
    const r = await view(one.parent, one.items)
    expect(toggle()).toBeNull()
    await r.unmount()
    const two = await parentWith(2)
    const viewer = await view(two.parent, two.items, true)
    expect(toggle()).toBeNull()
    await viewer.unmount()
    const shown = await view({ ...two.parent, flow_mode: 'sequential' }, two.items, true)
    expect(toggle()?.disabled).toBe(true)
    await shown.unmount()
  })
})
