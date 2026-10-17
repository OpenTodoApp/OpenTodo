// The Day and Week grids as data (OpenSpec change web-component-structure).
import { describe, expect, it } from 'vitest'
import { calendarDays, calendarOrder } from './calendarDays'
import type { CalendarEvent, Task } from './types'

function task(p: Partial<Task> = {}): Task {
  return {
    id: 't', title: 'T', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...p,
  }
}
const ev = (id: string, start: CalendarEvent['start'], end: CalendarEvent['end'], allDay = false): CalendarEvent => ({ id, subscriptionId: 's', uid: id, summary: id, location: '', start, end, allDay, free: false })

const MON = '2026-10-12', TUE = '2026-10-13'

describe('calendarDays', () => {
  it('puts timed tasks in blocks and date-only tasks in the lane, by priority then position', () => {
    const low = task({ id: 'low', due: { date: MON }, priority: 4, position: 1 })
    const high = task({ id: 'high', due: { date: MON }, priority: 1, position: 2 })
    const timed = task({ id: 'timed', due: { date: MON, time: '09:00' }, estimate_minutes: 30 })
    const tuesday = task({ id: 'tue', due: { date: TUE } })
    const [mon, tue] = calendarDays([MON, TUE], [low, high, timed, tuesday], [])
    expect(mon.lane.map((t) => t.id)).toEqual(['high', 'low'])
    expect([...mon.blocks.keys()]).toEqual(['timed'])
    expect(mon.blocks.get('timed')).toMatchObject({ start: 540, end: 570, estimated: true })
    expect(tue.lane.map((t) => t.id)).toEqual(['tue'])
  })

  it('lays timed events out beside task blocks, lists all-day events, and keeps events out of the keyboard order', () => {
    const timed = task({ id: 'timed', due: { date: MON, time: '09:00' }, estimate_minutes: 60 })
    const lane = task({ id: 'lane', due: { date: MON } })
    const meeting = ev('m', { date: MON, time: '09:30' }, { date: MON, time: '10:30' })
    const holiday = ev('h', { date: MON }, { date: TUE }, true)
    const [mon] = calendarDays([MON], [timed, lane], [meeting, holiday])
    expect([...mon.events.keys()]).toEqual(['event:m'])
    expect(mon.allDay.map((e) => e.id)).toEqual(['h'])
    expect(mon.layout.blocks.map((b) => b.id).sort()).toEqual(['event:m', 'timed'])
    expect(mon.layout.blocks.every((b) => b.overlap)).toBe(true)
    expect(calendarOrder([mon])).toEqual(['lane', 'timed'])
  })
})
