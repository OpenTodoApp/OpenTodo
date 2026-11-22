// @vitest-environment happy-dom
// share-capture "A shared file above the limit": saving creates the task without it, also
// when Save comes before the screen has read the server's limit (the list shows the file
// as allowed until then). The limit is read again when saving.
import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta, useDatabase } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { putInboxEntry, type SharedFile } from '../lib/shareInbox'
import { render, waitFor } from '../ui/test-utils'
import { setPendingShare, ShareCapture } from './ShareCapture'

// The screen has not read the limit yet: its hook answers nothing, the stored limit is there.
vi.mock('../lib/attachments', async (real) => ({ ...(await real<typeof import('../lib/attachments')>()), useAttachmentLimits: () => null }))

let n = 0
beforeEach(async () => {
  useDatabase(`share-early-${Date.now()}-${n++}`)
  resetDeviceId()
  await setMeta('userId', 'me')
  await setMeta('attachmentLimits', { enabled: true, max_file_bytes: 1000, quota_bytes: 0, used_bytes: 0 })
  vi.stubGlobal('close', () => {})
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  setPendingShare(null)
  vi.unstubAllGlobals()
})

const shared = (name: string, type: string, body: string): SharedFile => ({ name, type, blob: new NodeBlob([body], { type }) as unknown as Blob })

describe('Save before the size limit is read', () => {
  it('saves the task with the files the limit allows, without the one it refuses', async () => {
    const id = `inbox-${n}`
    await putInboxEntry(indexedDB, { id, createdAt: Date.now(), title: 'Trip', text: '', url: '', files: [shared('clip.mp4', 'video/mp4', 'x'.repeat(2000)), shared('ticket.pdf', 'application/pdf', 'small')] })
    setPendingShare({ title: '', text: '', url: null }, { inbox: id })
    const r = await render(<ShareCapture />)
    mounted.push(r)
    await waitFor(() => document.querySelectorAll('[data-shared-file]').length === 2, 'both files listed')
    const form = document.querySelector<HTMLFormElement>('#share-capture')!
    await act(async () => { form.requestSubmit() })
    await waitFor(async () => (await db.tasks.count()) === 1, 'the task saved')
    await waitFor(async () => (await db.attachments.count()) === 1, 'one attachment')
    expect((await db.attachments.toArray()).map((a) => a.name)).toEqual(['ticket.pdf'])
  })
})
