import { beforeEach, describe, expect, it, vi } from 'vitest'

const uploads: string[] = []
let answer: (id: string) => { status: number; code?: string; message?: string } = () => ({ status: 204 })
vi.mock('./api', () => {
  class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message)
    }
  }
  return {
    api: {
      uploadAttachment: vi.fn(async (id: string) => {
        uploads.push(id)
        return answer(id)
      }),
      me: vi.fn(async () => ({ attachments: { enabled: true, max_file_bytes: 1000, quota_bytes: 0, used_bytes: 0 } })),
      putEncryptionKeys: vi.fn(async (r: unknown) => ({ keys: r })),
    },
    ApiError,
    isNetworkError: (err: unknown) => err instanceof TypeError,
  }
})

import { AttachmentError, cleanName, commitFiles, openAttachment, planFiles, queueFiles, queueLink, removeAttachment, restoreAttachment, resumeFileMigration, runFileMigration, runUploader, stateOf } from './attachments'
import { decryptFile } from './crypto'
import { currentKey, enableEncryption, encryptionSnapshot, forgetMemoryKeys, onEncryptionChange } from './e2ee'
import { db, setMeta, useDatabase } from './db'
import { applyOps, createTask, resetDeviceId } from './ops'
import { removeLocally } from './trash'
import type { Op } from './types'

let n = 0
beforeEach(async () => {
  useDatabase(`attachments-${Date.now()}-${n++}`)
  resetDeviceId()
  uploads.length = 0
  answer = () => ({ status: 204 })
  await setMeta('userId', 'u1')
  await setMeta('attachmentLimits', { enabled: true, max_file_bytes: 1000, quota_bytes: 0, used_bytes: 0 })
})

const file = (name: string, body = 'hello', type = 'text/plain') => new File([body], name, { type })

/** What the sync loop does before the uploader runs: the outbox went out. */
const syncRound = () => db.outbox.clear()

describe('attachment data layer', () => {
  it('applies remote attachment ops and drops rows and bytes when the task is purged', async () => {
    const op = (field: string, value: unknown): Op => ({ id: `${field}-1`, entity: 'attachment', entityId: 'a1', field, value, ts: 10, device: 'other' })
    await applyOps([op('task_id', 't1'), op('name', 'Q3.pdf'), op('size', 12), op('uploaded_at', 99), op('author_id', 'u2')])
    const row = await db.attachments.get('a1')
    expect(row).toMatchObject({ task_id: 't1', name: 'Q3.pdf', size: 12, uploaded_at: 99, mime: 'application/octet-stream', comment_id: null })
    expect(stateOf(row!, undefined)).toBe('available')
    await db.attachmentBlobs.put({ id: 'a1', blob: new Blob(['x']), name: 'Q3.pdf', size: 1 })
    await removeLocally([{ entity: 'task', entityId: 't1' }], true)
    expect(await db.attachments.get('a1')).toBeUndefined()
    expect(await db.attachmentBlobs.get('a1')).toBeUndefined()
  })

  it('queues files as rows with their digest and keeps the bytes until upload', async () => {
    const task = await createTask({ title: 'Report' })
    const [id] = await queueFiles(task, [file('a/b.txt')])
    const row = await db.attachments.get(id)
    expect(row).toMatchObject({ task_id: task, name: 'a_b.txt', size: 5, mime: 'text/plain', author_id: 'u1', uploaded_at: null })
    expect(row!.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    expect(stateOf(row!, await db.attachmentBlobs.get(id))).toBe('uploading')
  })

  it('uploads three files in creation order after the ops went out, then drops the bytes', async () => {
    const task = await createTask({ title: 'Report' })
    const ids: string[] = []
    for (const name of ['1.txt', '2.txt', '3.txt']) {
      ids.push(...(await queueFiles(task, [file(name)])))
      await new Promise((r) => setTimeout(r, 2))
    }
    await runUploader()
    expect(uploads).toEqual([])
    await syncRound()
    await runUploader()
    expect(uploads).toEqual(ids)
    expect(await db.attachmentBlobs.count()).toBe(0)
  })

  it('never uploads a file removed before upload and drops its bytes once the removal synced', async () => {
    const task = await createTask({ title: 'Report' })
    const [id] = await queueFiles(task, [file('gone.txt')])
    await removeAttachment(id)
    // An undo before the removal synced still has the bytes.
    expect(await db.attachmentBlobs.get(id)).toBeDefined()
    await syncRound()
    await runUploader()
    expect(uploads).toEqual([])
    expect(await db.attachmentBlobs.get(id)).toBeUndefined()
  })

  it('an undo right after removing keeps the file queued', async () => {
    const task = await createTask({ title: 'Report' })
    const [id] = await queueFiles(task, [file('back.txt')])
    await removeAttachment(id)
    await restoreAttachment(id)
    await syncRound()
    await runUploader()
    expect(uploads).toEqual([id])
  })

  it('drops the bytes of a row the server refused', async () => {
    const task = await createTask({ title: 'Report' })
    const [id] = await queueFiles(task, [file('x.txt')])
    // A refused creation: sync drops the unconfirmed row.
    await db.attachments.delete(id)
    await syncRound()
    await runUploader()
    expect(uploads).toEqual([])
    expect(await db.attachmentBlobs.get(id)).toBeUndefined()
  })

  it('keeps a file over the total waiting with the reason', async () => {
    const task = await createTask({ title: 'Report' })
    const [id] = await queueFiles(task, [file('big.txt')])
    answer = () => ({ status: 403, code: 'quota_exceeded', message: 'this upload would go over your 1 MB of attachments' })
    await syncRound()
    await runUploader()
    const blob = await db.attachmentBlobs.get(id)
    expect(blob?.reason).toContain('go over')
    expect(stateOf((await db.attachments.get(id))!, blob)).toBe('waiting')
  })

  it('waits for the next round when the server has no row yet', async () => {
    const task = await createTask({ title: 'Report' })
    const [a, b] = await queueFiles(task, [file('1.txt'), file('2.txt')])
    answer = () => ({ status: 404 })
    await syncRound()
    await runUploader()
    expect(uploads).toEqual([a])
    answer = () => ({ status: 204 })
    await runUploader()
    expect(uploads).toEqual([a, a, b])
  })

  it('refuses files over the limit before writing anything', async () => {
    const task = await createTask({ title: 'Report' })
    await expect(planFiles(task, [file('huge.bin', 'x'.repeat(2000))])).rejects.toBeInstanceOf(AttachmentError)
    await setMeta('attachmentLimits', { enabled: false, max_file_bytes: 1000, quota_bytes: 0, used_bytes: 0 })
    await expect(planFiles(task, [file('a.txt')])).rejects.toMatchObject({ code: 'disabled' })
    expect(await db.attachments.count()).toBe(0)
  })

  it('writes a comment and its files in one batch', async () => {
    const task = await createTask({ title: 'Report' })
    await syncRound()
    const planned = await planFiles(task, [file('a.txt')], { commentId: 'c1' })
    await commitFiles(planned, [{ entity: 'comment', entityId: 'c1', patch: { task_id: task, author_id: 'u1', body: 'see attached', created_at: 1 } }])
    const ops = await db.outbox.toArray()
    expect(new Set(ops.map((o) => o.entity))).toEqual(new Set(['comment', 'attachment']))
    expect((await db.attachments.get(planned[0].blob.id))?.comment_id).toBe('c1')
  })

  it('adds http(s) links only', async () => {
    const task = await createTask({ title: 'Report' })
    const id = await queueLink(task, 'https://example.com/spec/')
    expect(await db.attachments.get(id)).toMatchObject({ url: 'https://example.com/spec/', name: 'example.com', size: 0 })
    await expect(queueLink(task, 'javascript:alert(1)')).rejects.toMatchObject({ code: 'invalid' })
  })

  it('cleans names', () => {
    expect(cleanName(' ../etc\\passwd ')).toBe('.._etc_passwd')
    expect(cleanName('')).toBe('file')
    expect(cleanName('x'.repeat(300))).toHaveLength(255)
  })

  it('an encrypted account stores and uploads an envelope, and opening decrypts it', async () => {
    await enableEncryption('correct horse battery staple', { iterations: 1000 })
    try {
      const task = await createTask({ title: 'Private' })
      const [id] = await queueFiles(task, [file('secret.txt', 'the plan')])
      const row = (await db.attachments.get(id))!
      const blob = (await db.attachmentBlobs.get(id))!
      const head = new TextDecoder().decode(new Uint8Array(await blob.blob.slice(0, 5).arrayBuffer()))
      expect(head).toBe('OTAT1')
      expect(row.encrypted).toBe(true)
      expect(row.size).toBe(blob.blob.size)
      // The digest describes the envelope, never the plaintext.
      const plainDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('the plan')))].map((b) => b.toString(16).padStart(2, '0')).join('')
      expect(row.sha256).not.toBe(plainDigest)
      // Opening from the server: fetch the envelope and decrypt it here.
      const envelope = blob.blob
      await db.attachmentBlobs.delete(id)
      await db.attachments.update(id, { uploaded_at: 5 })
      let opened: Blob | null = null
      vi.stubGlobal('fetch', vi.fn(async () => new Response(envelope)))
      vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: (b: Blob) => { opened = b; return 'blob:x' }, revokeObjectURL: () => {} }))
      vi.stubGlobal('document', { createElement: () => ({ click: () => {} }) })
      await openAttachment((await db.attachments.get(id))!)
      expect(await opened!.text()).toBe('the plan')
      expect(opened!.type).toBe('text/plain')
    } finally {
      vi.unstubAllGlobals()
      forgetMemoryKeys()
    }
  })
})

describe('file phase of the encryption migration', () => {
  /** Plaintext files already on the server (no local bytes), served by a mocked content route. */
  async function serverFiles(task: string, names: string[]) {
    const served = new Map<string, Blob>()
    for (const [i, name] of names.entries()) {
      const [id] = await queueFiles(task, [file(name, `body of ${name}`)])
      served.set(id, (await db.attachmentBlobs.get(id))!.blob)
      await db.attachmentBlobs.delete(id)
      await db.attachments.update(id, { uploaded_at: 10 + i })
    }
    return served
  }
  function route(served: Map<string, Blob>, failFor = new Set<string>()) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const id = decodeURIComponent(url.split('/')[4])
      if (failFor.has(id)) throw new TypeError('network error')
      const b = served.get(id)
      return b ? new Response(b) : new Response('', { status: 404 })
    }))
  }

  it('enabling re-uploads each file encrypted as a new attachment and removes the plaintext one', async () => {
    const task = await createTask({ title: 'Inbox task' })
    const served = await serverFiles(task, ['a.txt', 'b.txt'])
    await enableEncryption('correct horse battery staple', { iterations: 1000 })
    route(served)
    const seen: string[] = []
    const off = onEncryptionChange(() => { const m = encryptionSnapshot().migration; if (m?.files) seen.push(`${m.done} of ${m.total}`) })
    try {
      await runFileMigration('encrypt')
      const rows = await db.attachments.toArray()
      const old = rows.filter((r) => served.has(r.id))
      const fresh = rows.filter((r) => !served.has(r.id)).sort((x, y) => (x.name < y.name ? -1 : 1))
      expect(old.every((r) => r.deleted_at)).toBe(true)
      expect(fresh.map((r) => [r.name, r.encrypted, r.deleted_at])).toEqual([['a.txt', true, null], ['b.txt', true, null]])
      const key = (await currentKey())!
      const env = (await db.attachmentBlobs.get(fresh[0].id))!.blob
      expect(await (await decryptFile(key, fresh[0].id, env)).text()).toBe('body of a.txt')
      expect(seen).toContain('2 of 2')
    } finally {
      off()
      vi.unstubAllGlobals()
      forgetMemoryKeys()
    }
  })

  it('stops when the network goes and resumes where it stopped', async () => {
    const task = await createTask({ title: 'Inbox task' })
    const served = await serverFiles(task, ['1.txt', '2.txt'])
    await enableEncryption('correct horse battery staple', { iterations: 1000 })
    const [, second] = [...served.keys()]
    route(served, new Set([second]))
    try {
      await expect(runFileMigration('encrypt')).rejects.toThrow()
      // The first file moved; the second keeps its old form.
      expect((await db.attachments.get(second))!.deleted_at).toBeNull()
      expect((await db.attachments.toArray()).filter((r) => r.encrypted && !r.deleted_at)).toHaveLength(1)
      route(served)
      await resumeFileMigration()
      expect((await db.attachments.get(second))!.deleted_at).not.toBeNull()
      expect((await db.attachments.toArray()).filter((r) => r.encrypted && !r.deleted_at).map((r) => r.name)).toEqual(['1.txt', '2.txt'])
    } finally {
      vi.unstubAllGlobals()
      forgetMemoryKeys()
    }
  })

  it('disabling re-uploads encrypted files decrypted', async () => {
    await enableEncryption('correct horse battery staple', { iterations: 1000 })
    try {
      const task = await createTask({ title: 'Inbox task' })
      const [id] = await queueFiles(task, [file('secret.txt', 'the plan')])
      await db.attachments.update(id, { uploaded_at: 3 })
      await runFileMigration('decrypt')
      const fresh = (await db.attachments.toArray()).find((r) => r.id !== id)!
      expect(fresh.encrypted).toBe(false)
      expect(await (await db.attachmentBlobs.get(fresh.id))!.blob.text()).toBe('the plan')
      expect((await db.attachments.get(id))!.deleted_at).not.toBeNull()
    } finally {
      forgetMemoryKeys()
    }
  })
})

