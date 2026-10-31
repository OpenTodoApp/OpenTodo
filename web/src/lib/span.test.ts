import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDateLocale } from './dates'
import { extendToSpanPatch, formatSpan, laneCount, moveSpanPatch, multiDayOnPatch, packSpans, resizeSpanPatch, spanClip, spanDay, spanOf } from './span'
import { calendarTasks, dayLoad } from './calendar'
import type { Task } from './types'

// OpenSpec change multi-day-tasks, design D1.
describe('spanOf', () => {
  it('reads a valid range', () => {
    expect(spanOf({ span: true, start: '2026-11-03', due: { date: '2026-11-05' } })).toEqual({ first: '2026-11-03', last: '2026-11-05', length: 3 })
  })
  it('keeps a due with a time: the span is still whole days', () => {
    expect(spanOf({ span: true, start: '2026-11-03', due: { date: '2026-11-05', time: '17:00' } })?.length).toBe(3)
  })
  it('ignores the flag without a valid range', () => {
    expect(spanOf({ span: true, start: 'someday', due: { date: '2026-11-05' } })).toBeNull()
    expect(spanOf({ span: true, start: '2026-11-05', due: { date: '2026-11-05' } })).toBeNull()
    expect(spanOf({ span: true, start: '2026-11-06', due: { date: '2026-11-05' } })).toBeNull()
    expect(spanOf({ span: true, start: '2026-11-03', due: null })).toBeNull()
    expect(spanOf({ span: true, start: null, due: { date: '2026-11-05' } })).toBeNull()
  })
  it('is null without the flag (a start before due stays a deferral)', () => {
    expect(spanOf({ span: false, start: '2026-11-02', due: { date: '2026-11-06' } })).toBeNull()
    expect(spanOf({ start: '2026-11-02', due: { date: '2026-11-06' } })).toBeNull()
  })
})

describe('span positions', () => {
  const span = { first: '2026-11-07', last: '2026-11-10', length: 4 }
  it('numbers the days', () => {
    expect(spanDay(span, '2026-11-07')).toBe(1)
    expect(spanDay(span, '2026-11-10')).toBe(4)
  })
  it('clips to a week row and says where it continues', () => {
    expect(spanClip(span, '2026-11-02', '2026-11-08')).toEqual({ first: '2026-11-07', last: '2026-11-08', startsBefore: false, endsAfter: true })
    expect(spanClip(span, '2026-11-09', '2026-11-15')).toEqual({ first: '2026-11-09', last: '2026-11-10', startsBefore: true, endsAfter: false })
    expect(spanClip(span, '2026-11-16', '2026-11-22')).toBeNull()
  })
})

describe('span patches (D2, D4)', () => {
  const trip = { span: true, start: '2026-11-03', due: { date: '2026-11-05', time: '17:00' } }
  it('moves start and due together, keeping the time', () => {
    expect(moveSpanPatch(trip, 1)).toEqual({ start: '2026-11-04', due: { date: '2026-11-06', time: '17:00' } })
  })
  it('moves one end, never past the other', () => {
    expect(resizeSpanPatch(trip, 'last', 1)).toEqual({ due: { date: '2026-11-06', time: '17:00' } })
    expect(resizeSpanPatch(trip, 'first', 2)).toEqual({ start: '2026-11-05' })
    expect(resizeSpanPatch(trip, 'first', 5)).toEqual({ start: '2026-11-05' })
    expect(resizeSpanPatch(trip, 'last', -9)).toEqual({ due: { date: '2026-11-03', time: '17:00' } })
    // A span shrunk to one day still grows again from its one day.
    expect(resizeSpanPatch({ span: true, start: '2026-11-05', due: { date: '2026-11-05' } }, 'last', 1)).toEqual({ due: { date: '2026-11-06' } })
  })
  it('extends a date-only task from its day', () => {
    expect(extendToSpanPatch({ due: { date: '2026-11-03' } }, '2026-11-04')).toEqual({ start: '2026-11-03', due: { date: '2026-11-04' }, span: true })
    expect(extendToSpanPatch({ due: { date: '2026-11-03', time: '09:00' } }, '2026-11-04')).toBeNull()
    expect(extendToSpanPatch({ due: { date: '2026-11-03' } }, '2026-11-03')).toBeNull()
  })
  it('turns Multi-day on with or without a start', () => {
    expect(multiDayOnPatch({ start: null, due: { date: '2026-11-05' } })).toEqual({ span: true, start: '2026-11-04' })
    expect(multiDayOnPatch({ start: '2026-11-03', due: { date: '2026-11-05' } })).toEqual({ span: true })
    expect(multiDayOnPatch({ start: 'someday', due: { date: '2026-11-05' } })).toEqual({ span: true, start: '2026-11-04' })
    expect(multiDayOnPatch({ start: '2026-11-07', due: { date: '2026-11-05' } })).toEqual({ span: true, start: '2026-11-04' })
  })
})

describe('formatSpan', () => {
  beforeEach(() => setDateLocale('en-GB'))
  afterEach(() => setDateLocale(undefined))
  it('reads "3–5 Nov"', () => {
    // ICU may pad the dash with (thin) spaces.
    expect(formatSpan({ first: '2026-11-03', last: '2026-11-05', length: 3 })).toMatch(/^3\s?–\s?5 Nov$/)
  })
})

describe('packSpans', () => {
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
  const item = (id: string, first: string, last: string) => ({ id, span: { first, last, length: 0 } })
  it('puts overlapping spans in separate lanes and reuses a lane once free', () => {
    const pieces = packSpans([item('a', '2026-11-03', '2026-11-05'), item('b', '2026-11-04', '2026-11-06'), item('c', '2026-11-06', '2026-11-12'), item('d', '2026-10-01', '2026-10-02')], days)
    expect(pieces.map((p) => [p.item.id, p.col, p.cols, p.lane, p.endsAfter])).toEqual([['a', 1, 3, 0, false], ['b', 2, 3, 1, false], ['c', 4, 3, 0, true]])
    expect(laneCount(pieces)).toBe(2)
  })
})

describe('capacity of a span (D3)', () => {
  it('an 8-hour span counts on its due day only, and is on screen while any of its days is', () => {
    const span = { id: 'x', title: 'Trip', start: '2026-11-03', due: { date: '2026-11-05' }, span: true, estimate_minutes: 480, completed_at: null, deleted_at: null, project_id: null } as unknown as Task
    expect(dayLoad([span], '2026-11-05', 480).tasks).toBe(480)
    expect(dayLoad([span], '2026-11-03', 480).tasks).toBe(0)
    expect(dayLoad([span], '2026-11-04', 480).tasks).toBe(0)
    expect(calendarTasks([span], [], '2026-11-02', '2026-11-04')).toHaveLength(1)
    expect(calendarTasks([{ ...span, span: false }], [], '2026-11-02', '2026-11-04')).toHaveLength(0)
  })
})
