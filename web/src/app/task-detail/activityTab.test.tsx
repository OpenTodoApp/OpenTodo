// @vitest-environment happy-dom
// Activity tab (task-detail-redesign 7.1): grouped runs, actors never merged,
// pending runs, compact comment lines and offline rendering from local storage.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupRuns } from '../../lib/activityRuns'
import { createComment } from '../../lib/comments'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId, updateTask } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import type { ActivityEvent, ActivityKind } from '../../lib/types'
import { click, flush, render } from '../../ui/test-utils'
import { ActivityTab, ActivityView, type ActivityViewProps } from './ActivityTab'

const MIN = 60_000
const NOW = new Date(2026, 9, 14, 12).getTime()
let n = 0
const ev = (kind: ActivityKind, actor: string, ts: number, changes: { field: string; from?: unknown; to?: unknown }[] = [], entityId = 't1'): ActivityEvent =>
  ({ id: `e${++n}`, kind, actor, entity: kind.startsWith('comment') ? 'comment' : 'task', entityId, taskId: 't1', ts, opIds: [`op${n}`], changes: changes.map((c) => ({ from: null, to: null, ...c })) })

function props(events: ActivityEvent[], over: Partial<ActivityViewProps> = {}, pending?: Set<string>): ActivityViewProps {
  const names: Record<string, string> = { me: 'You', alice: 'Alice', bob: 'Bob' }
  return {
    runs: groupRuns(events, { pending }), name: (id) => names[id] ?? 'Someone', project: (id) => (id ? 'Work' : 'Inbox'),
    onOpenComment: vi.fn(), canLoadOlder: false, loadState: 'idle', onLoadOlder: vi.fn(), now: NOW, ...over,
  }
}

describe('ActivityView', () => {
  it('folds a burst of edits into one run that expands to its events', async () => {
    const v = await render(<ActivityView {...props([
      ev('edited', 'me', NOW - 1 * MIN, [{ field: 'priority', from: 4, to: 1 }]),
      ev('rescheduled', 'me', NOW - 2 * MIN, [{ field: 'due', to: { date: '2026-10-20' } }]),
      ev('edited', 'me', NOW - 3 * MIN, [{ field: 'title', from: 'a', to: 'b' }]),
    ])} />)
    const runs = v.container.querySelectorAll('[data-run]')
    expect(runs).toHaveLength(1)
    const toggle = runs[0].querySelector('button[aria-expanded]')!
    expect(toggle.textContent).toBe('You renamed the task and changed the due date and priority')
    expect(v.container.querySelectorAll('[data-event]')).toHaveLength(0)
    await click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(v.container.querySelectorAll('[data-event]')).toHaveLength(3)
    await v.unmount()
  })

  it('does not merge different actors', async () => {
    const v = await render(<ActivityView {...props([
      ev('edited', 'bob', NOW - 1 * MIN, [{ field: 'priority', from: 4, to: 1 }]),
      ev('rescheduled', 'alice', NOW - 2 * MIN, [{ field: 'due', to: { date: '2026-10-20' } }]),
    ])} />)
    const runs = [...v.container.querySelectorAll('[data-run]')].map((r) => r.textContent)
    expect(runs).toHaveLength(2)
    expect(runs[0]).toContain('Bob')
    expect(runs[1]).toContain('Alice')
    await v.unmount()
  })

  it('marks a run pending when one of its events is unsent', async () => {
    const a = ev('edited', 'me', NOW - 1 * MIN, [{ field: 'priority' }])
    const b = ev('rescheduled', 'me', NOW - 2 * MIN)
    const v = await render(<ActivityView {...props([a, b], {}, new Set(b.opIds))} />)
    expect(v.container.querySelector('[data-run]')!.textContent).toContain('pending')
    await v.unmount()
  })

  it('shows a comment event as one compact line that opens the comment', async () => {
    const p = props([ev('commented', 'bob', NOW - 60 * MIN, [], 'c9')])
    const v = await render(<ActivityView {...p} />)
    const line = v.container.querySelector('[data-run="comment"]')!
    expect(line.textContent).toContain('Bob commented')
    expect(line.textContent).toContain('1 h ago')
    await click(line.querySelector('button')!)
    expect(p.onOpenComment).toHaveBeenCalledWith('c9')
    await v.unmount()
  })

  it('offers older activity only when it can be loaded', async () => {
    const p = props([], { canLoadOlder: true })
    const v = await render(<ActivityView {...p} />)
    expect(v.container.textContent).toContain('No activity yet')
    await click([...v.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Load older'))!)
    expect(p.onLoadOlder).toHaveBeenCalled()
    await v.unmount()
  })
})

describe('ActivityTab (local storage)', () => {
  let k = 0
  beforeEach(async () => {
    useDatabase(`acttab-${Date.now()}-${k++}`)
    resetDeviceId()
    await setCurrentUserId('me')
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('starts with the task’s created and completed times', async () => {
    const id = await createTask({ title: 'Pay rent' })
    const r = await render(<ActivityTab task={(await db.tasks.get(id))!} userId="me" onOpenComment={() => {}} />)
    await flush(40)
    const times = r.container.querySelector('[data-activity-times]')!
    expect(times.textContent).toContain('Created')
    expect(times.textContent).not.toContain('Completed')
    expect(r.container.querySelector('.space-y-3')!.firstElementChild).toBe(times)
    await r.unmount()
    await updateTask(id, { completed_at: NOW })
    const done = await render(<ActivityTab task={(await db.tasks.get(id))!} userId="me" onOpenComment={() => {}} />)
    await flush(40)
    expect(done.container.querySelector('[data-activity-times]')!.textContent).toContain('Completed')
    await done.unmount()
  })

  it('renders offline from the device, with unsent changes pending and no server paging', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const id = await createTask({ title: 'Milk' })
    await updateTask(id, { priority: 1 })
    await createComment({ taskId: id, body: 'hi' })
    const task = (await db.tasks.get(id))!
    const v = await render(<ActivityTab task={task} userId="me" onOpenComment={() => {}} />)
    await act(async () => { for (let i = 0; i < 5; i++) await flush(20) })
    const runs = [...v.container.querySelectorAll('[data-run]')]
    expect(runs.map((r) => r.getAttribute('data-run'))).toEqual(['comment', 'changes'])
    expect(runs[1].textContent).toContain('You created the task') // creation and the quick priority edit fold into one event
    expect(runs[1].textContent).toContain('pending')
    expect(v.container.textContent).not.toContain('Load older')
    await v.unmount()
  })
})
