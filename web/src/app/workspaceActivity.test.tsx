// @vitest-environment happy-dom
// A workspace's Activity page (OpenSpec change workspace-activity): offline it
// lists the retained events with the filters applied and no error; the kinds are
// several at once; the filters come back when the page opens again.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { db, useDatabase } from '../lib/db'
import { applyOps, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import type { Op, Workspace } from '../lib/types'
import { writeFilter, NO_FILTER } from '../lib/workspaceActivity'
import { click, render, waitFor } from '../ui/test-utils'
import WorkspaceActivity from './WorkspaceActivity'

let n = 0
let seq = 0
beforeEach(async () => {
  useDatabase(`ws-activity-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('alice')
  const ws = (id: string, name: string, isDefault: boolean): Workspace => ({ id, name, icon: '', color: '', default: isDefault, role: 'owner', ownerId: 'alice' })
  await db.workspaces.bulkPut([ws('personal', 'Personal', true), ws('work', 'Work', false)])
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const op = (entity: Op['entity'], entityId: string, field: string, value: unknown, ts: number): Op =>
  ({ id: `o-${seq++}`, entity, entityId, field, value, ts, device: 'd', actor: 'alice' })

async function seed() {
  const now = Date.now()
  await applyOps([
    op('project', 'planning', 'name', 'Planning', now - 40_000), op('project', 'planning', 'workspace_id', 'work', now - 40_000),
    op('project', 'planning', 'created_at', now - 40_000, now - 40_000),
    op('task', 'plan', 'title', 'Draft the plan', now - 30_000), op('task', 'plan', 'project_id', 'planning', now - 30_000),
    op('task', 'plan', 'created_at', now - 30_000, now - 30_000),
    op('task', 'plan', 'completed_at', now - 20_000, now - 20_000),
    op('time_entry', 'e1', 'task_id', 'plan', now - 2000), op('time_entry', 'e1', 'started_at', now - 2000 - 42 * 60_000, now - 2000),
    op('time_entry', 'e1', 'ended_at', now - 2000, now - 2000), op('time_entry', 'e1', 'created_at', now - 2000, now - 2000),
  ])
}

const rows = () => [...document.querySelectorAll('[data-workspace-activity] li')].map((li) => li.getAttribute('data-event'))

describe('workspace activity page', () => {
  it('offline: lists the retained events, with the kinds chosen, and no error', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const feed = vi.spyOn(api, 'workspaceActivity')
    await seed()
    const r = await render(<WorkspaceActivity id="work" />)
    await waitFor(() => rows().length === 4, 'four events')
    expect(rows()).toEqual(['time_tracked', 'completed', 'created', 'created'])
    expect(document.body.textContent).toContain('tracked 42m')
    expect(feed).not.toHaveBeenCalled()
    await click(document.querySelector('[data-kinds-menu]')!)
    await click(document.querySelector('[data-kind-item="completed"]')!)
    await click(document.querySelector('[data-kind-item="time"]')!)
    await waitFor(() => rows().length === 2, 'two kinds')
    expect(rows()).toEqual(['time_tracked', 'completed'])
    expect(document.querySelector('.text-danger')).toBeNull()
    await r.unmount()
    // Opened again on this device: the same kinds.
    const again = await render(<WorkspaceActivity id="work" />)
    await waitFor(() => rows().length === 2, 'remembered')
    await again.unmount()
  })

  it('online: asks the server with the remembered filters and merges without duplicates', async () => {
    writeFilter('work', { ...NO_FILTER, kinds: ['completed'] })
    await seed()
    const local = await db.activity.toArray()
    const completedOp = local.find((e) => e.field === 'completed_at')!
    const feed = vi.spyOn(api, 'workspaceActivity').mockResolvedValue({
      events: [
        { id: completedOp.id, kind: 'completed', actor: 'alice', entity: 'task', entityId: 'plan', taskId: 'plan', ts: completedOp.ts, opIds: [completedOp.id], changes: [], projectId: 'planning' },
        { id: 'old', kind: 'completed', actor: 'bob', actorName: 'Bob', entity: 'task', entityId: 'gone', taskId: 'gone', taskTitle: 'Old one', ts: 1000, opIds: ['old'], changes: [], projectId: 'planning' },
      ],
      more: false,
    })
    const r = await render(<WorkspaceActivity id="work" />)
    await waitFor(() => rows().length === 2, 'local and server, once each')
    expect(feed).toHaveBeenCalledWith('work', expect.objectContaining({ kind: 'completed' }))
    expect(document.body.textContent).toContain('Old one')
    await r.unmount()
  })
})
