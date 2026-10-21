// Task pages on the publisher's devices (OpenSpec task-pages, design D3, D4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { method: string; body?: unknown }[] = []
const pending: { id: string; ciphertext: string; createdAt: number }[] = []
let account: CryptoKey

vi.mock('./api', () => ({
  api: {
    publishTaskPage: vi.fn(async (_id: string, input: unknown) => {
      calls.push({ method: 'publish', body: input })
      return { id: 'page-1', taskId: 't1', rights: 'reply', label: null, includeMap: true, encrypted: true, publishedAt: 1, expiresAt: null, link: 'https://todo.example.com/t/abcdefghijklmnopqrstuv' }
    }),
    taskPageReplies: vi.fn(async () => ({ replies: [...pending] })),
    confirmTaskPageReply: vi.fn(async (_t: string, id: string) => {
      calls.push({ method: 'confirm', body: id })
      const i = pending.findIndex((r) => r.id === id)
      if (i >= 0) pending.splice(i, 1)
    }),
  },
}))
vi.mock(import('./e2ee'), async (importOriginal) => ({ ...(await importOriginal()), isEnabled: async () => true, currentKey: async () => account }))
vi.mock('./feed', () => ({ sharedProjectIds: async () => ['shared-project'] }))

import { db } from './db'
import { resetDeviceId } from './ops'
import { decryptReply, decryptSnapshot, encryptReply, generateShareKey, shareKeyFromFragment, unwrapShareKey } from './taskPageCrypto'
import { importReplies, publishTaskPage, replyCommentId, taskPageEncrypted } from './taskPages'
import type { Task, TaskPageContent } from './types'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  calls.length = 0
  pending.length = 0
  account = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
})
afterEach(() => vi.clearAllMocks())

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
