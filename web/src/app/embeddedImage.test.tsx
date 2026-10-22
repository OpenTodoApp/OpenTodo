// @vitest-environment happy-dom
// Images and task links in Markdown (OpenSpec change editor-everywhere, task 2.4):
// an image shows only an attachment of the same task, from the app's own route
// or this device's bytes; a task link shows the task's live title.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta, useDatabase } from '../lib/db'
import { applyOps, createTask, mutate, resetDeviceId } from '../lib/ops'
import type { Op } from '../lib/types'
import { flush, render } from '../ui/test-utils'
import { Markdown } from './Markdown'

let n = 0
let task = ''
let other = ''
beforeEach(async () => {
  useDatabase(`embedded-image-${Date.now()}-${n++}`)
  resetDeviceId()
  await setMeta('userId', 'me')
  task = await createTask({ title: 'Paint the wall' })
  other = await createTask({ title: 'Other' })
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

async function file(id: string, taskId: string, opts: { uploaded?: boolean; mime?: string } = {}) {
  let ts = 100
  const op = (field: string, value: unknown, device = 'other'): Op => ({ id: `${id}-${field}`, entity: 'attachment', entityId: id, field, value, ts: ts++, device })
  const ops = [op('task_id', taskId), op('author_id', 'ana'), op('name', 'wall.png'), op('mime', opts.mime ?? 'image/png'), op('size', 2048), op('sha256', 'ab'), op('created_at', 5)]
  if (opts.uploaded !== false) ops.push(op('uploaded_at', 9, 'server'))
  await applyOps(ops)
}

async function mount(source: string, taskId: string | null = task) {
  const r = await render(<Markdown source={source} taskId={taskId} />)
  mounted.push(r)
  return r
}

describe('embedded images', () => {
  it('an uploaded attachment of the task loads from the app route only', async () => {
    await file('att-1', task)
    const v = await mount('![The wall](attachment:att-1)')
    await waitFor(() => !!v.container.querySelector('img'))
    const img = v.container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/api/v1/attachments/att-1/content')
    expect(img.getAttribute('alt')).toBe('The wall')
  })

  it("Reference to another task's file: a placeholder, nothing loaded", async () => {
    await file('att-2', other)
    const v = await mount('![x](attachment:att-2)')
    await waitFor(() => v.container.querySelector('[data-state]')?.getAttribute('data-state') === 'removed')
    expect(v.container.querySelector('img')).toBeNull()
    expect(v.container.textContent).toContain('Removed image')
  })

  it('Embedded attachment while uploading: the file name and Uploading, then the image', async () => {
    await file('att-3', task, { uploaded: false })
    await db.attachmentBlobs.put({ id: 'att-3', blob: new Blob(['png'], { type: 'image/png' }) } as never)
    // fake-indexeddb hands back a plain object for a stored Blob.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-shot')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    const v = await mount('![shot](attachment:att-3)')
    // This device holds the bytes: they show at once from a local object URL.
    await waitFor(() => !!v.container.querySelector('img'))
    expect(v.container.querySelector('img')!.getAttribute('src')).toMatch(/^blob:/)
    await db.attachmentBlobs.delete('att-3')
    await waitFor(() => v.container.querySelector('[data-state]')?.getAttribute('data-state') === 'uploading')
    expect(v.container.textContent).toContain('wall.png: uploading')
    await applyOps([{ id: 'up', entity: 'attachment', entityId: 'att-3', field: 'uploaded_at', value: 20, ts: 500, device: 'server' }])
    await waitFor(() => !!v.container.querySelector('img'))
  })

  it('Attachment removed: every embed reads Removed image', async () => {
    await file('att-4', task)
    const v = await mount('![x](attachment:att-4)')
    await waitFor(() => !!v.container.querySelector('img'))
    await mutate('attachment', 'att-4', { deleted_at: 1000 })
    await waitFor(() => v.container.textContent?.includes('Removed image') ?? false)
  })
})

describe('task links', () => {
  it('Subtask retitled: the link shows the current title without a write to the note', async () => {
    const v = await mount(`See [Book hotel](?task=${other})`)
    await waitFor(() => v.container.textContent?.includes('Other') ?? false)
    await mutate('task', other, { title: 'Book the hotel by Friday' })
    await waitFor(() => v.container.textContent?.includes('Book the hotel by Friday') ?? false)
    await mutate('task', other, { completed_at: 5 })
    await waitFor(() => !!v.container.querySelector('.task-ref.line-through'))
  })

  it('an unknown task shows the stored text', async () => {
    const v = await mount('[Book hotel](?task=nope)')
    await flush(50)
    expect(v.container.querySelector('.task-ref')!.textContent).toBe('Book hotel')
  })
})
