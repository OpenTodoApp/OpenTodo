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
    expect(deviceLabel({ device: 'abcdef', userId: 'u' }, 'mine')).toBe('another device (abcd)')
    expect(deviceLabel({ device: 'abcdef', userId: 'bob' }, 'mine', 'me', [
      { projectId: 'p', role: 'owner', ownerId: 'me', members: [{ userId: 'bob', name: 'Bob', email: 'b@x', role: 'editor' }] },
    ])).toBe('Bob · another device (abcd)')
    historyCalls.mockResolvedValue({ entity: 'task', id: 't', changeSets: [], more: false })
    await fetchHistory('task', 't', 99)
    expect(historyCalls).toHaveBeenCalledWith('task', 't', 99)
    expect(formatValue('due', { date: '2026-10-11', time: '09:00' })).toBe('2026-10-11 09:00')
    expect(formatValue('title', null)).toBe('—')
  })
})
