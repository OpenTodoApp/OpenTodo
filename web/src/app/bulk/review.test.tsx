// @vitest-environment happy-dom
// The move and assign review (OpenSpec change bulk-edit, tasks 5.1 and 5.2).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commonSharedProject, reviewMove } from '../../lib/bulk'
import { db, useDatabase } from '../../lib/db'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { flush, key, render } from '../../ui/test-utils'
import { BulkReview } from './BulkReview'
import { bulkToast, hideBulkToast } from './toastStore'

let n = 0
beforeEach(() => { useDatabase(`bulk-review-${Date.now()}-${n++}`); resetDeviceId() })
afterEach(() => { hideBulkToast(); document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

async function sixIntoShared() {
  const home = await createProject({ name: 'Home' })
  await db.memberships.put({ projectId: home, role: 'owner', ownerId: 'me', members: [{ userId: 'me', name: 'Me', email: 'me@example.com', role: 'owner' }] } as never)
  const ids: string[] = []
  for (let i = 0; i < 6; i++) ids.push(await createTask({ title: `Task ${i}` }))
  return { home, ids, plan: await reviewMove(ids, { projectId: home }) }
}

describe('bulk review', () => {
  it('untick one of six and apply: five move (as copies into the shared project), the toast says 5 of 6', async () => {
    const { home, ids, plan } = await sixIntoShared()
    let closed = false
    const r = await render(<BulkReview title="Move 6 tasks to Home" plan={plan} onClose={() => { closed = true }} />)
    await waitFor(() => document.querySelectorAll('[data-bulk-review] input[type="checkbox"]').length === 6)
    expect(document.body.textContent).toContain('shared')
    const boxes = [...document.querySelectorAll('[data-bulk-review] input[type="checkbox"]')] as HTMLInputElement[]
    await act(async () => { boxes[0].click() })
    await act(async () => { (document.querySelector('[data-assistant-apply]') as HTMLButtonElement).click() })
    await waitFor(() => closed)
    expect(bulkToast()?.label).toBe('5 of 6 changes applied')
    expect((await db.tasks.get(ids[0]))!.deleted_at).toBeNull()
    for (const id of ids.slice(1)) expect((await db.tasks.get(id))!.deleted_at).not.toBeNull()
    expect((await db.tasks.filter((t) => t.project_id === home && !t.deleted_at).count())).toBe(5)
    await r.unmount()
  })

  it('Escape writes nothing', async () => {
    const { plan } = await sixIntoShared()
    let closed = false
    const r = await render(<BulkReview title="Move 6 tasks to Home" plan={plan} onClose={() => { closed = true }} />)
    await waitFor(() => document.querySelectorAll('[data-bulk-review] input[type="checkbox"]').length === 6)
    await db.outbox.clear()
    await key(document.querySelector('[data-testid="bulk-review"]')!, 'Escape')
    await waitFor(() => closed)
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })

  it('Assign is offered only when every task is in one shared project', async () => {
    const home = await createProject({ name: 'Home' })
    const work = await createProject({ name: 'Work' })
    const memberships = new Map([[home, { projectId: home } as never]])
    const a = { project_id: home } as never, b = { project_id: home } as never, c = { project_id: work } as never
    expect(commonSharedProject([a, b], memberships)).toBe(home)
    expect(commonSharedProject([a, c], memberships)).toBeNull()
    expect(commonSharedProject([c], memberships)).toBeNull()
  })
})
