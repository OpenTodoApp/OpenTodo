import { afterEach, describe, expect, it } from 'vitest'
import { setDateTime } from '../dates'
import type { DateTimePrefs } from '../userPrefs'
import type { Label, RuleActions, Task } from '../types'
import { planRule } from '.'
import cases from './plan.fixture.json'

interface PlanCase {
  name: string
  today: string
  now: number
  me: string
  week_start: 'mon' | 'sun'
  actions: RuleActions
  task: Record<string, unknown>
  live_labels: string[]
  expect: Record<string, unknown>
  skipped?: string[]
}

// The project and section cases are the server's (a rule never moves a task
// into or out of a shared project); on a device a move goes through
// planMoveGroups, which dashboardDrop tests cover.
const prefs = (w: 'mon' | 'sun'): DateTimePrefs => ({ date_format: 'system', time_format: 'system', week_start: w })

const deviceCases = (cases as PlanCase[]).filter((c) => !c.actions.section)

describe('rule actions (shared fixture with internal/rules)', () => {
  afterEach(() => setDateTime(prefs('mon')))
  for (const c of deviceCases) {
    it(c.name, () => {
      setDateTime(prefs(c.week_start))
      const task = { ...c.task, id: 't', deleted_at: null, parent_id: null, blocked_by: [] } as unknown as Task
      const labels = c.live_labels.map((id) => ({ id, name: id, deleted_at: null }) as unknown as Label)
      const changes = planRule(task, [task], c.actions, { now: c.now, today: c.today, labels, memberships: new Map(), me: c.me })
      const patch = Object.assign({}, ...changes.filter((x) => x.entityId === 't').map((x) => x.patch)) as Record<string, unknown>
      delete patch.completed_by
      expect(patch).toEqual(c.expect)
    })
  }
})
