// @vitest-environment happy-dom
// Shared files on the capture screen (OpenSpec change attachments, tasks 9.3 and
// 10.2): the hand-over store, limits, one batch on Save, cleanup on Save and
// Cancel, an HTML file listed only, and the extension's screenshot message.
import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta, useDatabase } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { getInboxEntry, putInboxEntry, type SharedFile } from '../lib/shareInbox'
import { click, flush, render } from '../ui/test-utils'
import { setPendingShare, ShareCapture } from './ShareCapture'

let n = 0
beforeEach(async () => {
  useDatabase(`share-files-${Date.now()}-${n++}`)
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
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 2000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}

// Node's Blob: it survives the structured clone into fake IndexedDB, like a real browser's.
const shared = (name: string, type: string, body = 'bytes'): SharedFile => ({ name, type, blob: new NodeBlob([body], { type }) as unknown as Blob })

async function open(entry: { title?: string; text?: string; url?: string; files: SharedFile[] }) {
  const id = `inbox-${n}`
  await putInboxEntry({ id, createdAt: Date.now(), title: entry.title ?? '', text: entry.text ?? '', url: entry.url ?? '', files: entry.files })
  setPendingShare({ title: '', text: '', url: null }, { inbox: id })
  const r = await render(<ShareCapture />)
  mounted.push(r)
  await waitFor(() => !!document.querySelector('#share-capture'))
  return id
}

const listedFiles = () => [...document.querySelectorAll('[data-shared-file]')].map((li) => li.getAttribute('data-shared-file'))
async function save() {
  const form = document.querySelector<HTMLFormElement>('#share-capture')!
  await act(async () => { form.requestSubmit() })
}

describe('shared files', () => {
  it('a shared photo becomes a task named after it with an uploading attachment, offline, and leaves the store', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const id = await open({ files: [shared('Beach.jpg', 'image/jpeg')] })
    await waitFor(() => listedFiles().includes('Beach.jpg'))
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Task title"]')!.value).toBe('Beach')
    await save()
    await waitFor(async () => (await db.attachments.count()) === 1)
    const task = (await db.tasks.toArray())[0]
    expect(task.title).toBe('Beach')
    const a = (await db.attachments.toArray())[0]
    expect(a).toMatchObject({ task_id: task.id, name: 'Beach.jpg', mime: 'image/jpeg', uploaded_at: null })
    expect(await db.attachmentBlobs.get(a.id)).toBeDefined()
    await waitFor(async () => !(await getInboxEntry(id)))
  })

  it('shows the shared title and text with the PDF below and attaches it', async () => {
    await open({ title: 'Invoice', text: 'From the accountant', files: [shared('invoice.pdf', 'application/pdf')] })
    await waitFor(() => listedFiles().includes('invoice.pdf'))
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Task title"]')!.value).toBe('Invoice')
    expect(document.querySelector('textarea')!.value).toContain('From the accountant')
    await save()
    await waitFor(async () => (await db.attachments.count()) === 1)
    expect((await db.tasks.toArray())[0].title).toBe('Invoice')
  })

  it('lists an oversized file as refused with the limit and saves the task without it', async () => {
    await open({ title: 'Video', files: [shared('clip.mp4', 'video/mp4', 'x'.repeat(2000))] })
    await waitFor(() => listedFiles().includes('clip.mp4'))
    expect(document.querySelector('[data-shared-file="clip.mp4"]')!.textContent).toContain('at most 1000 bytes')
    await save()
    await waitFor(async () => (await db.tasks.count()) === 1)
    expect(await db.attachments.count()).toBe(0)
  })

  it('cancel removes the shared files from the store and writes nothing', async () => {
    const id = await open({ files: [shared('a.png', 'image/png')] })
    await waitFor(() => listedFiles().includes('a.png'))
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!)
    await waitFor(async () => !(await getInboxEntry(id)))
    expect(await db.tasks.count()).toBe(0)
  })

  it('lists an HTML file by name, type and size only and attaches it as a download', async () => {
    await open({ title: 'Page', files: [shared('page.html', 'text/html', '<script>alert(1)</script>')] })
    await waitFor(() => listedFiles().includes('page.html'))
    const row = document.querySelector('[data-shared-file="page.html"]')!
    expect(row.textContent).toContain('text/html')
    expect(document.querySelector('iframe, object, embed')).toBeNull()
    expect(document.body.innerHTML).not.toContain('<script>alert(1)</script>')
    await save()
    await waitFor(async () => (await db.attachments.count()) === 1)
    expect((await db.attachments.toArray())[0].mime).toBe('text/html')
  })

  it('takes at most ten files', async () => {
    await open({ title: 'Many', files: Array.from({ length: 12 }, (_, i) => shared(`f${i}.txt`, 'text/plain')) })
    await waitFor(() => listedFiles().length === 10)
    expect(document.querySelector('[data-testid="shared-files"]')!.textContent).toContain('2 more files were left out')
  })
})

describe('extension screenshot hand-over', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo='
  it('accepts the message once, from this page only, when opened for it', async () => {
    setPendingShare({ title: 'Docs', text: '', url: 'https://example.com/' }, { mode: 'extension' })
    const r = await render(<ShareCapture />)
    mounted.push(r)
    // Another window's message is ignored.
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'opentodo-files', files: [{ name: 'evil.png', type: 'image/png', data: png }] }, origin: location.origin, source: null }))
    })
    expect(listedFiles()).toEqual([])
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'opentodo-files', files: [{ name: 'screenshot.png', type: 'image/png', data: png }] }, origin: location.origin, source: window }))
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'opentodo-files', files: [{ name: 'second.png', type: 'image/png', data: png }] }, origin: location.origin, source: window }))
    })
    await waitFor(() => listedFiles().includes('screenshot.png'))
    expect(listedFiles()).toEqual(['screenshot.png'])
  })

  it('ignores the message when the popup was not opened for files', async () => {
    setPendingShare({ title: 'Docs', text: '', url: null })
    const r = await render(<ShareCapture />)
    mounted.push(r)
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'opentodo-files', files: [{ name: 'x.png', type: 'image/png', data: png }] }, origin: location.origin, source: window }))
    })
    await flush(50)
    expect(listedFiles()).toEqual([])
  })

  it('explains a screenshot without the permission', async () => {
    setPendingShare({ title: 'Docs', text: '', url: null }, { mode: 'denied' })
    const r = await render(<ShareCapture />)
    mounted.push(r)
    expect(document.body.textContent).toContain('Allow the extension to reach your server')
  })
})
