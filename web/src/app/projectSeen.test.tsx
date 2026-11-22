// @vitest-environment happy-dom
// A shared project on screen is seen (OpenSpec change quiet-unread, D2).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { ensureFeedBaselines, flushSeen, seenTimes, unreadCounts, useMarkProjectSeen } from '../lib/feed'
import { applyOps, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import type { Membership, Op } from '../lib/types'
import { render, waitFor } from '../ui/test-utils'

let n = 0
let seq = 0
beforeEach(async () => {
  useDatabase(`project-seen-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('alice')
})

const member = (projectId: string): Membership => ({ projectId, role: 'editor', ownerId: 'alice', members: [] })

function created(project: string, actor: string, ts: number): Op[] {
  const id = `task-${seq++}`
  return [
    { id: `${id}-a`, entity: 'task', entityId: id, field: 'project_id', value: project, ts, device: actor, actor },
    { id: `${id}-b`, entity: 'task', entityId: id, field: 'title', value: 't', ts, device: actor, actor },
    { id: `${id}-c`, entity: 'task', entityId: id, field: 'created_at', value: ts, ts, device: actor, actor },
  ]
}

async function setup() {
  await db.memberships.bulkPut([member('p1'), member('p2')])
  await ensureFeedBaselines(1000)
}

describe('useMarkProjectSeen', () => {
  it('a project on screen is seen, also as changes arrive (quiet-unread D2)', async () => {
    await setup()
    await applyOps([...created('p1', 'bob', 2000), ...created('p2', 'bob', 3000)])
    const Open = ({ id }: { id: string | null }) => { useMarkProjectSeen(id); return null }
    const r = await render(<Open id="p1" />)
    await waitFor(async () => (await seenTimes()).get('p1') === 2000, 'p1 seen')
    await applyOps(created('p1', 'carol', 4000))
    await waitFor(async () => (await seenTimes()).get('p1') === 4000, 'the new change seen')
    const u = await unreadCounts()
    expect(u.byProject.has('p1')).toBe(false)
    // Only the open project: p2 keeps its unread change.
    expect(u.byProject.get('p2')).toBe(1)
    await r.unmount()
    // A personal project is never marked; one on screen beside it shows the queries have run.
    const r2 = await render(<><Open id="mine" /><Open id="p2" /></>)
    await waitFor(async () => (await seenTimes()).get('p2') === 3000, 'p2 seen')
    await flushSeen()
    expect((await db.prefs.get('mine'))?.feed_seen_at ?? 0).toBe(0)
    await r2.unmount()
  })
})
