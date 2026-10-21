// "Keeps slipping" (OpenSpec change stats-dashboard, task 2.3): open tasks whose
// due date this device's activity record shows moved later or removed three or
// more times in 90 days.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { isSlip, slippingFrom, slipRows } from './statsSlipping'
import type { ActivityEntry, Task } from './types'

const NOW = new Date(2026, 9, 21, 12).getTime()
const DAY = 86_400_000
function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: { date: '2026-10-30' }, labels: [],
    position: 0, created_at: NOW - 200 * DAY, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null,
    series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}
let n = 0
const move = (taskId: string, from: string | null, to: string | null, daysAgo: number): ActivityEntry => ({
  id: `op${n++}`, actor: 'me', entity: 'task', entityId: taskId, field: 'due', value: to ? { date: to } : null,
  from: from ? { date: from } : null, ts: NOW - daysAgo * DAY, device: 'd', projectKey: '', taskId,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('keeps slipping', () => {
  it('a later move or a removal is a slip; an earlier move and a first date are not', () => {
    expect(isSlip(move('a', '2026-10-01', '2026-10-08', 0))).toBe(true)
    expect(isSlip(move('a', '2026-10-01', null, 0))).toBe(true)
    expect(isSlip(move('a', '2026-10-08', '2026-10-01', 0))).toBe(false)
    expect(isSlip(move('a', null, '2026-10-01', 0))).toBe(false)
  })

  it('lists only the open task with three slips in 90 days, read from the local record', async () => {
    await db.activity.bulkPut([
      // Moved later on 1, 8 and 15 October: listed.
      move('slips', '2026-10-01', '2026-10-08', 20), move('slips', '2026-10-08', '2026-10-15', 13), move('slips', '2026-10-15', '2026-10-22', 6),
      // Two later and one earlier: not enough.
      move('mixed', '2026-10-01', '2026-10-08', 20), move('mixed', '2026-10-08', '2026-10-05', 13), move('mixed', '2026-10-05', '2026-10-09', 6),
      // Removed twice and moved later once: listed.
      move('removed', '2026-10-01', null, 30), move('removed', '2026-10-02', null, 20), move('removed', '2026-10-03', '2026-10-30', 10),
      // Three slips, one older than 90 days: not enough.
      move('old', '2026-06-01', '2026-06-08', 120), move('old', '2026-06-08', '2026-07-01', 60), move('old', '2026-07-01', '2026-08-01', 50),
      // Three slips but completed, repeating, or in the Trash: not listed.
      ...['done', 'repeating', 'trashed'].flatMap((id) => [move(id, '2026-10-01', '2026-10-02', 3), move(id, '2026-10-02', '2026-10-03', 2), move(id, '2026-10-03', '2026-10-04', 1)]),
    ])
    const tasks = [task('slips', { project_id: 'p' }), task('mixed'), task('removed', { due: null }), task('old'), task('done', { completed_at: NOW }),
      task('repeating', { recurrence: 'every week' }), task('trashed', { deleted_at: NOW })]
    const rows = await slipRows(NOW)
    const list = slippingFrom(rows, { tasks, projects: [], shared: new Set(), me: 'me' }, NOW)
    expect(list.map((s) => [s.task.id, s.moves])).toEqual([['removed', 3], ['slips', 3]])
  })
})
