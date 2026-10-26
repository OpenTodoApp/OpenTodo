// The sync client against the real Go server (OpenSpec self-hosting "The sync
// client is tested against the server"): no mocked api, no fake server. Each test
// signs devices in to accounts on the server started by src/test/contractServer.ts
// and drives src/lib/sync.ts, ops.ts and db.ts as the app does.
// Run with `npm run test:contract` (needs ../bin/opentodo).
import { describe, expect, it } from 'vitest'
import { account, call, device, setOffline, switchTo } from '../test/contract'
import { db } from './db'
import { hlcLast, hlcSeed, MAX_FUTURE_SKEW_MS } from './hlc'
import { mutate } from './ops'
import { dismissRejected, syncNow, syncSnapshot } from './sync'

const id = () => crypto.randomUUID()

interface Exported {
  tasks: { id: string; title: string; completed_at: number | null; priority: number }[]
}

function newProject(name: string) {
  return { name, color: '#3b82f6', position: 1, archived: false, parent_id: null, created_at: Date.now(), deleted_at: null }
}

function newTask(title: string, projectId: string | null) {
  return { title, description: '', project_id: projectId, parent_id: null, priority: 4, due: null, labels: [], position: 1, created_at: Date.now(), completed_at: null, deleted_at: null }
}

describe('sync client against the server', () => {
  it('two devices of one account converge on creates, edits and completion', async () => {
    const acct = await account()
    const a = await device(acct, 'a')
    const b = await device(acct, 'b')
    const project = id()
    const task = id()

    switchTo(a)
    await mutate('project', project, newProject('Contract'))
    await mutate('task', task, { ...newTask('Write the contract test', project), priority: 2, due: { date: '2026-11-02', time: '09:30' } })
    await syncNow()
    expect(syncSnapshot().pending).toBe(0)

    switchTo(b)
    await syncNow()
    const there = await db.tasks.get(task)
    expect(there).toMatchObject({ title: 'Write the contract test', project_id: project, priority: 2, due: { date: '2026-11-02', time: '09:30' } })
    await mutate('task', task, { title: 'Write the contract tests', completed_at: 1_800_000_000_000 })
    await syncNow()

    switchTo(a)
    await syncNow()
    expect(await db.tasks.get(task)).toMatchObject({ title: 'Write the contract tests', completed_at: 1_800_000_000_000 })
    const server = await call<Exported>(a.session, 'GET', '/api/v1/export')
    expect(server.tasks.find((t) => t.id === task)).toMatchObject({ title: 'Write the contract tests', completed_at: 1_800_000_000_000 })
  })

  it('edits made offline on two devices converge on the later one everywhere', async () => {
    const acct = await account()
    const a = await device(acct, 'a')
    const b = await device(acct, 'b')
    const task = id()
    switchTo(a)
    await mutate('task', task, newTask('Original', null))
    await syncNow()
    switchTo(b)
    await syncNow()

    setOffline(true)
    try {
      switchTo(a)
      await mutate('task', task, { title: 'From A' })
      await syncNow()
      expect(syncSnapshot().pending).toBeGreaterThan(0)
      switchTo(b)
      await mutate('task', task, { title: 'From B, later' })
      await syncNow()
    } finally {
      setOffline(false)
    }

    // A's earlier edit reaches the server after B's later one: B's still wins.
    switchTo(b)
    await syncNow()
    switchTo(a)
    await syncNow()
    switchTo(b)
    await syncNow()
    for (const d of [a, b]) {
      switchTo(d)
      expect((await db.tasks.get(task))?.title, d.name).toBe('From B, later')
    }
    const server = await call<Exported>(a.session, 'GET', '/api/v1/export')
    expect(server.tasks.find((t) => t.id === task)?.title).toBe('From B, later')
  })

  it('a device clock far ahead is refused as clock_skew, corrected, and the change still lands', async () => {
    const acct = await account()
    const a = await device(acct, 'a')
    const task = id()
    // Stamps an hour ahead: beyond the server's limit for future timestamps.
    hlcSeed(Date.now() + 60 * 60 * 1000)
    await mutate('task', task, newTask('Stamped by a fast clock', null))
    expect(hlcLast()).toBeGreaterThan(Date.now() + MAX_FUTURE_SKEW_MS)
    await syncNow()
    expect(syncSnapshot()).toMatchObject({ pending: 0, error: null })
    expect(hlcLast()).toBeLessThan(Date.now() + MAX_FUTURE_SKEW_MS)
    const server = await call<Exported>(a.session, 'GET', '/api/v1/export')
    expect(server.tasks.find((t) => t.id === task)?.title).toBe('Stamped by a fast clock')
  })

  it("a viewer's edit is refused by the server, reported, and undone on the device", async () => {
    const owner = await account('Owner')
    const viewer = await account('Viewer')
    const o = await device(owner, 'owner')
    const project = id()
    const task = id()
    await mutate('project', project, newProject('Shared'))
    await mutate('task', task, newTask('Owner wrote this', project))
    await syncNow()
    await call(o.session, 'POST', `/api/v1/projects/${project}/members`, { email: viewer.email, role: 'viewer' })

    await device(viewer, 'viewer')
    await syncNow()
    expect((await db.tasks.get(task))?.title).toBe('Owner wrote this')
    await mutate('task', task, { title: 'Viewer tried this' })
    await syncNow()
    expect(syncSnapshot().rejected).toMatchObject({ count: 1 })
    expect((await db.tasks.get(task))?.title).toBe('Owner wrote this')
    dismissRejected()

    const server = await call<Exported>(o.session, 'GET', '/api/v1/export')
    expect(server.tasks.find((t) => t.id === task)?.title).toBe('Owner wrote this')
  })

  it('a device that was offline sends its queue and pulls what it missed when it reconnects', async () => {
    const acct = await account()
    const a = await device(acct, 'a')
    const b = await device(acct, 'b')
    const mine = id()
    const theirs = id()
    switchTo(b)
    setOffline(true)
    try {
      await mutate('task', mine, newTask('Queued offline', null))
      await syncNow()
      // A failed request reads as offline; the change stays queued.
      expect(syncSnapshot().state).toBe('offline')
      expect(syncSnapshot().pending).toBeGreaterThan(0)
    } finally {
      setOffline(false)
    }
    switchTo(a)
    await mutate('task', theirs, newTask('Written while B was away', null))
    await syncNow()
    switchTo(b)
    await syncNow()
    expect(syncSnapshot().pending).toBe(0)
    expect((await db.tasks.get(theirs))?.title).toBe('Written while B was away')
    const server = await call<Exported>(a.session, 'GET', '/api/v1/export')
    expect(server.tasks.map((t) => t.title)).toEqual(expect.arrayContaining(['Queued offline', 'Written while B was away']))
  })
})
