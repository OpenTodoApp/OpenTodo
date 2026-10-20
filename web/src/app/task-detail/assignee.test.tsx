// @vitest-environment happy-dom
// The assignee chip (OpenSpec task-detail-redesign 4.1; change ux-overhaul, web-app
// "Task panel layout", task 3.5): hidden in a solo scope, where the Add menu offers
// "Show in Assigned to me"; a picker in shared projects.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask } from '../../lib/ops'
import { click } from '../../ui/test-utils'
import { ME, membership, open, settle, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

describe('assignee in personal scopes', () => {
  it('shows no chip and writes no op; "Show in Assigned to me" assigns; clearing unassigns; a second member brings the picker', async () => {
    const p = await createProject({ name: 'Solo' })
    const id = await createTask({ title: 'Read a book', project_id: p })
    const before = await db.outbox.count()
    const v = await open(id)
    expect(v.row('assignee')).toBeNull()
    expect(await db.outbox.count()).toBe(before)

    await v.add('Show in Assigned to me')
    await waitFor(() => !!v.row('assignee'))
    expect((await db.tasks.get(id))!.assignee_id).toBe(ME)
    expect(v.row('assignee').textContent).toContain('You')
    // Assigned to me lists explicitly assigned tasks.
    expect((await db.tasks.where('assignee_id').equals(ME).toArray()).map((t) => t.id)).toEqual([id])
    await click(v.valueButton('assignee'))
    await settle()
    await click(v.editor()!.querySelector('[data-facet-clear]')!)
    await settle()
    expect((await db.tasks.get(id))!.assignee_id).toBeNull()
    await waitFor(() => !v.row('assignee'))

    await act(async () => { await membership(p, ME, 'u-bob') })
    await waitFor(() => !!v.row('assignee'))
    expect(v.row('assignee').textContent).toContain('Unassigned')
    expect(v.editor()).toBeNull()
    await v.unmount()
  })

  it('in a shared project the chip is present empty and its editor is the member picker', async () => {
    const team = await createProject({ name: 'Team' })
    await membership(team, ME, 'u-bob')
    const id = await createTask({ title: 'Order parts', project_id: team })
    const v = await open(id)
    await waitFor(() => !!v.row('assignee'))
    expect(v.row('assignee').textContent).toContain('Unassigned')
    await click(v.valueButton('assignee'))
    await settle()
    await v.pick('assignee', 'u-bob')
    expect((await db.tasks.get(id))!.assignee_id).toBe('u-bob')
    await waitFor(() => v.row('assignee').textContent!.includes('u-bob'))
    await v.unmount()
  })
})
