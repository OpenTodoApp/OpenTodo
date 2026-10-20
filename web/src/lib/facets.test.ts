// The facet model (OpenSpec change task-panel-facets, design D1): the four lines of a
// task in the list row's words, from fixtures.
import { beforeEach, describe, expect, it } from 'vitest'
import { setDateTime } from './dates'
import { facetsOf, type FacetContext } from './facets'
import type { Label, Task } from './types'

const TODAY = '2026-10-14'
const base: Task = {
  id: 't', title: 'Report', description: '', project_id: null, parent_id: null, section_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, updated_at: 0, completed_at: null, deleted_at: null, recurrence: null, estimate_minutes: null, assignee_id: null, _clock: {},
} as unknown as Task
const ctx = (over: Partial<FacetContext> = {}): FacetContext => ({ local: null, projectName: 'Inbox', labels: [], reminders: 0, blockerTitles: [], blocks: 0, today: TODAY, ...over })
const texts = (parts: { text: string }[]) => parts.map((p) => p.text)
const label = (id: string, name: string): Label => ({ id, name, color: '#000', position: 0, created_at: 0, deleted_at: null, _clock: {} } as unknown as Label)

beforeEach(() => {
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})

describe('facetsOf', () => {
  it('the empty task: Where the Inbox, When not scheduled, How P4, no Who', () => {
    const f = facetsOf(base, ctx())
    expect(texts(f.where)).toEqual(['Inbox'])
    expect(f.when).toEqual([expect.objectContaining({ id: 'due', text: 'Not scheduled', empty: true, segment: 'due' })])
    expect(texts(f.how)).toEqual(['P4'])
    expect(f.who).toEqual([])
  })

  it('the full task reads as four lines', () => {
    const task = { ...base, priority: 2, due: { date: '2026-10-15', time: '09:00' }, recurrence: 'every 3 months', deadline: '2026-10-23', start: '2026-10-12', estimate_minutes: 120, assignee_id: 'me', blocked_by: ['b'] } as Task
    const f = facetsOf(task, ctx({
      local: { date: '2026-10-15', time: '09:00' }, projectName: 'Website launch', sectionName: 'Doing', reminders: 2,
      labels: [label('l1', 'finance'), label('l2', 'deck'), label('l3', 'deep-work')], assigneeName: 'You', blockerTitles: ['Collect the numbers'],
    }))
    expect(texts(f.where)).toEqual(['Website launch', 'Doing'])
    expect(f.where[1].sep).toBe('chevron')
    expect(texts(f.when)).toEqual(['Tomorrow 09:00', 'every 3 months', 'deadline Fri 23 Oct, 9 days', 'since Mon 12 Oct', '2 reminders'])
    expect(texts(f.how)).toEqual(['P2', '2h', 'finance, deck, deep-work'])
    expect(f.how[2].labels).toHaveLength(3)
    expect(texts(f.who)).toEqual(['You', 'waits for Collect the numbers'])
  })

  it('a future start reads "from", a past one "since", a parked task "Someday"', () => {
    expect(texts(facetsOf({ ...base, start: '2026-10-20' } as Task, ctx()).when)).toContain('from Tue 20 Oct')
    expect(texts(facetsOf({ ...base, start: '2026-10-10' } as Task, ctx()).when)).toContain('since Sat 10 Oct')
    expect(texts(facetsOf({ ...base, start: 'someday' } as Task, ctx()).when)).toContain('Someday')
  })

  it('an overdue deadline has the overdue tone; today and evening read as the row does', () => {
    const late = facetsOf({ ...base, deadline: '2026-10-11' } as Task, ctx()).when.find((p) => p.id === 'deadline')!
    expect(late.text).toBe('deadline Sun 11 Oct, 3 days over')
    expect(late.tone).toBe('overdue')
    const evening = facetsOf({ ...base, due: { date: TODAY }, evening: true, recurrence: 'every day' } as Task, ctx({ local: { date: TODAY } }))
    expect(texts(evening.when).slice(0, 3)).toEqual(['Today', 'evening', 'every day'])
  })

  it('a zoned due carries its city; a floating one does not', () => {
    expect(texts(facetsOf(base, ctx({ local: { date: '2026-10-15', time: '15:00' }, zoneCity: 'New York' })).when)[0]).toBe('Tomorrow 15:00 New York')
    expect(texts(facetsOf(base, ctx({ local: { date: '2026-10-15', time: '15:00' } })).when)[0]).toBe('Tomorrow 15:00')
  })

  it('properties revealed by Add show as empty parts; a subtask reads "under" its parent; the origin is fixed without a link', () => {
    const f = facetsOf({ ...base, parent_id: 'p' } as Task, ctx({ parentTitle: 'Plan the trip', originText: 'Email', originLinked: false, revealed: new Set(['estimate', 'deadline']) }))
    expect(texts(f.where)).toEqual(['Inbox', 'under Plan the trip', 'Email'])
    expect(f.where[2].fixed).toBe(true)
    expect(f.how.find((p) => p.id === 'estimate')).toMatchObject({ empty: true })
    expect(f.when.find((p) => p.id === 'deadline')).toMatchObject({ empty: true, segment: 'deadline' })
  })

  it('several blockers are counted, and dependents read "blocks n"', () => {
    const f = facetsOf(base, ctx({ blockerTitles: ['A', 'B'], blocks: 2 }))
    expect(texts(f.who)).toEqual(['waits for 2 tasks', 'blocks 2'])
  })
})
