// The one move-to-day rule of the calendar and Upcoming (OpenSpec change upcoming-drag-day, tasks 1.1–1.3).
import { describe, expect, it } from 'vitest'
import { dayMovePatch, upcomingMovePatch, upcomingStep } from './dayMove'
import type { Task } from './types'

const TODAY = '2026-11-05'
const task = (over: Partial<Task> = {}) => ({ due: null, start: null, span: false, deadline: null, completed_at: null, project_id: null, ...over }) as Task

describe('dayMovePatch (the calendar drop)', () => {
  it('moves the due date and keeps its time; a date-only due stays date-only', () => {
    expect(dayMovePatch(task({ due: { date: '2026-11-06', time: '09:30' } }), '2026-11-09')).toEqual({ due: { date: '2026-11-09', time: '09:30' } })
    expect(dayMovePatch(task({ due: { date: '2026-11-06' } }), '2026-11-09')).toEqual({ due: { date: '2026-11-09' } })
  })

  it('a zoned due keeps its zone and moves by the day the viewer sees', () => {
    // 10:00 in Tokyo is 01:00 in London (November, UTC+0): the viewer sees the 6th at 01:00.
    const patch = dayMovePatch(task({ due: { date: '2026-11-06', time: '10:00', tz: 'Asia/Tokyo' } }), '2026-11-08', { zone: 'Europe/London' })
    expect(patch).toEqual({ due: { date: '2026-11-08', time: '10:00', tz: 'Asia/Tokyo' } })
  })

  it('a task without a date gets a date-only due (the planning list)', () => {
    expect(dayMovePatch(task(), '2026-11-09')).toEqual({ due: { date: '2026-11-09' } })
  })

  it('the same day, or a completed task, changes nothing', () => {
    expect(dayMovePatch(task({ due: { date: '2026-11-06', time: '09:00' } }), '2026-11-06')).toBeNull()
    expect(dayMovePatch(task({ due: { date: '2026-11-06' }, completed_at: 1 }), '2026-11-09')).toBeNull()
  })

  it('a span shown from a day moves whole; without `from` only its due moves (Month)', () => {
    const span = task({ span: true, start: '2026-11-06', due: { date: '2026-11-08', time: '17:00' } })
    expect(dayMovePatch(span, '2026-11-10', { from: '2026-11-06' })).toEqual({ start: '2026-11-10', due: { date: '2026-11-12', time: '17:00' } })
    expect(dayMovePatch(span, '2026-11-06', { from: '2026-11-06' })).toBeNull()
    expect(dayMovePatch(span, '2026-11-10')).toEqual({ due: { date: '2026-11-10', time: '17:00' } })
  })

  it('a recurring task moves this occurrence: only its due changes, the rule stays', () => {
    expect(dayMovePatch(task({ due: { date: '2026-11-06', time: '08:00' }, recurrence: 'every week' } as Partial<Task>), '2026-11-07')).toEqual({ due: { date: '2026-11-07', time: '08:00' } })
  })
})

describe('upcomingMovePatch (what listed it there moves)', () => {
  it('a due task moves its due date', () => {
    expect(upcomingMovePatch(task({ due: { date: '2026-11-06', time: '14:00' }, deadline: '2026-11-20' }), '2026-11-07', TODAY)).toEqual({ due: { date: '2026-11-07', time: '14:00' } })
  })

  it('a task listed by its deadline moves its deadline and gets no due date', () => {
    expect(upcomingMovePatch(task({ deadline: '2026-11-10' }), '2026-11-12', TODAY)).toEqual({ deadline: '2026-11-12' })
  })

  it('a deferred task without a project or due moves its start', () => {
    expect(upcomingMovePatch(task({ start: '2026-11-08' }), '2026-11-09', TODAY)).toEqual({ start: '2026-11-09' })
  })

  it('a span moves whole from its first day', () => {
    const span = task({ span: true, start: '2026-11-07', due: { date: '2026-11-09' } })
    expect(upcomingMovePatch(span, '2026-11-08', TODAY)).toEqual({ start: '2026-11-08', due: { date: '2026-11-10' } })
  })

  it('a drop on its own day changes nothing', () => {
    expect(upcomingMovePatch(task({ deadline: '2026-11-10' }), '2026-11-10', TODAY)).toBeNull()
    expect(upcomingMovePatch(task({ due: { date: '2026-11-06' } }), '2026-11-06', TODAY)).toBeNull()
  })
})

describe('upcomingStep (Shift+← / Shift+→)', () => {
  it('steps one day, never before today; an earlier day steps from today', () => {
    expect(upcomingStep('2026-11-07', TODAY, 1)).toBe('2026-11-08')
    expect(upcomingStep('2026-11-07', TODAY, -1)).toBe('2026-11-06')
    expect(upcomingStep('2026-11-06', TODAY, -1)).toBe(TODAY)
    expect(upcomingStep(TODAY, TODAY, -1)).toBeNull()
    expect(upcomingStep('2026-11-01', TODAY, 1)).toBe('2026-11-06')
    expect(upcomingStep(null, TODAY, 1)).toBe('2026-11-06')
  })
})
