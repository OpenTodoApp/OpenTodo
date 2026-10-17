import { beforeEach, describe, expect, it, vi } from 'vitest'

const historyCalls = vi.fn()
vi.mock('./api', () => ({
  api: { history: (...args: unknown[]) => historyCalls(...args) },
  ApiError: class extends Error {},
  isNetworkError: () => true,
}))

import { db, useDatabase } from './db'
import { deviceLabel, fetchHistory, formatValue, restoreValue } from './history'
import { createProject, createTask, getDeviceId, resetDeviceId } from './ops'

let n = 0
beforeEach(() => {
  useDatabase(`history-${Date.now()}-${n++}`)
  resetDeviceId()
  historyCalls.mockReset()
})

describe('history', () => {
  it('restore writes a new op with the current clock', async () => {
    const id = await createTask({ title: 'New title' })
    const created = (await db.outbox.toArray())[0].ts
    await db.outbox.clear()
    await restoreValue('task', id, 'title', 'Old title')
    expect((await db.tasks.get(id))?.title).toBe('Old title')
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ entity: 'task', entityId: id, field: 'title', value: 'Old title', device: await getDeviceId() })
    expect(ops[0].ts).toBeGreaterThan(created)
  })

  it('restores project fields and refuses fields that are not restorable', async () => {
    const p = await createProject({ name: 'Now' })
    await restoreValue('project', p, 'name', 'Before')
    expect((await db.projects.get(p))?.name).toBe('Before')
    await expect(restoreValue('task', 'x', 'created_at', 1)).rejects.toThrow()
  })

  it('labels devices and fetches pages', async () => {
    expect(deviceLabel({ device: 'mine', userId: 'u' }, 'mine')).toBe('this device')
    expect(deviceLabel({ device: 'server', userId: 'u' }, 'mine')).toBe('API')
    // The server's device carries a per-process suffix (sync-convergence).
    expect(deviceLabel({ device: 'server:1a2b3c4d', userId: 'u' }, 'mine')).toBe('API')
    // AI assistant writes use the server's label, or a generic one without it.
    expect(deviceLabel({ device: 'agent:t1', userId: 'u', device_label: 'AI assistant (Desk assistant)' }, 'mine')).toBe('AI assistant (Desk assistant)')
    expect(deviceLabel({ device: 'public:l1', userId: 'alice' }, 'mine', 'bob', [{ projectId: 'p', role: 'editor', ownerId: 'alice', members: [{ userId: 'alice', name: 'Alice', email: 'a@x', role: 'owner' }] }])).toBe('a public link')
    expect(deviceLabel({ device: 'public:l1', userId: 'alice', device_label: 'Public link (Grandma)' }, 'mine', 'alice')).toBe('Public link (Grandma)')
    expect(deviceLabel({ device: 'agent:t1', userId: 'u' }, 'mine')).toBe('AI assistant')
    expect(deviceLabel({ device: 'abcdef', userId: 'u' }, 'mine')).toBe('another device (abcd)')
    expect(deviceLabel({ device: 'abcdef', userId: 'bob' }, 'mine', 'me', [
      { projectId: 'p', role: 'owner', ownerId: 'me', members: [{ userId: 'bob', name: 'Bob', email: 'b@x', role: 'editor' }] },
    ])).toBe('Bob · another device (abcd)')
    historyCalls.mockResolvedValue({ entity: 'task', id: 't', changeSets: [], more: false })
    await fetchHistory('task', 't', 99)
    expect(historyCalls).toHaveBeenCalledWith('task', 't', 99)
    historyCalls.mockResolvedValue({ entity: 'task', id: 't', more: false, changeSets: [
      { ts: 2, device: 'd', userId: 'me', changes: [{ opId: 'a', field: 'description', from: 'Same', to: 'Same', lost: false }] },
      { ts: 1, device: 'd', userId: 'me', changes: [{ opId: 'b', field: 'title', from: 'Old', to: 'New', lost: false }, { opId: 'c', field: 'description', from: 'x', to: 'x', lost: false }] },
    ] })
    const page = await fetchHistory('task', 't')
    expect(page.changeSets.map((cs) => cs.changes.map((c) => c.opId))).toEqual([['b']])
    expect(formatValue('due', { date: '2026-10-11', time: '09:00' })).toBe('2026-10-11 09:00')
    expect(formatValue('title', null)).toBe('—')
    expect(formatValue('assignee_id', 'u1', (f, id) => (f === 'assignee_id' && id === 'u1' ? 'Bob Okafor' : undefined))).toBe('Bob Okafor')
    expect(formatValue('project_id', 'gone', () => undefined)).toBe('unknown')
  })
})
