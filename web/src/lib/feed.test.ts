import { liveQuery } from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_RETENTION, mergeOlder } from './activity'
import { db, useDatabase } from './db'
import {
  countUnread, dayOf, ensureFeedBaselines, FEED_BASELINE_KEY, feedEvents, feedKindOf, filterFeed, flushSeen, formatUnread, groupByDay,
  markEventsSeen, seenTimes, unreadCounts,
} from './feed'
import { applyOps, resetDeviceId } from './ops'
import { setCurrentUserId } from './sharing'
import type { ActivityEvent, Membership, Op } from './types'

let n = 0
let seq = 0
beforeEach(async () => {
  useDatabase(`feed-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('alice')
})

const member = (projectId: string): Membership => ({ projectId, role: 'editor', ownerId: 'alice', members: [] })

/** A task created in a project by an actor at ts (one event). */
function created(project: string, actor: string, ts: number, title = 't'): Op[] {
  const id = `task-${seq++}`
  return [
    { id: `${id}-a`, entity: 'task', entityId: id, field: 'project_id', value: project, ts, device: actor, actor },
    { id: `${id}-b`, entity: 'task', entityId: id, field: 'title', value: title, ts, device: actor, actor },
    { id: `${id}-c`, entity: 'task', entityId: id, field: 'created_at', value: ts, ts, device: actor, actor },
  ]
}

/** A comment on a task (separate entity, one event). */
function commented(task: string, actor: string, ts: number): Op[] {
  const id = `c-${seq++}`
  return [
    { id: `${id}-a`, entity: 'comment', entityId: id, field: 'task_id', value: task, ts, device: actor, actor },
    { id: `${id}-b`, entity: 'comment', entityId: id, field: 'body', value: 'hi', ts, device: actor, actor },
    { id: `${id}-c`, entity: 'comment', entityId: id, field: 'created_at', value: ts, ts, device: actor, actor },
  ]
}

async function setup() {
  await db.memberships.bulkPut([member('p1'), member('p2')])
  await ensureFeedBaselines(1000)
}

describe('unread', () => {
  it('counts others only', async () => {
    await setup()
    await applyOps([...created('p1', 'bob', 2000), ...created('p1', 'alice', 3000), ...created('p2', 'carol', 4000), ...created('p2', 'bob', 5000)])
    // A personal project is never part of the feed.
    await applyOps(created('mine', 'alice', 6000))
    const u = await unreadCounts()
    expect(u.byProject.get('p1')).toBe(1)
    expect(u.byProject.get('p2')).toBe(2)
    expect(u.byProject.has('mine')).toBe(false)
    expect(u.total).toBe(3)
    // Opening the feed marks each project seen up to its newest event.
    markEventsSeen(await feedEvents())
    await flushSeen()
    expect((await unreadCounts()).total).toBe(0)
    expect((await seenTimes()).get('p2')).toBe(5000)
    // Alice's own later change is not unread; Bob's is.
    await applyOps([...created('p1', 'alice', 7000), ...created('p1', 'bob', 8000)])
    expect((await unreadCounts()).byProject.get('p1')).toBe(1)
  })

  it('live query follows syncs and marks', async () => {
    await setup()
    await applyOps([...created('p1', 'bob', 2000), ...created('p2', 'bob', 3000)])
    const totals: number[] = []
    const sub = liveQuery(() => unreadCounts()).subscribe((v) => totals.push(v.total))
    const settle = () => new Promise((r) => setTimeout(r, 150))
    await settle()
    // A sync delivering another member's change in the second project.
    await applyOps(created('p2', 'carol', 4000))
    await settle()
    // Opening the feed.
    markEventsSeen(await feedEvents())
    await flushSeen()
    await settle()
    sub.unsubscribe()
    expect(totals).toEqual([2, 3, 0])
  })

  it('capped at retention bound', async () => {
    await setup()
    const ops: Op[] = []
    for (let i = 0; i < LOCAL_RETENTION + 30; i++) {
      ops.push({ id: `o${i}`, entity: 'project', entityId: 'p1', field: 'name', value: `n${i}`, ts: 10_000 + i * 10_000, device: 'B', actor: 'bob' })
    }
    for (let i = 0; i < ops.length; i += 100) await applyOps(ops.slice(i, i + 100))
    const u = await unreadCounts()
    expect(u.byProject.get('p1')).toBe(LOCAL_RETENTION)
    expect(formatUnread(u.byProject.get('p1')!)).toBe(`${LOCAL_RETENTION}+`)
    expect(formatUnread(3)).toBe('3')
  })

  it('initial seen time on first sync', async () => {
    await db.memberships.bulkPut([member('p1')])
    await applyOps(created('p1', 'bob', 2000))
    // Before the first completed sync nothing is unread.
    expect((await unreadCounts()).total).toBe(0)
    // The first sync after the upgrade sets the baseline: history up to then is seen.
    await ensureFeedBaselines(3000)
    expect((await unreadCounts()).total).toBe(0)
    await applyOps(created('p1', 'bob', 4000))
    expect((await unreadCounts()).total).toBe(1)
    // Later syncs keep the baseline; a project joined later gets its own.
    await db.memberships.put(member('p2'))
    await ensureFeedBaselines(9000)
    const base = (await db.meta.get(FEED_BASELINE_KEY))?.value as Record<string, number>
    expect(base).toEqual({ p1: 3000, p2: 9000 })
    // A synced mark from another device takes precedence over the baseline.
    await applyOps([{ id: 'm', entity: 'project_prefs', entityId: 'p1', field: 'feed_seen_at', value: 1500, ts: 1, device: 'phone' }])
    expect((await unreadCounts()).total).toBe(2)
  })
})

describe('feed', () => {
  it('day grouping', () => {
    const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime()
    const ev = (id: string, ts: number): ActivityEvent => ({ id, kind: 'created', actor: 'bob', entity: 'task', entityId: id, ts, opIds: [id], changes: [] })
    const groups = groupByDay([ev('c', at(2026, 10, 10, 18)), ev('b', at(2026, 10, 10, 8)), ev('a', at(2026, 10, 9, 23))])
    expect(groups.map((g) => [g.day, g.events.map((e) => e.id)])).toEqual([['2026-10-10', ['c', 'b']], ['2026-10-09', ['a']]])
    expect(dayOf(at(2026, 1, 2, 0))).toBe('2026-01-02')
  })

  it('filters do not affect unread', async () => {
    await setup()
    const ops = created('p1', 'bob', 2000)
    await applyOps([...ops, ...commented(ops[0].entityId, 'carol', 9000), ...created('p2', 'carol', 10_000)])
    const events = await feedEvents()
    expect(events.map((e) => e.kind)).toEqual(['created', 'commented', 'created'])
    expect(events.every((e) => e.projectId)).toBe(true)
    expect(filterFeed(events, { kind: 'commented' }).map((e) => e.actor)).toEqual(['carol'])
    expect(filterFeed(events, { project: 'p2' })).toHaveLength(1)
    expect(filterFeed(events, { actor: 'bob' })).toHaveLength(1)
    expect(feedKindOf('reopened')).toBe('completed')
    expect(feedKindOf('moved')).toBe('other')
    // Unread is computed over the whole feed, whatever is filtered.
    const seen = await seenTimes()
    expect(countUnread(events, seen, 'alice').total).toBe(3)
    expect((await unreadCounts()).total).toBe(3)
  })

  it('older page dedupes', async () => {
    await setup()
    await applyOps([...created('p1', 'bob', 2000), ...created('p1', 'bob', 20_000)])
    const local = await feedEvents()
    // The server's page repeats the newest local event (same id) and one folded
    // differently (shares an op), and adds one older event.
    const page: ActivityEvent[] = [
      { ...local[0], projectId: 'p1', projectName: 'Home' },
      { id: 'other-id', kind: 'created', actor: 'bob', entity: 'task', entityId: local[1].entityId, ts: local[1].ts, opIds: [local[1].opIds[0]], changes: [], projectId: 'p1' },
      { id: 'old', kind: 'completed', actor: 'carol', entity: 'task', entityId: 'gone', ts: 500, opIds: ['old'], changes: [], projectId: 'p1' },
    ]
    const merged = mergeOlder(local, page)
    expect(merged.map((e) => e.id)).toEqual([local[0].id, local[1].id, 'old'])
    // Merging the same page again changes nothing.
    expect(mergeOlder(merged, page).map((e) => e.id)).toEqual(merged.map((e) => e.id))
  })

  it('ignores deleted shared projects', async () => {
    await setup()
    await applyOps(created('p1', 'bob', 2000))
    await db.projects.put({ id: 'p1', name: 'Home', color: '#000', position: 0, archived: false, parent_id: null, created_at: 1, deleted_at: 5, _clock: {} })
    expect(await feedEvents()).toHaveLength(0)
  })
})
