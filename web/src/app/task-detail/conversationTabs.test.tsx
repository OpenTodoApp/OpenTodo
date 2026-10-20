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

// Conversation tabs stay reachable (OpenSpec change task-panel-polish, web-app
// "Conversation tabs stay reachable"): the bar is sticky, a tab change never scrolls
// the panel vertically, and a pinned bar stays where it is with the new tab under it.
describe('a calm conversation', () => {
  it('pins the tab bar and keeps the panel still when switching tabs', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const v = await render(<ConversationTabs task={a} userId="me" readOnly={false} />)
    await settle()
    const bar = v.container.querySelector('[data-conversation] [role="tablist"]')!
    expect(bar.className).toContain('sticky')
    await click(tab(v.container, 'Activity'))
    await settle()
    expect(selected(v.container)).toContain('Activity')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    await v.unmount()
  })

  it('a pinned bar keeps its place: the new tab starts under it with room to stay pinned', async () => {
    // A scroller around the section, with the section scrolled above its top and the bar stuck at 0.
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 600 })
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 2000 })
    scroller.getBoundingClientRect = () => ({ top: 0, left: 0, right: 400, bottom: 600, width: 400, height: 600, x: 0, y: 0, toJSON() {} })
    document.body.append(scroller)
    const v = await render(<ConversationTabs task={a} userId="me" readOnly={false} />)
    scroller.append(v.container)
    await settle()
    const section = v.container.querySelector<HTMLElement>('[data-conversation]')!
    const bar = section.querySelector<HTMLElement>('[role="tablist"]')!
    section.getBoundingClientRect = () => ({ top: -500, left: 0, right: 400, bottom: 100, width: 400, height: 600, x: 0, y: -500, toJSON() {} })
    bar.getBoundingClientRect = () => ({ top: 0, left: 0, right: 400, bottom: 40, width: 400, height: 40, x: 0, y: 0, toJSON() {} })
    Object.defineProperty(bar, 'offsetHeight', { configurable: true, get: () => 40 })
    scroller.scrollTop = 800
    await click(tab(v.container, 'Activity'))
    await settle()
    const panel = section.querySelector<HTMLElement>('[role="tabpanel"]')!
    expect(panel.style.minHeight).toBe('560px')
    await v.unmount()
    scroller.remove()
  })
})
