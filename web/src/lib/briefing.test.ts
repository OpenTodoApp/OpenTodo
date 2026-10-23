// The briefing rules (OpenSpec change briefing, task 2.1): pure facts over local rows,
// pinned by the scenarios in briefing.fixtures.json.
import { describe, expect, it } from 'vitest'
import { briefingFacts, type BriefingInput } from './briefing'
import fixtures from './briefing.fixtures.json'
import type { AppNotification, Task } from './types'

type Row = Partial<Task> & { completed?: string }

let n = 0
function task(row: Row): Task {
  n++
  const { completed, ...over } = row
  const at = completed ? (() => { const [y, m, d] = completed.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime() })() : null
  return {
    id: `t${n}`, title: 'Task', notes: '', project_id: null, section_id: null, parent_id: null, position: n,
    priority: 4, due: null, deadline: null, start: null, labels: [], completed_at: at, deleted_at: null, created_at: n, updated_at: n,
    assignee_id: null, ...over,
  } as Task
}

describe('briefing facts', () => {
  for (const s of fixtures.scenarios) {
    it(s.name, () => {
      const input: BriefingInput = {
        view: s.view as 'today' | 'upcoming',
        today: fixtures.today,
        tasks: (s.tasks as Row[]).map(task),
        projects: ('projects' in s ? s.projects : []) as BriefingInput['projects'],
        dayLength: fixtures.dayLength,
        notifications: s.notifications.map((x) => ({ createdAt: 1, ...x })) as unknown as AppNotification[],
        closed: 'closed' in s && !!s.closed,
        dayStart: 0,
      }
      expect(briefingFacts(input)).toEqual(s.expect)
    })
  }

  it('a deleted task is never counted', () => {
    const b = briefingFacts({
      view: 'today', today: fixtures.today, projects: [], dayLength: 480, notifications: [], closed: false, dayStart: 0,
      tasks: [task({ due: { date: '2026-10-20' }, deleted_at: 5 })],
    })
    expect(b.mode).toBe('clear')
  })
})
