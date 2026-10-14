// @vitest-environment happy-dom
// Comments · Activity · History tabs (task-detail-redesign 6.1): the remembered
// tab and Shift+C switching to Comments with the composer focused.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createComment } from '../../lib/comments'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import type { HistoryPage, Task } from '../../lib/types'
import { click, flush, key, render } from '../../ui/test-utils'
import { ConversationTabs, readTaskTab, TASK_TAB_KEY } from './ConversationTabs'

const fetchHistory = vi.fn<(entity: string, id: string) => Promise<HistoryPage>>()
vi.mock('../../lib/history', async (orig) => ({ ...(await orig<typeof import('../../lib/history')>()), fetchHistory: (...a: [string, string]) => fetchHistory(...a) }))

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await flush(20) })
const tab = (c: HTMLElement, name: string) => [...c.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.startsWith(name)) as HTMLElement
const selected = (c: HTMLElement) => c.querySelector('[role="tab"][aria-selected="true"]')?.textContent

let k = 0
let a: Task
let b: Task
beforeEach(async () => {
  localStorage.clear()
  useDatabase(`convtabs-${Date.now()}-${k++}`)
  resetDeviceId()
  await setCurrentUserId('me')
  a = (await db.tasks.get(await createTask({ title: 'A' })))!
  b = (await db.tasks.get(await createTask({ title: 'B' })))!
  fetchHistory.mockResolvedValue({ entity: 'task', id: a.id, changeSets: [], more: false })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('ConversationTabs', () => {
  it('opens on Comments with the comment count', async () => {
    await createComment({ taskId: a.id, body: 'one' })
    await createComment({ taskId: a.id, body: 'two' })
    const v = await render(<ConversationTabs task={a} userId="me" readOnly={false} />)
    await settle()
    expect(selected(v.container)).toBe('Comments2')
    expect(v.container.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe('Task conversation')
    await v.unmount()
  })

  it('remembers the last tab on this device for the next task', async () => {
    const v = await render(<ConversationTabs task={a} userId="me" readOnly={false} />)
    await settle()
    await click(tab(v.container, 'Activity'))
    expect(localStorage.getItem(TASK_TAB_KEY)).toBe('activity')
    await v.unmount()
    const next = await render(<ConversationTabs task={b} userId="me" readOnly={false} />)
    await settle()
    expect(selected(next.container)).toBe('Activity')
    await next.unmount()
  })

  it('falls back to Comments when storage is unreadable or holds junk', () => {
    localStorage.setItem(TASK_TAB_KEY, 'nonsense')
    expect(readTaskTab()).toBe('comments')
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } })
    expect(readTaskTab()).toBe('comments')
  })

  it('Shift+C from the History tab shows Comments and focuses the composer', async () => {
    localStorage.setItem(TASK_TAB_KEY, 'history')
    const v = await render(<ConversationTabs task={a} userId="me" readOnly={false} />)
    await settle()
    expect(selected(v.container)).toBe('History')
    await key(document.body, 'C', { shiftKey: true })
    await settle()
    expect(selected(v.container)).toMatch(/^Comments/)
    expect(document.activeElement?.id).toBe('comment-composer')
    await v.unmount()
  })

  it('ignores Shift+C typed into a text field', async () => {
    localStorage.setItem(TASK_TAB_KEY, 'activity')
    const v = await render(<ConversationTabs task={a} userId="me" readOnly={false} />)
    await settle()
    const input = document.createElement('input')
    document.body.append(input)
    await key(input, 'C', { shiftKey: true })
    expect(selected(v.container)).toBe('Activity')
    input.remove()
    await v.unmount()
  })
})
