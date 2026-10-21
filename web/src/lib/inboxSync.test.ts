// project-organization "Inbox is the default container", scenario "Concurrent edits
// converge" (inbox-means-unplaced task 2.4): membership is derived from synced
// fields, so two offline devices end with the same answer whatever the order.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { isInboxTask } from './inbox'
import { tasksForView } from './listGroups'
import { applyOps, resetDeviceId } from './ops'
import type { Op } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`inbox-sync-${Date.now()}-${n++}`)
  resetDeviceId()
})

const created: Op[] = [
  { id: 'c1', entity: 'task', entityId: 't1', field: 'title', value: 'Plan the move', ts: 1, device: 'A' },
  { id: 'c2', entity: 'task', entityId: 't1', field: 'project_id', value: null, ts: 1, device: 'A' },
  { id: 'c3', entity: 'task', entityId: 't1', field: 'position', value: 1, ts: 1, device: 'A' },
]
// Device A (offline) gives it a start date; device B (offline) moves it to a project.
const startOnA: Op = { id: 'a1', entity: 'task', entityId: 't1', field: 'start', value: '2026-10-21', ts: 5, device: 'A' }
const moveOnB: Op = { id: 'b1', entity: 'task', entityId: 't1', field: 'project_id', value: 'p1', ts: 6, device: 'B' }

describe('Inbox membership converges', () => {
  for (const [name, order] of [['A first', [startOnA, moveOnB]], ['B first', [moveOnB, startOnA]]] as const) {
    it(`start date on one device, project on the other (${name}): in the project, not in the Inbox`, async () => {
      await applyOps(created)
      expect(isInboxTask((await db.tasks.get('t1'))!)).toBe(true)
      for (const op of order) await applyOps([op])
      const task = (await db.tasks.get('t1'))!
      expect([task.project_id, task.start]).toEqual(['p1', '2026-10-21'])
      expect(isInboxTask(task)).toBe(false)
      expect(tasksForView({ view: 'inbox' }, [task], [], '2026-10-14')).toEqual([])
    })
  }
})
