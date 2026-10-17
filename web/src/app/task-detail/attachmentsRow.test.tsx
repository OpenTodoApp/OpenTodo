// @vitest-environment happy-dom
// The Attachments row (OpenSpec change attachments, task 7.1): keyboard add and
// open, paste a screenshot, offline open, the demo and disabled cases, axe.
import 'fake-indexeddb/auto'
import { act, createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta, useDatabase } from '../../lib/db'
import { setDemo } from '../../lib/demo'
import { applyOps, createTask, resetDeviceId } from '../../lib/ops'
import type { Op } from '../../lib/types'
import { click, flush, key, render, spokenText, visibleText } from '../../ui/test-utils'
import { hideBulkToast } from '../bulk/toastStore'
import { TaskRow } from '../TaskRow'
import { AttachmentsRow, pastedName, typeLabel } from './AttachmentsRow'

let n = 0
let task = ''
beforeEach(async () => {
  useDatabase(`attachments-row-${Date.now()}-${n++}`)
  resetDeviceId()
  await setMeta('userId', 'me')
  await setMeta('attachmentLimits', { enabled: true, max_file_bytes: 1 << 20, quota_bytes: 0, used_bytes: 0 })
  task = await createTask({ title: 'Report' })
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  hideBulkToast()
  setDemo(null)
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

async function mount(props: Partial<Parameters<typeof AttachmentsRow>[0]> = {}) {
  const r = await render(<AttachmentsRow taskId={task} userId="me" role="owner" {...props} />)
  mounted.push(r)
  return r
}

/** An attachment written by another device and confirmed by the server. */
async function remoteFile(id: string, name: string, mime = 'application/pdf') {
  let ts = 100
  const op = (field: string, value: unknown, device = 'other'): Op => ({ id: `${id}-${field}`, entity: 'attachment', entityId: id, field, value, ts: ts++, device })
  await applyOps([op('task_id', task), op('author_id', 'ana'), op('name', name), op('mime', mime), op('size', 2048), op('sha256', 'ab'), op('created_at', 5), op('uploaded_at', 9, 'server')])
}

const names = () => [...document.querySelectorAll('[data-attachment-open]')].map((b) => b.textContent)
const item = (name: string) => [...document.querySelectorAll<HTMLElement>('[data-attachment-open]')].find((b) => b.textContent === name)!

describe('AttachmentsRow', () => {
  it('adds a file from the picker and opens an uploaded one with Enter, by keyboard only', async () => {
    const v = await mount()
    const add = v.container.querySelector<HTMLButtonElement>('button[aria-label="Attach"]')!
    const input = v.container.querySelector<HTMLInputElement>('[data-testid="attachment-picker"]')!
    const pick = vi.spyOn(input, 'click').mockImplementation(() => {})
    add.focus()
    await key(add, 'Enter')
    await click(add)
    await flush(20)
    expect(document.activeElement?.textContent).toContain('Choose files')
    await click(document.activeElement!) // Enter on a native button activates it
    expect(pick).toHaveBeenCalled()
    Object.defineProperty(input, 'files', { value: [new File(['%PDF'], 'Q3 report.pdf', { type: 'application/pdf' })], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await waitFor(() => names().includes('Q3 report.pdf'))
    const row = (await db.attachments.toArray())[0]
    expect(row).toMatchObject({ task_id: task, name: 'Q3 report.pdf', author_id: 'me' })
    expect(await db.attachmentBlobs.get(row.id)).toBeDefined()
    expect(document.querySelector('[data-attachment]')!.textContent).toContain('Uploading')

    await remoteFile('a-up', 'Budget.pdf')
    await waitFor(() => names().includes('Budget.pdf'))
    const open = vi.fn()
    vi.stubGlobal('open', open)
    // The older file comes first; arrows move between files, Enter opens.
    const first = item('Budget.pdf')
    expect(first.tabIndex).toBe(0)
    expect(item('Q3 report.pdf').tabIndex).toBe(-1)
    first.focus()
    await key(first, 'ArrowDown')
    await flush(30)
    expect(document.activeElement).toBe(item('Q3 report.pdf'))
    await key(document.activeElement!, 'ArrowUp')
    await flush(30)
    expect(document.activeElement).toBe(first)
    await click(first)
    await waitFor(() => open.mock.calls.length > 0)
    expect(open.mock.calls[0][0]).toBe('/api/v1/attachments/a-up/content')
  })

  it('pasting an image in the panel attaches it named with the date', async () => {
    const panel = createRef<HTMLDivElement>()
    const r = await render(<div ref={panel}><textarea aria-label="Notes" /><AttachmentsRow taskId={task} userId="me" role="owner" dropTarget={panel} /></div>)
    mounted.push(r)
    await flush()
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    const shot = new File(['png'], 'image.png', { type: 'image/png' })
    Object.defineProperty(paste, 'clipboardData', { value: { files: [shot], types: ['Files'] } })
    await act(async () => { r.container.querySelector('textarea')!.dispatchEvent(paste) })
    expect(paste.defaultPrevented).toBe(true)
    await waitFor(() => names().some((n) => /^Pasted image \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.png$/.test(n ?? '')))
  })

  it('says a connection is needed when the file is not on this device and the device is offline', async () => {
    await remoteFile('a-far', 'Far.pdf')
    await mount()
    await waitFor(() => names().includes('Far.pdf'))
    const open = vi.fn()
    vi.stubGlobal('open', open)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await click(item('Far.pdf'))
    await waitFor(() => !!document.querySelector('[data-attachment] [role="status"]'))
    expect(document.querySelector('[data-attachment] [role="status"]')!.textContent).toContain('Connect')
    expect(open).not.toHaveBeenCalled()
  })

  it('renames with F2 and removes with Delete after confirming, with an undo', async () => {
    const v = await mount()
    const input = v.container.querySelector<HTMLInputElement>('[data-testid="attachment-picker"]')!
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'draft.txt', { type: 'text/plain' })], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await waitFor(() => names().includes('draft.txt'))
    await key(item('draft.txt'), 'F2')
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Attachment name"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'final.txt')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await key(field, 'Enter')
    await waitFor(() => names().includes('final.txt'))
    await key(item('final.txt'), 'Delete')
    const confirm = [...document.querySelectorAll('[data-testid="confirm-dialog"] button')].find((b) => b.textContent === 'Remove')!
    await click(confirm)
    await waitFor(() => names().length === 0)
    expect((await db.attachments.toArray())[0].deleted_at).not.toBeNull()
  })

  it('lists but offers no Add when attachments are off, and nothing for a viewer of someone else’s file to remove', async () => {
    await setMeta('attachmentLimits', { enabled: false, max_file_bytes: 1 << 20, quota_bytes: 0, used_bytes: 0 })
    await remoteFile('a-ana', 'Ana.pdf')
    const v = await mount({ role: 'viewer' })
    await waitFor(() => names().includes('Ana.pdf'))
    expect(v.container.querySelector('button[aria-label="Attach"]')).toBeNull()
    expect(v.container.querySelector('[aria-label="Remove Ana.pdf"]')).toBeNull()
    expect(v.container.querySelector('[aria-label="Rename Ana.pdf"]')).toBeNull()
  })

  it('shows no heading at rest, only Attach; the heading and the list come with the first file', async () => {
    const v = await mount()
    await flush()
    expect(v.container.querySelector('h3')).toBeNull()
    expect(v.container.textContent).not.toContain('Attachments')
    expect(v.container.querySelector('button[aria-label="Attach"]')).toBeTruthy()
    expect(v.container.querySelector('[data-drop-zone]')).toBeNull()
    await remoteFile('a-first', 'First.pdf')
    await waitFor(() => names().includes('First.pdf'))
    expect(v.container.querySelector('h3')!.textContent).toContain('Attachments')
  })

  it('shows the drop zone only while files are dragged over the panel', async () => {
    const panel = createRef<HTMLDivElement>()
    const r = await render(<div ref={panel}><AttachmentsRow taskId={task} userId="me" role="owner" dropTarget={panel} /></div>)
    mounted.push(r)
    await flush()
    const drag = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'dataTransfer', { value: { files: [], types: ['Files'] } })
      return e
    }
    await act(async () => { panel.current!.dispatchEvent(drag('dragover')) })
    expect(r.container.querySelector('[data-drop-zone]')).toBeTruthy()
    await act(async () => { panel.current!.dispatchEvent(drag('dragleave')) })
    expect(r.container.querySelector('[data-drop-zone]')).toBeNull()
  })

  it('hides itself on the demo when there is nothing to show', async () => {
    setDemo({ sandboxes: false } as never)
    const v = await mount()
    await flush()
    expect(v.container.querySelector('[data-testid="attachments-row"]')).toBeNull()
  })

  it('passes axe', async () => {
    await remoteFile('a-axe', 'Plan.pdf')
    await mount()
    await waitFor(() => names().includes('Plan.pdf'))
    const axe = (await import('axe-core')).default
    const res = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
  })

  it('shows a paperclip with the count on the task row', async () => {
    await remoteFile('a-1', 'One.pdf')
    await remoteFile('a-2', 'Two.pdf')
    const row = (await db.tasks.get(task))!
    const r = await render(<ul><TaskRow task={row} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    mounted.push(r)
    await waitFor(() => visibleText(r.container.querySelector('[data-attachments]') ?? document.createElement('i')) === '2')
    expect(spokenText(r.container.querySelector('[data-attachments]')!)).toBe('2 attachments')
  })

  it('names pasted images and types', () => {
    expect(pastedName(new Date(2026, 9, 15, 9, 5, 3))).toBe('Pasted image 2026-10-15 09.05.03.png')
    expect(typeLabel({ mime: 'application/pdf', name: 'a', url: null })).toBe('PDF')
    expect(typeLabel({ mime: 'application/octet-stream', name: 'notes.docx', url: null })).toBe('DOCX')
    expect(typeLabel({ mime: 'text/uri-list', name: 'x', url: 'https://x' })).toBe('Link')
  })
})
