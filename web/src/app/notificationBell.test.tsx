// @vitest-environment happy-dom
// The bell renders the unblocked kind (OpenSpec change task-dependencies, task 6.3).
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
})
