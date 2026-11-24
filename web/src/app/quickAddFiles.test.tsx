// @vitest-environment happy-dom
// Pasting files into quick add (OpenSpec change quick-add-files, task 1.2, issue #1951):
// a pasted image waits under the title and is saved with the new task; it can be
// removed first; a text paste is unchanged; a file over the limit is refused.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api', async (real) => ({
  ...(await real<typeof import('../lib/api')>()),
  api: { ...(await real<typeof import('../lib/api')>()).api, uploadAttachment: vi.fn(async () => ({ status: 204 })), me: vi.fn(async () => ({})) },
}))

import { db, setMeta, useDatabase } from '../lib/db'
import { addTaskUndoable } from '../lib/pasteTasks'
import { resetDeviceId } from '../lib/ops'
import { click, flush, render, type, waitFor } from '../ui/test-utils'
import { QuickAdd } from './QuickAdd'

let n = 0
beforeEach(async () => {
  useDatabase(`quick-add-files-ui-${Date.now()}-${n++}`)
  resetDeviceId()
  await setMeta('userId', 'u1')
  await setMeta('attachmentLimits', { enabled: true, max_file_bytes: 1000, quota_bytes: 0, used_bytes: 0 })
})

/** Pastes clipboard data holding `files` and `text`; returns whether the browser's paste was held back. */
async function paste(input: HTMLTextAreaElement, files: File[], text = ''): Promise<boolean> {
  const e = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'clipboardData', { value: { files, getData: (kind: string) => (kind === 'text/plain' ? text : '') } })
  await act(async () => { input.dispatchEvent(e) })
  await flush()
  return e.defaultPrevented
}

const shot = (bytes = 9) => new File(['x'.repeat(bytes)], 'image.png', { type: 'image/png' })
const pending = () => document.querySelector<HTMLElement>('[data-pending-files]')
const liveAttachments = async () => (await db.attachments.toArray()).filter((a) => !a.deleted_at)

async function setup() {
  const r = await render(<QuickAdd placeholder="Add a task" onAdd={async (input) => { await addTaskUndoable(input) }} />)
  const input = r.container.querySelector('textarea')!
  const submit = () => act(async () => { input.form!.requestSubmit() })
  return { r, input, submit }
}

describe('pasting files into quick add', () => {
  it('a pasted screenshot waits under the title, is announced, and is saved with the task', async () => {
    const { r, input, submit } = await setup()
    await type(input, 'Fix the header')
    expect(await paste(input, [shot()])).toBe(true)
    await waitFor(() => !!pending(), 'the pending file')
    expect(input.value).toBe('Fix the header')
    expect(pending()!.getAttribute('aria-label')).toBe('Files to attach')
    expect(pending()!.textContent).toMatch(/^Pasted image .*\.png$/)
    expect(r.container.querySelector('[role="status"].sr-only')!.textContent).toMatch(/will be attached$/)
    expect(pending()!.querySelector('button')!.getAttribute('aria-label')).toMatch(/^Remove Pasted image/)
    await submit()
    await waitFor(async () => (await liveAttachments()).length === 1, 'the attachment')
    const [task] = await db.tasks.toArray()
    expect(task.title).toBe('Fix the header')
    const [row] = await liveAttachments()
    expect(row).toMatchObject({ task_id: task.id, mime: 'image/png', uploaded_at: null })
    expect(await db.attachmentBlobs.get(row.id)).toBeDefined()
    expect(pending()).toBeNull()
    await r.unmount()
  })

  it('a pending file can be removed before saving, and the focus returns to the field', async () => {
    const { r, input, submit } = await setup()
    await type(input, 'Fix the header')
    await paste(input, [shot()])
    await waitFor(() => !!pending(), 'the pending file')
    await click(pending()!.querySelector('button')!)
    expect(pending()).toBeNull()
    expect(document.activeElement).toBe(input)
    await submit()
    await waitFor(async () => (await db.tasks.count()) === 1, 'the task')
    expect(await liveAttachments()).toHaveLength(0)
    await r.unmount()
  })

  it('a text paste is unchanged', async () => {
    const { r, input } = await setup()
    expect(await paste(input, [], 'Call Anna')).toBe(false)
    expect(pending()).toBeNull()
    expect(r.container.querySelector('[data-quick-add-file-error]')).toBeNull()
    await r.unmount()
  })

  it('spreadsheet rows (text with a picture of them) paste as text and keep the paste-to-tasks offer', async () => {
    const { r, input } = await setup()
    expect(await paste(input, [shot()], 'Milk\nEggs\nBread')).toBe(true)
    await waitFor(() => !!document.querySelector('[data-paste-offer]'), 'the paste-to-tasks offer')
    expect(pending()).toBeNull()
    // One row is pasted by the browser as text.
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-paste-one-line]')!.click() })
    expect(await paste(input, [shot()], 'Milk')).toBe(false)
    expect(pending()).toBeNull()
    await r.unmount()
  })

  it('a named file pasted with text is still a file', async () => {
    const { r, input } = await setup()
    expect(await paste(input, [new File(['%PDF'], 'invoice.pdf', { type: 'application/pdf' })], 'invoice.pdf')).toBe(true)
    await waitFor(() => !!pending(), 'the pending file')
    expect(pending()!.textContent).toBe('invoice.pdf')
    await r.unmount()
  })

  it('a paste right before Enter goes with that task, not the next one', async () => {
    const { r, input } = await setup()
    await type(input, 'Fix the header')
    const e = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'clipboardData', { value: { files: [shot()], getData: () => '' } })
    await act(async () => { input.dispatchEvent(e); input.form!.requestSubmit() })
    await waitFor(async () => (await liveAttachments()).length === 1, 'the attachment')
    const [task] = await db.tasks.toArray()
    expect((await liveAttachments())[0].task_id).toBe(task.id)
    await waitFor(() => !document.querySelector('[role=status].sr-only')?.textContent, 'no file left for the next task')
    expect(pending()).toBeNull()
    await r.unmount()
  })

  it('two quick pastes are checked against each other for the quota', async () => {
    await setMeta('attachmentLimits', { enabled: true, max_file_bytes: 1000, quota_bytes: 1000, used_bytes: 0 })
    const { r, input } = await setup()
    const e1 = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(e1, 'clipboardData', { value: { files: [shot(600)], getData: () => '' } })
    const e2 = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(e2, 'clipboardData', { value: { files: [shot(600)], getData: () => '' } })
    await act(async () => { input.dispatchEvent(e1); input.dispatchEvent(e2) })
    await waitFor(() => !!r.container.querySelector('[data-quick-add-file-error]'), 'the quota refusal')
    expect(pending()!.querySelectorAll('li')).toHaveLength(1)
    await r.unmount()
  })

  it('a file over the limit is refused with the attachment message and nothing waits', async () => {
    const { r, input } = await setup()
    await type(input, 'Fix the header')
    expect(await paste(input, [shot(2000)])).toBe(true)
    await waitFor(() => !!r.container.querySelector('[data-quick-add-file-error]'), 'the refusal')
    const alert = r.container.querySelector('[data-quick-add-file-error]')!
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain('files may be at most 1000 bytes on this server')
    expect(pending()).toBeNull()
    expect(input.value).toBe('Fix the header')
    await r.unmount()
  })

  it('a limit learnt after the paste refuses the save: the line and the file come back with the reason', async () => {
    const { r, input, submit } = await setup()
    await type(input, 'Fix the header')
    await paste(input, [shot(500)])
    await waitFor(() => !!pending(), 'the pending file')
    await setMeta('attachmentLimits', { enabled: true, max_file_bytes: 100, quota_bytes: 0, used_bytes: 0 })
    await submit()
    await waitFor(() => !!r.container.querySelector('[data-quick-add-file-error]'), 'the refusal')
    expect(input.value).toBe('Fix the header')
    expect(pending()).not.toBeNull()
    expect(await db.tasks.count()).toBe(0)
    await r.unmount()
  })

  it('the capture screen keeps its own file list: a paste there is not taken', async () => {
    const r = await render(<QuickAdd placeholder="Task title" pasteFiles={false} onAdd={vi.fn()} />)
    expect(await paste(r.container.querySelector('textarea')!, [shot()])).toBe(false)
    expect(pending()).toBeNull()
    await r.unmount()
  })
})
