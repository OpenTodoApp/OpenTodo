// @vitest-environment happy-dom
// The label and assignee pickers on the design-system Combobox (OpenSpec change
// ui-primitives): most-probable ordering, and picks stay single offline ops.
import { describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createLabel } from '../lib/labels'
import { createProject, createTask } from '../lib/ops'
import { recordPick } from '../lib/pickRank'
import { flush, key, render } from '../ui/test-utils'
import { AssigneePicker } from './AssigneePicker'
import { LabelPicker } from './LabelPicker'

const options = () => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim())
const field = () => document.querySelector('input[role="combobox"]') as HTMLInputElement

describe('LabelPicker', () => {
  it('lists the label used recently on this device first', async () => {
    useDatabase(`lp-${Date.now()}-1`)
    await createLabel({ name: 'alpha' })
    const errands = await createLabel({ name: 'errands' })
    await createLabel({ name: 'zulu' })
    const task = await createTask({ title: 'Buy milk' })
    await recordPick('label', errands)
    const { unmount } = await render(<LabelPicker taskId={task} onClose={() => {}} />)
    await flush(30)
    expect(options()[0]).toBe('errands')
    expect(options()).toEqual(['errands', 'alpha', 'zulu'])
    await unmount()
  })

  it('picking offline is one op on the task labels, applied locally at once and queued', async () => {
    useDatabase(`lp-${Date.now()}-2`)
    const errands = await createLabel({ name: 'errands' })
    const task = await createTask({ title: 'Buy milk' })
    const before = (await db.outbox.toArray()).filter((o) => o.entityId === task && o.field === 'labels').length
    const { unmount } = await render(<LabelPicker taskId={task} onClose={() => {}} />)
    await flush(30)
    await key(field(), 'Enter')
    await flush(30)
    expect((await db.tasks.get(task))?.labels).toEqual([errands])
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === task && o.field === 'labels')
    expect(ops.length - before).toBe(1)
    expect((await db.pickHistory.get(['label', errands]))?.count).toBe(1)
    await unmount()
  })
})

describe('AssigneePicker', () => {
  it('lists Unassigned and You first, then the member assigned most often on this device', async () => {
    useDatabase(`ap-${Date.now()}-1`)
    const project = await createProject({ name: 'Shared' })
    await db.memberships.put({
      projectId: project, role: 'owner', ownerId: 'me', members: [
        { userId: 'me', name: 'Ada', email: 'ada@example.com', role: 'owner' },
        { userId: 'u-bob', name: 'Bob', email: 'bob@example.com', role: 'editor' },
        { userId: 'u-sam', name: 'Sam', email: 'sam@example.com', role: 'editor' },
      ],
    } as never)
    for (let i = 0; i < 3; i++) await recordPick(`assignee:${project}`, 'u-sam')
    const task = await createTask({ title: 'Paint', project_id: project })
    const { unmount } = await render(<AssigneePicker taskId={task} userId="me" onClose={() => {}} />)
    await flush(30)
    const names = [...document.querySelectorAll('[role="option"] span.block.truncate')].map((s) => s.textContent)
    expect(names.slice(0, 3)).toEqual(['Unassigned', 'You', 'Sam'])
    await unmount()
  })
})
