// groupRuns and summarizeRun (task-detail-redesign D6, activity-log "Grouped activity runs").
import { describe, expect, it } from 'vitest'
import fixture from '../../../internal/activity/testdata/activity_fixture.json'
import { deriveActivity, newestFirst } from './activity'
import { groupRuns, RUN_WINDOW_MS, summarizeRun } from './activityRuns'
import type { ActivityEvent, ActivityKind } from './types'

const MIN = 60_000
let n = 0
const ev = (kind: ActivityKind, actor: string, ts: number, changes: { field: string; from?: unknown; to?: unknown }[] = [], taskId = 't1'): ActivityEvent =>
  ({ id: `e${++n}`, kind, actor, entity: kind.startsWith('comment') ? 'comment' : 'task', entityId: taskId, taskId, ts, opIds: [`op${n}`], changes: changes.map((c) => ({ from: null, to: null, ...c })) })

describe('groupRuns', () => {
  it('a same-actor burst inside 10 minutes forms one run (newest first)', () => {
    const list = [ev('edited', 'me', 3 * MIN, [{ field: 'priority' }]), ev('rescheduled', 'me', 2 * MIN), ev('edited', 'me', 1 * MIN, [{ field: 'title' }])]
    const runs = groupRuns(list)
    expect(runs).toHaveLength(1)
    expect(runs[0].events).toHaveLength(3)
    expect(runs[0].id).toBe(list[0].id)
    expect(summarizeRun(runs[0], 'You')).toBe('You renamed the task and changed the due date and priority')
  })
  it('another actor in between splits the run', () => {
    const runs = groupRuns([ev('rescheduled', 'me', 3 * MIN), ev('edited', 'bob', 2 * MIN, [{ field: 'priority' }]), ev('edited', 'me', 1 * MIN, [{ field: 'title' }])])
    expect(runs.map((r) => r.actor)).toEqual(['me', 'bob', 'me'])
  })
  it('the window edge: exactly 10 minutes joins, one millisecond more splits', () => {
    expect(groupRuns([ev('rescheduled', 'me', RUN_WINDOW_MS), ev('edited', 'me', 0, [{ field: 'title' }])])).toHaveLength(1)
    expect(groupRuns([ev('rescheduled', 'me', RUN_WINDOW_MS + 1), ev('edited', 'me', 0, [{ field: 'title' }])])).toHaveLength(2)
  })
  it('chains events each within the window of the previous one', () => {
    expect(groupRuns([ev('edited', 'me', 18 * MIN, [{ field: 'priority' }]), ev('edited', 'me', 9 * MIN, [{ field: 'labels' }]), ev('edited', 'me', 0, [{ field: 'title' }])])).toHaveLength(1)
  })
  it('keeps comment kinds as single entries and never merges different tasks', () => {
    const runs = groupRuns([ev('commented', 'me', 3 * MIN), ev('commented', 'me', 2 * MIN), ev('edited', 'me', 1 * MIN, [{ field: 'title' }], 't2'), ev('edited', 'me', 0, [{ field: 'title' }])])
    expect(runs.map((r) => r.type)).toEqual(['comment', 'comment', 'changes', 'changes'])
    expect(summarizeRun(runs[0], 'Bob')).toBe('Bob commented')
  })
  it('a run is pending when any of its events is', () => {
    const a = ev('edited', 'me', 2 * MIN, [{ field: 'title' }])
    const b = ev('rescheduled', 'me', 1 * MIN)
    expect(groupRuns([a, b], { pending: new Set(b.opIds) })[0].pending).toBe(true)
    expect(groupRuns([a, b], { pending: new Set() })[0].pending).toBe(false)
  })
})

describe('summarizeRun', () => {
  it('names at most three changes and counts the rest', () => {
    const run = groupRuns([ev('edited', 'me', 4, [{ field: 'priority' }, { field: 'labels' }, { field: 'estimate_minutes' }]), ev('rescheduled', 'me', 3), ev('edited', 'me', 2, [{ field: 'recurrence' }])])[0]
    expect(summarizeRun(run, 'Ana')).toBe('Ana changed the due date, priority and labels and 2 more')
  })
  it('lists verbs before the changed fields', () => {
    const run = groupRuns([ev('completed', 'me', 2), ev('created', 'me', 1)])[0]
    expect(summarizeRun(run, 'You')).toBe('You created the task and completed the task')
  })
})

describe('shared activity fixture', () => {
  it('runs keep every event exactly once and never mix actors or comment events', () => {
    for (const c of fixture.cases) {
      const events = newestFirst(deriveActivity(c.ops as never))
      const runs = groupRuns(events)
      expect(runs.flatMap((r) => r.events).map((e) => e.id)).toEqual(events.map((e) => e.id))
      for (const r of runs) {
        expect(new Set(r.events.map((e) => e.actor)).size).toBe(1)
        if (r.type === 'comment') expect(r.events).toHaveLength(1)
      }
    }
  })
})
