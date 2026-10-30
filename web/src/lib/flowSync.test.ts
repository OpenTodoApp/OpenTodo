// Two devices converge on the same available step (OpenSpec change
// project-flow-modes, task 9.1, spec "Concurrent reorder and completion"): device A
// makes a project sequential and moves a step while device B, offline, completes
// the first step; each applies the other's ops in its own order.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { availability } from './flow'
import { applyOps } from './ops'
import type { Op } from './types'

let n = 0
const op = (device: string, ts: number, entity: Op['entity'], entityId: string, field: string, value: unknown): Op =>
  ({ id: `${device}-${n++}`, entity, entityId, field, value, ts, device })

const seed: Op[] = [
  op('S', 1, 'project', 'move', 'name', 'Move house'),
  ...[['van', 1], ['pack', 2], ['keys', 3]].flatMap(([id, pos]) => [
    op('S', 1, 'task', id as string, 'title', id), op('S', 1, 'task', id as string, 'project_id', 'move'), op('S', 1, 'task', id as string, 'position', pos),
  ]),
]
// Device A: sequential, and "keys" before "pack".
const fromA = [op('A', 10, 'project', 'move', 'flow_mode', 'sequential'), op('A', 11, 'task', 'keys', 'position', 1.5)]
// Device B, offline: completes "van".
const fromB = [op('B', 12, 'task', 'van', 'completed_at', 1_790_000_000_000)]

async function stateOn(name: string, batches: Op[][]) {
  useDatabase(`flow-sync-${name}-${Date.now()}`)
  for (const b of batches) await applyOps(b)
  const s = availability({ tasks: await db.tasks.toArray(), projects: await db.projects.toArray(), sections: await db.sections.toArray(), today: '2026-10-30' })
  return { available: ['van', 'pack', 'keys'].filter((id) => s.available(id)), waits: ['van', 'pack', 'keys'].filter((id) => s.waits(id)) }
}

describe('two devices converge on the same available step', () => {
  it('whatever order the ops arrive in', async () => {
    const a = await stateOn('a', [seed, fromA, fromB])
    const b = await stateOn('b', [seed, fromB, fromA])
    const c = await stateOn('c', [[...fromB, ...seed, ...fromA].reverse()])
    expect(a).toEqual({ available: ['keys'], waits: ['pack'] })
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })
})
