// @vitest-environment happy-dom
// The task panel's title draft (OpenSpec change client-sync-robustness): a
// change from another device does not overwrite a title being typed; an
// untouched title follows remote changes.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { applyOps, createTask } from '../../lib/ops'
import { flush } from '../../ui/test-utils'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'
import { act } from 'react'

setupTaskDetailTests()

const remoteTitle = (id: string, title: string, ts: number) =>
  applyOps([{ id: `op-${ts}`, entity: 'task', entityId: id, field: 'title', value: title, ts, device: 'other-device' }])

function titleInput(): HTMLTextAreaElement {
  return document.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')!
}

function type(input: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('task title draft', () => {
  it('a remote change does not overwrite the title being typed; the draft is saved on blur', async () => {
    const id = await createTask({ title: 'Plan' })
    const { unmount } = await open(id)
    const input = titleInput()
    await act(async () => {
      input.focus()
      type(input, 'Plan the trip')
    })
    await remoteTitle(id, 'Plan (remote)', Date.now() + 60_000)
    // Nothing shows the remote title while the draft is kept: give it a moment to arrive.
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- asserts the remote change does not replace the draft
    await flush(40)
    expect(titleInput().value).toBe('Plan the trip')
    await act(async () => { titleInput().blur() })
    await waitFor(async () => (await db.outbox.toArray()).some((o) => o.entityId === id && o.field === 'title' && o.value === 'Plan the trip'), 'the draft written')
    // The draft goes out as the user's own edit (a new op); last writer wins as usual.
    expect((await db.outbox.toArray()).some((o) => o.entityId === id && o.field === 'title' && o.value === 'Plan the trip')).toBe(true)
    await unmount()
  })

  it('an untouched title follows remote changes, focused or not', async () => {
    const id = await createTask({ title: 'Plan' })
    const { unmount } = await open(id)
    await remoteTitle(id, 'Plan v2', Date.now() + 60_000)
    await waitFor(() => titleInput().value === 'Plan v2', 'the remote title')
    expect(titleInput().value).toBe('Plan v2')
    await act(async () => { titleInput().focus() })
    await remoteTitle(id, 'Plan v3', Date.now() + 120_000)
    await waitFor(() => titleInput().value === 'Plan v3', 'the remote title')
    expect(titleInput().value).toBe('Plan v3')
    await unmount()
  })
})
