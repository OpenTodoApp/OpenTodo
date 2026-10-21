// Task pages on the publisher's devices (OpenSpec task-pages, design D3, D4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { method: string; body?: unknown }[] = []
const pending: { id: string; ciphertext: string; createdAt: number }[] = []
let account: CryptoKey
// The publisher's pages as GET /api/v1/task-pages lists them (set by a test).
let myPages: unknown[] = []

vi.mock('./api', () => ({
  api: {
    publishTaskPage: vi.fn(async (_id: string, input: unknown) => {
      calls.push({ method: 'publish', body: input })
      return { id: 'page-1', taskId: 't1', rights: 'reply', label: null, includeMap: true, encrypted: true, publishedAt: 1, expiresAt: null, link: 'https://todo.example.com/t/abcdefghijklmnopqrstuv' }
    }),
    taskPageReplies: vi.fn(async () => ({ replies: [...pending] })),
    myTaskPages: vi.fn(async () => ({ pages: myPages })),
    me: vi.fn(async () => ({ user: { name: 'Raffaele' } })),
    putTaskPageSnapshot: vi.fn(async (_t: string, body: unknown) => { calls.push({ method: 'snapshot', body }) }),
    confirmTaskPageReply: vi.fn(async (_t: string, id: string) => {
      calls.push({ method: 'confirm', body: id })
      const i = pending.findIndex((r) => r.id === id)
      if (i >= 0) pending.splice(i, 1)
    }),
  },
}))
vi.mock(import('./e2ee'), async (importOriginal) => ({ ...(await importOriginal()), isEnabled: async () => true, currentKey: async () => account }))
vi.mock('./feed', () => ({ sharedProjectIds: async () => ['shared-project'] }))
vi.mock('./sharing', () => ({ currentUserId: async () => 'me' }))

import { db } from './db'
import { mutate, resetDeviceId } from './ops'
import { decryptReply, decryptSnapshot, encryptReply, generateShareKey, shareKeyFromFragment, unwrapShareKey } from './taskPageCrypto'
import { importReplies, MAINTAIN_INTERVAL_MS, maintainTaskPages, publishTaskPage, replyCommentId, taskPageEncrypted } from './taskPages'
import type { Task, TaskPageContent } from './types'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  calls.length = 0
  pending.length = 0
  myPages = []
  account = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const task = { id: 't1', title: 'Paint the fence', description: 'Two coats', project_id: null, parent_id: null, due: { date: '2026-10-25' }, completed_at: null, deleted_at: null, position: 1 } as unknown as Task

describe('share keys', () => {
  it('a fragment opens the snapshot; a changed or missing one does not', async () => {
    const key = await generateShareKey()
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
    const fragment = '#' + btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const opened = await shareKeyFromFragment(fragment)
    expect(opened).not.toBeNull()
    expect(await shareKeyFromFragment('')).toBeNull()
    expect(await shareKeyFromFragment('#short')).toBeNull()
    const reply = await encryptReply(key, { name: 'Marco', body: 'Done', sentAt: 1 })
    expect(await decryptReply(opened!, reply)).toEqual({ name: 'Marco', body: 'Done', sentAt: 1 })
    const other = await generateShareKey()
    await expect(decryptReply(other, reply)).rejects.toThrow()
  })

  it('only tasks outside every shared project are encrypted pages', async () => {
    expect(await taskPageEncrypted({ project_id: null })).toBe(true)
    expect(await taskPageEncrypted({ project_id: 'personal-project' })).toBe(true)
    expect(await taskPageEncrypted({ project_id: 'shared-project' })).toBe(false)
  })
})

describe('publishing an encrypted task', () => {
  it('sends a snapshot and a wrapped key, never the share key; the link carries it after #', async () => {
    await db.tasks.put({ ...task, _clock: {} } as never)
    const created = await publishTaskPage(task, { rights: 'reply' }, 'Raffaele')
    const [, fragment] = created.link.split('#')
    expect(fragment).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const sent = JSON.stringify(calls)
    expect(sent).not.toContain(fragment)
    const body = calls[0].body as { snapshot: string; wrappedKey: string }
    expect(body.snapshot.startsWith('enc:v1:')).toBe(true)
    // The guest's browser opens the snapshot with the fragment.
    const share = await shareKeyFromFragment(fragment)
    const content = await decryptSnapshot<TaskPageContent>(share!, body.snapshot)
    expect(content).toMatchObject({ id: 't1', title: 'Paint the fence', description: 'Two coats', comments: [] })
    // A second enrolled device (the same account key) unwraps the share key.
    const second = await unwrapShareKey(account, 't1', body.wrappedKey)
    expect((await decryptSnapshot<TaskPageContent>(second, body.snapshot)).title).toBe('Paint the fence')
  })
})

describe('importing encrypted replies', () => {
  it('two devices importing at once write one comment', async () => {
    await db.tasks.put({ ...task, _clock: {} } as never)
    const share = await generateShareKey()
    pending.push({ id: 'r1', ciphertext: await encryptReply(share, { name: 'Marco', body: 'Need more paint', sentAt: 5 }), createdAt: 5 })
    const [a, b] = await Promise.all([importReplies('t1', 'page-1', share, 'me'), importReplies('t1', 'page-1', share, 'me')])
    expect(a + b).toBeGreaterThanOrEqual(1)
    const comments = await db.comments.where('task_id').equals('t1').toArray()
    expect(comments).toHaveLength(1)
    expect(comments[0]).toMatchObject({ id: replyCommentId('r1'), body: 'Need more paint', guest_name: 'Marco', page_id: 'page-1', author_id: 'me' })
    expect(pending).toHaveLength(0)
  })

  it('a reply that does not open stays pending', async () => {
    await db.tasks.put({ ...task, _clock: {} } as never)
    const share = await generateShareKey()
    pending.push({ id: 'r2', ciphertext: await encryptReply(await generateShareKey(), { name: 'X', body: 'Y', sentAt: 1 }), createdAt: 1 })
    expect(await importReplies('t1', 'page-1', share, 'me')).toBe(0)
    expect(pending).toHaveLength(1)
  })
})

describe('keeping an encrypted page current', () => {
  /** Publishes t1 and lists it as the server would; returns the guest's share key. */
  async function published() {
    await db.tasks.put({ ...task, _clock: {} } as never)
    const created = await publishTaskPage(task, { rights: 'reply' }, 'Raffaele')
    const body = calls[0].body as { wrappedKey: string }
    myPages = [{ id: created.id, taskId: 't1', rights: 'reply', label: null, includeMap: true, encrypted: true, wrappedKey: body.wrappedKey, publishedAt: 1, expiresAt: null, pendingReplies: 0 }]
    calls.length = 0
    return (await shareKeyFromFragment('#' + created.link.split('#')[1]))!
  }
  const uploads = () => calls.filter((c) => c.method === 'snapshot').map((c) => c.body as { ciphertext: string })
  // The device remembers what it uploaded in localStorage, which this environment lacks.
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) } })
  })

  it('owner edits the description offline: after reconnecting the page gets the new description within a minute', async () => {
    const share = await published()
    // Nothing changed since publishing: no upload.
    await maintainTaskPages({ force: true })
    expect(uploads()).toHaveLength(0)
    // Offline: the edit is local and no pass reaches the server.
    vi.stubGlobal('navigator', { onLine: false })
    await mutate('task', 't1', { description: 'Three coats, white' })
    await maintainTaskPages({ force: true })
    expect(uploads()).toHaveLength(0)
    // Back online, the sync's pass comes too soon after the last one; it is deferred,
    // not dropped, so the snapshot still goes out within the interval.
    vi.stubGlobal('navigator', { onLine: true })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    await maintainTaskPages()
    expect(uploads()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(MAINTAIN_INTERVAL_MS)
    vi.useRealTimers()
    await vi.waitFor(() => expect(uploads()).toHaveLength(1))
    const content = await decryptSnapshot<TaskPageContent>(share, uploads()[0].ciphertext)
    expect(content.description).toBe('Three coats, white')
    expect(MAINTAIN_INTERVAL_MS).toBeLessThanOrEqual(60_000)
  })

  it('a change that arrives during a pass gets one more pass', async () => {
    const share = await published()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(Date.now() + 10 * MAINTAIN_INTERVAL_MS)
    const first = maintainTaskPages()
    await mutate('task', 't1', { title: 'Paint the gate' })
    await maintainTaskPages()
    await first
    await vi.advanceTimersByTimeAsync(MAINTAIN_INTERVAL_MS)
    vi.useRealTimers()
    const lastTitle = async () => uploads().length ? (await decryptSnapshot<TaskPageContent>(share, uploads()[uploads().length - 1].ciphertext)).title : null
    await vi.waitFor(async () => expect(await lastTitle()).toBe('Paint the gate'))
  })
})
