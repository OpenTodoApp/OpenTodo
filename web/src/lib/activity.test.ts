import { beforeEach, describe, expect, it } from 'vitest'
// The contract shared with the server (internal/activity): both suites derive these events.
import fixture from '../../../internal/activity/testdata/activity_fixture.json'
import {
  deriveActivity, describeEvent, isPending, LOCAL_RETENTION, mergeOlder, newestFirst, pendingOpIds, projectActivity, taskActivity, trimProject,
  type ActivityOp,
} from './activity'
import { createComment, deleteComment, editComment } from './comments'
import { db, useDatabase } from './db'
import { applyOps, createTask, resetDeviceId, setTaskCompleted, updateTask } from './ops'
import { setCurrentUserId } from './sharing'
import type { ActivityEvent, Op } from './types'

let n = 0
beforeEach(async () => {
  useDatabase(`activity-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('me')
})

describe('activity rule', () => {
  it('matches shared fixture', () => {
    expect(fixture.cases.length).toBeGreaterThan(5)
    for (const c of fixture.cases) {
      const got = JSON.parse(JSON.stringify(deriveActivity(c.ops as ActivityOp[])))
      expect(got, c.name).toEqual(c.events)
    }
  })

  it('uses a known old value for the first op of a field', () => {
    const [ev] = deriveActivity([{ id: 'x', actor: 'a', entity: 'task', entityId: 't', field: 'due', value: { date: '2026-10-12' }, ts: 1, device: 'd', from: { date: '2026-10-01' } }])
    expect(ev.kind).toBe('rescheduled')
    expect(ev.changes[0].from).toEqual({ date: '2026-10-01' })
  })

  it('words events', () => {
    const name = (id: string) => ({ bob: 'Bob' })[id] ?? 'someone'
    const project = (id: string | null) => (id ? 'Home' : 'Inbox')
    const ev = (kind: ActivityEvent['kind'], changes: ActivityEvent['changes'] = []): ActivityEvent =>
      ({ id: 'e', kind, actor: 'a', entity: 'task', entityId: 't', ts: 1, opIds: ['e'], changes })
    expect(describeEvent(ev('completed'), name, project)).toBe('completed')
    expect(describeEvent(ev('rescheduled', [{ field: 'due', from: null, to: { date: '2026-10-12' } }]), name, project)).toBe('moved the due date to 2026-10-12')
    expect(describeEvent(ev('assigned', [{ field: 'assignee_id', from: null, to: 'bob' }]), name, project)).toBe('assigned to Bob')
    expect(describeEvent(ev('moved', [{ field: 'project_id', from: null, to: 'p' }]), name, project)).toBe('moved to Home')
    expect(describeEvent(ev('commented'), name, project)).toBe('commented')
    expect(describeEvent(ev('edited', [{ field: 'title', from: 'a', to: 'b' }, { field: 'position', from: 1, to: 1 }]), name, project)).toBe('changed the title')
  })
})

describe('local activity log', () => {
  it('pending ops marked', async () => {
    const id = await createTask({ title: 'Milk' })
    await setTaskCompleted(id, true)
    const events = await taskActivity(id)
    // Completing right after creating folds into the creation (same actor, within the window).
    expect(events.map((e) => e.kind)).toEqual(['created'])
    expect(events[0].changes.find((c) => c.field === 'completed_at')?.to).toBeGreaterThan(0)
    expect(events.every((e) => e.actor === 'me')).toBe(true)
    const pending = await pendingOpIds()
    expect(events.every((e) => isPending(e, pending))).toBe(true)
    // Once the outbox is acknowledged nothing is pending any more.
    await db.outbox.clear()
    const after = await pendingOpIds()
    expect(events.some((e) => isPending(e, after))).toBe(false)
  })

  it('records pulled ops with their author and the old value from the local row', async () => {
    const id = await createTask({ title: 'Milk', due: { date: '2026-10-01' } })
    await db.outbox.clear()
    const pulled: Op[] = [
      { id: 'srv-1', entity: 'task', entityId: id, field: 'due', value: { date: '2026-10-12' }, ts: Date.now() + 60_000, device: 'B', actor: 'bob', seq: 9 },
    ]
    await applyOps(pulled)
    const [latest] = await taskActivity(id)
    expect(latest).toMatchObject({ kind: 'rescheduled', actor: 'bob', id: 'srv-1' })
    expect(latest.changes[0]).toEqual({ field: 'due', from: { date: '2026-10-01' }, to: { date: '2026-10-12' } })
    // Comments on the task appear in its activity, in its project.
    await updateTask(id, { title: 'Milk!' })
    const cid = await createComment({ taskId: id, body: 'hi' })
    await editComment(cid, 'hello')
    await deleteComment(cid)
    const kinds = (await taskActivity(id)).map((e) => e.kind)
    expect(kinds).toContain('commented')
    expect((await projectActivity('inbox')).length).toBeGreaterThanOrEqual(3)
  })

  it('retention drops oldest', async () => {
    const ops: Op[] = []
    for (let i = 0; i < LOCAL_RETENTION + 20; i++) {
      ops.push({ id: `o${i}`, entity: 'project', entityId: 'p1', field: 'name', value: `name ${i}`, ts: 1_000_000 + i * 10_000, device: 'B', actor: 'bob' })
    }
    // Apply in chunks like sync pages; the bound holds after every page.
    for (let i = 0; i < ops.length; i += 100) await applyOps(ops.slice(i, i + 100))
    const events = await projectActivity('p1')
    expect(events).toHaveLength(LOCAL_RETENTION)
    expect(events[0].id).toBe(`o${LOCAL_RETENTION + 19}`)
    expect(events.some((e) => e.id === 'o0')).toBe(false)
    expect(await trimProject('p1', 10)).toBe(LOCAL_RETENTION - 10)
    expect(await projectActivity('p1')).toHaveLength(10)
  })

  it('merges older server pages without duplicates', () => {
    const ev = (id: string, ts: number, opIds = [id]): ActivityEvent => ({ id, kind: 'edited', actor: 'a', entity: 'task', entityId: 't', ts, opIds, changes: [] })
    const shown = newestFirst([ev('c', 30), ev('b', 20, ['b', 'b2'])])
    const merged = mergeOlder(shown, [ev('b', 20), ev('x', 19, ['b2']), ev('a', 10)])
    expect(merged.map((e) => e.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('dependencies events (task-dependencies)', () => {
  const ev = (to: string[]) => ({ id: 'e', kind: 'dependencies', actor: 'a', entity: 'task', entityId: 't1', taskId: 't1', ts: 1, opIds: ['e'], changes: [{ field: 'blocked_by', from: null, to }] }) as never
  it('names the tasks when they are known on this device', () => {
    const titles = new Map([['t2', 'Confirm dates']])
    expect(describeEvent(ev(['t2']), () => 'Alice', () => 'Inbox', (id) => titles.get(id))).toBe('now waits for “Confirm dates”')
    expect(describeEvent(ev(['t9']), () => 'Alice', () => 'Inbox', (id) => titles.get(id))).toBe('changed what this task waits for')
    expect(describeEvent(ev([]), () => 'Alice', () => 'Inbox')).toBe('stopped waiting for other tasks')
  })
})
