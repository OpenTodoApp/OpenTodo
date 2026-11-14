// @vitest-environment happy-dom
// Note pages on the publisher's devices (OpenSpec note-public-links): the links an
// encrypted page leaves as text, its snapshot and the re-upload after an edit.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from './db'
import { createNote } from './noteOps'
import { mutate, resetDeviceId } from './ops'
import { buildNoteSnapshot, maintainNotePages, stripRefs } from './notePages'
import { decryptSnapshot, generateShareKey, wrapShareKey } from './taskPageCrypto'
import type { NotePageContent, OwnTaskPage } from './types'

let run = 0
beforeEach(() => {
  useDatabase(`note-pages-${run++}`)
  resetDeviceId()
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('stripRefs', () => {
  it('keeps the text of links to notes, tasks and projects, outside code', () => {
    expect(stripRefs('See [Door code](?note=n1) and [Buy paint](?task=t_2).')).toBe('See Door code and Buy paint.')
    expect(stripRefs('[**Bold**](?project=p1)')).toBe('**Bold**')
    expect(stripRefs('Keep `[code](?note=n1)` and [web](https://x.example)')).toBe('Keep `[code](?note=n1)` and [web](https://x.example)')
    expect(stripRefs('```\n[in](?note=n1)\n```\n[out](?note=n2)')).toBe('```\n[in](?note=n1)\n```\nout')
    expect(stripRefs('\\[escaped](?note=n1)')).toBe('\\[escaped](?note=n1)')
  })
})

describe('encrypted note pages', () => {
  it('the snapshot has the title, text without ids and the omitted files; an edit uploads a newer one', async () => {
    const id = await createNote({ title: 'Trip', description: 'Call [Anna](?note=n9)' })
    await mutate('attachment', 'a1', { note_id: id, task_id: '', comment_id: null, name: 'photo.png', mime: 'image/png', size: 3, sha256: '', url: null, encrypted: true, author_id: 'u', created_at: 1, uploaded_at: 2, deleted_at: null })
    const snap = (await buildNoteSnapshot(id))!
    expect(snap).toMatchObject({ title: 'Trip', text: 'Call Anna', omitted: true, files: [] })
    expect(JSON.stringify(snap)).not.toContain('n9')

    const account = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    const share = await generateShareKey()
    const page = { id: 'p1', kind: 'note', noteId: id, taskId: '', encrypted: true, wrappedKey: await wrapShareKey(account, id, share) } as OwnTaskPage
    const uploads: { ciphertext: string; version: number }[] = []
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://test.invalid').pathname
      if (init?.method === 'PUT' && path === `/api/v1/notes/${id}/page/snapshot`) uploads.push(JSON.parse(String(init.body)))
      return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch)
    await maintainNotePages([page], account)
    await maintainNotePages([page], account)
    expect(uploads.length).toBe(1) // unchanged: not uploaded again
    await db.notes.update(id, { description: 'Call Anna at 9' })
    await maintainNotePages([page], account)
    expect(uploads.length).toBe(2)
    const opened = await decryptSnapshot<NotePageContent>(share, uploads[1].ciphertext)
    expect(opened.text).toBe('Call Anna at 9')
    expect(uploads[1].version).toBeGreaterThanOrEqual(uploads[0].version)
  })
})
