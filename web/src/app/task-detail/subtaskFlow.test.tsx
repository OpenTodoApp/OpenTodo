// @vitest-environment happy-dom
// "One at a time" in a task's subtasks (OpenSpec change subtask-flow, GitHub issue
// 1046): the switch shows with two subtasks or more, writes the task's flow with Undo,
// and a viewer only sees it once it is on.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId, updateProject, updateTask } from '../../lib/ops'
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

  // GitHub issue 1953: the checklist itself shows which step is offered and which wait.
  // Each row's visible mark ("After <step>"), or null.
  const marks = () => [...document.querySelectorAll('[data-subtask-row]')].map((li) => li.querySelector('[data-waits] .truncate > span > [aria-hidden]')?.textContent ?? null)
  const same = (want: (string | null)[]) => () => JSON.stringify(marks()) === JSON.stringify(want)
  const sub = (parent: string, title: string) => createTask({ title, parent_id: parent })
  const kids = async (parent: string) => (await db.tasks.where('parent_id').equals(parent).toArray()).sort((a, b) => a.position - b.position)
  const checklist = async (id: string) => view(await get(id), await kids(id))

  it('dims the later open subtasks and reads them "After" the first open one', async () => {
    const { parent, items } = await parentWith(3)
    await updateTask(parent.id, { flow_mode: 'sequential' })
    await updateTask(items[0].id, { completed_at: Date.now() })
    const r = await checklist(parent.id)
    await waitFor(same([null, null, 'After Step 2']), 'the third step waits for the second')
    expect(document.querySelector('[data-waiting] ~ [data-waits]')).not.toBeNull()
    await r.unmount()
    await updateTask(parent.id, { flow_mode: '' })
    const off = await checklist(parent.id)
    await waitFor(same([null, null, null]), 'no step waits')
    await off.unmount()
  })

  it('marks the subtasks of a waiting step after the step that holds them', async () => {
    const top = await createTask({ title: 'Paint the doghouse' })
    await updateTask(top, { flow_mode: 'sequential' })
    await sub(top, 'Prepare')
    const buy = await sub(top, 'Buy supplies')
    await sub(buy, 'Paint')
    await sub(buy, 'Roller')
    const r = await checklist(buy)
    await waitFor(same(['After Prepare', 'After Prepare']), 'Paint and Roller wait for Prepare')
    await r.unmount()
  })

  it('marks the first subtask of a later step in a sequential project', async () => {
    const project = await createProject({ name: 'Move house' })
    await updateProject(project, { flow_mode: 'sequential' })
    await createTask({ title: 'Book van', project_id: project })
    const pack = await createTask({ title: 'Pack kitchen', project_id: project })
    await sub(pack, 'Plates')
    await sub(pack, 'Glasses')
    const r = await checklist(pack)
    await waitFor(same(['After Book van', 'After Book van']), 'the step waits for Book van')
    await r.unmount()
  })
})
