import { describe, expect, it } from 'vitest'
import {
  DAY_MINUTES,
  allDayEvents,
  eventBlocks,
  blockFor, calendarTasks, dayLoad, DEFAULT_GRID_PREFS, dropStart, formatLoad, formatTime, normalizeGridPrefs, nudgeDue, parseTime,
  placementStart, resizeEstimate, slotFromOffset, stepEstimate, weekDates,
} from './calendar'
import { formatHour, formatTime as formatWallTime, resolveDateTime } from './dates'
import type { CalendarEvent, Task } from './types'

function task(p: Partial<Task> = {}): Task {
  return {
    id: 't', title: 'T', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...p,
  }
}

const PX = 48 / 60 // 48 px per hour, 12 px per slot

describe('time strings', () => {
  it('parses and formats HH:MM', () => {
    expect(parseTime('09:30')).toBe(570)
    expect(parseTime('00:00')).toBe(0)
    expect(parseTime('23:59')).toBe(1439)
    for (const bad of ['24:00', '9:30', '09:60', '', undefined, null, 'x']) expect(parseTime(bad)).toBeNull()
    expect(formatTime(570)).toBe('09:30')
    expect(formatTime(-5)).toBe('00:00')
    expect(formatTime(2000)).toBe('23:59')
  })
})

describe('slot math', () => {
  it('maps a pointer offset to the 15-minute slot under it', () => {
    expect(slotFromOffset(0, PX)).toBe(0)
    expect(slotFromOffset(11.9, PX)).toBe(0)
    expect(slotFromOffset(12, PX)).toBe(15)
    expect(slotFromOffset(14.5 * 48 + 5, PX)).toBe(14 * 60 + 30)
  })

  it('clamps to the day and survives bad input', () => {
    expect(slotFromOffset(-40, PX)).toBe(0)
    expect(slotFromOffset(24 * 48 + 100, PX)).toBe(23 * 60 + 45)
    expect(slotFromOffset(NaN, PX)).toBe(0)
    expect(slotFromOffset(100, 0)).toBe(0)
  })

  it('drops a grabbed block at the nearest slot, keeping the grab offset', () => {
    // Grabbed 6 px below its top; pointer at 14:30 + 6 px + 4 px → block starts at 14:30.
    expect(dropStart(14.5 * 48 + 10, 6, PX)).toBe(14 * 60 + 30)
    // 7 px past a slot rounds up to the next one.
    expect(dropStart(9 * 48 + 7, 0, PX)).toBe(9 * 60 + 15)
    expect(dropStart(-50, 0, PX)).toBe(0)
    expect(dropStart(30 * 48, 0, PX)).toBe(23 * 60 + 45)
  })

  it('resizes in whole slots: two rows down from a 30-minute block makes 60 minutes', () => {
    const start = 10 * 60
    const bottom = (start + 30) * PX
    expect(resizeEstimate(start, bottom + 2 * 12, PX)).toBe(60)
    expect(resizeEstimate(start, bottom + 2 * 12 + 5, PX)).toBe(60)
    expect(resizeEstimate(start, bottom - 12, PX)).toBe(15)
    // Never below one slot, even when dragged above the start.
    expect(resizeEstimate(start, 0, PX)).toBe(15)
    expect(resizeEstimate(start, 0, 0)).toBe(15)
  })
})

describe('keyboard steps', () => {
  it('changes the estimate by 15 minutes, never below 15', () => {
    expect(stepEstimate(30, 15)).toBe(45)
    expect(stepEstimate(30, -15)).toBe(15)
    expect(stepEstimate(15, -15)).toBe(15)
    expect(stepEstimate(null, 15)).toBe(45)
    expect(stepEstimate(null, -15)).toBe(15)
    // Off-grid estimates snap onto the grid in the direction of travel.
    expect(stepEstimate(20, 15)).toBe(30)
    expect(stepEstimate(20, -15)).toBe(15)
    expect(stepEstimate(10080, 15)).toBe(10080)
  })

  it('moves a timed due by slots and days', () => {
    const due = { date: '2026-10-13', time: '09:00' }
    expect(nudgeDue(due, { minutes: 15 })).toEqual({ date: '2026-10-13', time: '09:15' })
    expect(nudgeDue(nudgeDue(due, { minutes: 15 }), { minutes: 15 })).toEqual({ date: '2026-10-13', time: '09:30' })
    expect(nudgeDue(due, { minutes: -15 })).toEqual({ date: '2026-10-13', time: '08:45' })
    expect(nudgeDue(due, { days: 1 })).toEqual({ date: '2026-10-14', time: '09:00' })
    expect(nudgeDue(due, { days: -1 })).toEqual({ date: '2026-10-12', time: '09:00' })
    expect(nudgeDue({ date: '2026-10-31', time: '10:00' }, { days: 1 })).toEqual({ date: '2026-11-01', time: '10:00' })
  })

  it('clamps within the day instead of rolling over midnight', () => {
    expect(nudgeDue({ date: '2026-10-13', time: '00:00' }, { minutes: -15 })).toEqual({ date: '2026-10-13', time: '00:00' })
    expect(nudgeDue({ date: '2026-10-13', time: '23:45' }, { minutes: 15 })).toEqual({ date: '2026-10-13', time: '23:45' })
  })

  it('gives a date-only due a time only when moved in time', () => {
    expect(nudgeDue({ date: '2026-10-13' }, { days: 1 })).toEqual({ date: '2026-10-14' })
    expect(nudgeDue({ date: '2026-10-13' }, { minutes: 15, fallbackStart: 360 })).toEqual({ date: '2026-10-13', time: '06:00' })
  })
})

describe('blocks', () => {
  it('sizes a block by its estimate', () => {
    expect(blockFor(task({ due: { date: '2026-10-13', time: '14:30' }, estimate_minutes: 90 }))).toEqual({ id: 't', start: 870, end: 960, estimated: true })
  })

  it('draws an unestimated block as 30 minutes, flagged', () => {
    expect(blockFor(task({ due: { date: '2026-10-13', time: '10:00' } }))).toEqual({ id: 't', start: 600, end: 630, estimated: false })
  })

  it('has no block without a valid time, and stops at midnight', () => {
    expect(blockFor(task({ due: { date: '2026-10-13' } }))).toBeNull()
    expect(blockFor(task())).toBeNull()
    expect(blockFor(task({ due: { date: '2026-10-13', time: '25:00' } }))).toBeNull()
    expect(blockFor(task({ due: { date: '2026-10-13', time: '23:00' }, estimate_minutes: 120 }))?.end).toBe(1440)
  })

  it('selects open, live tasks in range outside archived projects', () => {
    const tasks = [
      task({ id: 'a', due: { date: '2026-10-13', time: '09:00' } }),
      task({ id: 'b', due: { date: '2026-10-13' } }),
      task({ id: 'c', due: { date: '2026-10-13' }, completed_at: 1 }),
      task({ id: 'd', due: { date: '2026-10-13' }, deleted_at: 1 }),
      task({ id: 'e', due: { date: '2026-10-20' } }),
      task({ id: 'f', due: { date: '2026-10-13' }, project_id: 'old' }),
      task({ id: 'g', due: { date: '2026-10-19' }, project_id: 'live' }),
      task({ id: 'h' }),
    ]
    const ids = calendarTasks(tasks, [{ id: 'old', archived: true }, { id: 'live', archived: false }], '2026-10-13', '2026-10-19').map((t) => t.id)
    expect(ids).toEqual(['a', 'b', 'g'])
  })
})

describe('capacity', () => {
  const day = '2026-10-13'
  it('sums timed and untimed open estimates and counts unestimated tasks', () => {
    const tasks = [
      task({ due: { date: day, time: '09:00' }, estimate_minutes: 240 }),
      task({ due: { date: day }, estimate_minutes: 300 }),
      task({ due: { date: day, time: '15:00' } }),
      task({ due: { date: day }, estimate_minutes: 60, completed_at: 5 }),
      task({ due: { date: '2026-10-14' }, estimate_minutes: 60 }),
    ]
    const load = dayLoad(tasks, day, 480)
    expect(load).toEqual({ planned: 540, unestimated: 1, over: true })
    expect(formatLoad(load, 480)).toBe('9h / 8h')
  })

  it('is not over at exactly the day length; a 6-hour day changes the verdict', () => {
    const tasks = [task({ due: { date: day }, estimate_minutes: 420 })]
    expect(dayLoad(tasks, day, 480).over).toBe(false)
    expect(dayLoad(tasks, day, 420).over).toBe(false)
    expect(dayLoad(tasks, day, 360).over).toBe(true)
    expect(formatLoad(dayLoad(tasks, day, 360), 360)).toBe('7h / 6h')
    expect(formatLoad(dayLoad([], day, 480), 480)).toBe('0m / 8h')
  })
})

describe('weeks and placement', () => {
  it('returns the Monday-started week', () => {
    expect(weekDates('2026-10-14')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
    expect(weekDates('2026-10-12')[0]).toBe('2026-10-12')
    expect(weekDates('2026-10-18')[0]).toBe('2026-10-12')
    expect(weekDates('2026-11-01')).toContain('2026-10-26')
  })

  it('starts the week on the preferred first day (date-time-preferences)', () => {
    expect(weekDates('2026-10-14', 0)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
    expect(weekDates('2026-10-11', 0)[0]).toBe('2026-10-11')
    expect(weekDates('2026-10-14', 6)[0]).toBe('2026-10-10')
    expect(weekDates('2026-10-14', 1)).toEqual(weekDates('2026-10-14'))
  })

  it('labels grid hours in the time format while stored times stay HH:MM', () => {
    const twelve = resolveDateTime({ date_format: 'system', time_format: '12h', week_start: 'system' })
    expect([9, 10, 12, 13].map((h) => formatHour(h, twelve))).toEqual(['9 AM', '10 AM', '12 PM', '1 PM'])
    expect(formatWallTime(formatTime(570), twelve)).toBe('9:30 AM')
    expect(formatTime(570)).toBe('09:30')
  })

  it('starts placement at the task time, then the next slot today, then the grid start', () => {
    const prefs = DEFAULT_GRID_PREFS
    expect(placementStart(task({ due: { date: '2026-10-13', time: '11:15' } }), '2026-10-13', '2026-10-13', 600, prefs)).toBe(675)
    expect(placementStart(task({ due: { date: '2026-10-13' } }), '2026-10-13', '2026-10-13', 9 * 60 + 7, prefs)).toBe(9 * 60 + 15)
    expect(placementStart(task(), '2026-10-13', '2026-10-13', 23 * 60, prefs)).toBe(360)
    expect(placementStart(task(), '2026-10-14', '2026-10-13', 600, prefs)).toBe(360)
  })
})

describe('grid preferences', () => {
  it('defaults to 06:00–22:00 and 8 hours', () => {
    expect(normalizeGridPrefs(undefined)).toEqual({ startHour: 6, endHour: 22, dayLength: 480 })
    expect(normalizeGridPrefs('junk')).toEqual(DEFAULT_GRID_PREFS)
  })

  it('keeps valid values and repairs invalid ones', () => {
    expect(normalizeGridPrefs({ startHour: 8, endHour: 18, dayLength: 360 })).toEqual({ startHour: 8, endHour: 18, dayLength: 360 })
    expect(normalizeGridPrefs({ startHour: 7.5, endHour: 30, dayLength: 0 })).toEqual(DEFAULT_GRID_PREFS)
    expect(normalizeGridPrefs({ startHour: 23 })).toEqual({ startHour: 23, endHour: 24, dayLength: 480 })
    expect(normalizeGridPrefs({ endHour: 4 })).toEqual({ startHour: 3, endHour: 4, dayLength: 480 })
    expect(normalizeGridPrefs({ startHour: 18, endHour: 9 })).toEqual(DEFAULT_GRID_PREFS)
  })
})

describe('calendar-feeds events on the grid (6.1)', () => {
  const ev = (id: string, start: CalendarEvent['start'], end: CalendarEvent['end'], allDay = false): CalendarEvent => ({ id, subscriptionId: 's', uid: id, summary: id, location: '', start, end, allDay, free: false })

  it('splits a 22:00 to 02:00 event over two days', () => {
    const late = [ev('late', { date: '2026-10-20', time: '22:00' }, { date: '2026-10-21', time: '02:00' })]
    expect(eventBlocks(late, '2026-10-20').map((b) => [b.start, b.end])).toEqual([[22 * 60, DAY_MINUTES]])
    expect(eventBlocks(late, '2026-10-21').map((b) => [b.start, b.end])).toEqual([[0, 120]])
    expect(eventBlocks(late, '2026-10-22')).toEqual([])
  })

  it('shows a UTC 08:00 event at 10:00 in Europe/Berlin, and floating ones as wall time', () => {
    const events = [ev('z', { date: '2026-07-01', time: '08:00', tz: 'UTC' }, { date: '2026-07-01', time: '09:00', tz: 'UTC' }), ev('f', { date: '2026-07-01', time: '08:00' }, { date: '2026-07-01', time: '08:30' })]
    const blocks = eventBlocks(events, '2026-07-01', 'Europe/Berlin')
    expect(blocks.find((b) => b.event.id === 'z')).toMatchObject({ start: 600, end: 660 })
    expect(blocks.find((b) => b.event.id === 'f')).toMatchObject({ start: 480, end: 510 })
  })

  it('does not put an event ending at midnight on the next day', () => {
    const e = [ev('m', { date: '2026-10-20', time: '23:00' }, { date: '2026-10-21', time: '00:00' })]
    expect(eventBlocks(e, '2026-10-21')).toEqual([])
    expect(eventBlocks(e, '2026-10-20')).toHaveLength(1)
  })

  it('puts a two-day all-day event on both days, with an exclusive end', () => {
    const trip = [ev('trip', { date: '2026-10-20' }, { date: '2026-10-22' }, true)]
    expect(allDayEvents(trip, '2026-10-19')).toEqual([])
    expect(allDayEvents(trip, '2026-10-20')).toHaveLength(1)
    expect(allDayEvents(trip, '2026-10-21')).toHaveLength(1)
    expect(allDayEvents(trip, '2026-10-22')).toEqual([])
    expect(eventBlocks(trip, '2026-10-20')).toEqual([])
  })
})
