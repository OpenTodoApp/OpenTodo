// @vitest-environment happy-dom
// The bell renders the unblocked kind (OpenSpec change task-dependencies, task 6.3),
// and marks unread notifications quietly (quiet-sidebar 2.2, app-shell "Notification
// bell marker"): a dot for one, a small accent count above one, never red.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { click, flush, render } from '../ui/test-utils'
import { NotificationBell } from './NotificationBell'

let n = 0
beforeEach(() => { useDatabase(`bell-${Date.now()}-${n++}`) })
afterEach(() => { document.body.innerHTML = '' })

describe('NotificationBell', () => {
  it('words an unblocked notification with the blocker and the task', async () => {
    await db.notifications.put({
      id: 'n1', kind: 'unblocked', createdAt: 1_760_000_000_000, readAt: null,
      payload: { assigneeId: 'bob', actorId: 'alice', actorName: 'Alice', taskId: 't2', taskTitle: 'Book flights', projectId: 'p', projectName: 'Trip', blockerId: 't1', blockerTitle: 'Confirm dates', at: 1 },
    })
    const r = await render(<NotificationBell />)
    for (let i = 0; i < 50 && !document.querySelector('[data-unread]'); i++) await flush(20)
    await click(document.querySelector('[data-notifications]')!)
    for (let i = 0; i < 50 && !document.querySelector('[data-kind="unblocked"]'); i++) await flush(20)
    expect(document.querySelector('[data-kind="unblocked"]')!.textContent).toBe('Alice completed Confirm dates: Book flights is ready to start')
    await r.unmount()
  })

  it('words a mention in a task\'s notes (editor-everywhere D7) apart from a comment mention', async () => {
    const base = { recipientId: 'bob', actorId: 'alice', actorName: 'Alice', commentId: '', taskId: 't1', taskTitle: 'Book flights', excerpt: '', at: 1 }
    await db.notifications.put({ id: 'm1', kind: 'mentioned', createdAt: 1_760_000_000_000, readAt: null, payload: { ...base, source: 'note' } } as never)
    await db.notifications.put({ id: 'm2', kind: 'mentioned', createdAt: 1_760_000_000_001, readAt: null, payload: { ...base, commentId: 'c1' } } as never)
    const r = await render(<NotificationBell />)
    for (let i = 0; i < 50 && !document.querySelector('[data-unread]'); i++) await flush(20)
    await click(document.querySelector('[data-notifications]')!)
    for (let i = 0; i < 50 && !document.querySelector('[data-mention-source="note"]'); i++) await flush(20)
    expect(document.querySelector('[data-mention-source="note"]')!.textContent).toBe('Alice mentioned you in the notes of Book flights')
    expect(document.body.textContent).toContain('Alice mentioned you on Book flights')
    await r.unmount()
  })

  const put = (id: string, readAt: number | null = null, taskId = id) => db.notifications.put({
    id, kind: 'assigned', createdAt: 1_760_000_000_000 + id.length, readAt,
    payload: { assigneeId: 'bob', actorId: 'alice', actorName: 'Alice', taskId, taskTitle: `Task ${id}`, projectId: null, projectName: '', at: 1 },
  } as never)
  const bell = () => document.querySelector<HTMLButtonElement>('[data-notifications]')!

  it('One notification: an accent dot, no number, "Notifications, 1 unread"', async () => {
    await put('n1')
    const r = await render(<NotificationBell />)
    for (let i = 0; i < 50 && !document.querySelector('[data-unread]'); i++) await flush(20)
    const mark = bell().querySelector('[data-unread]')!
    expect(mark.getAttribute('data-unread')).toBe('1')
    expect(mark.hasAttribute('data-dot')).toBe(true)
    expect(mark.className).toContain('bg-accent')
    expect(mark.textContent).toBe('')
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1 unread')
    await r.unmount()
  })

  it('Several notifications: "3" in a small accent count, never red, then "2" after reading one', async () => {
    await put('n1'); await put('n22'); await put('n333')
    const r = await render(<NotificationBell />)
    for (let i = 0; i < 50 && bell().querySelector('[data-unread]')?.textContent !== '3'; i++) await flush(20)
    const mark = bell().querySelector('[data-unread]')!
    expect(mark.textContent).toBe('3')
    expect(mark.className).toContain('bg-accent')
    expect(mark.className).not.toContain('danger')
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 3 unread')
    await db.notifications.update('n1', { readAt: Date.now() })
    for (let i = 0; i < 50 && bell().querySelector('[data-unread]')?.textContent !== '2'; i++) await flush(20)
    expect(bell().querySelector('[data-unread]')!.textContent).toBe('2')
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 2 unread')
    await r.unmount()
  })

  it('no unread notification: no mark', async () => {
    await put('n1', 5)
    const r = await render(<NotificationBell />)
    await flush(100)
    expect(bell().querySelector('[data-unread]')).toBeNull()
    expect(bell().getAttribute('aria-label')).toBe('Notifications')
    await r.unmount()
  })
})
