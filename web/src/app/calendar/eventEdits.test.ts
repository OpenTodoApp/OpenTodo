import { describe, expect, it, vi } from 'vitest'

vi.mock('../bulk/toastStore', () => ({ showActionToast: vi.fn(), showBulkToast: vi.fn() }))

import { eventPointIn } from '../../lib/dates'
import type { CalendarEvent } from '../../lib/types'
import { eventChangeFor } from './eventActions'
import { eventGhost, eventKeyTarget, gridEvents, withEvents } from './eventGrid'
import { editorPatch } from './EventEditor'

const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1', subscriptionId: 's1', uid: 'u', summary: 'Standup', location: '', allDay: false, free: false, rev: 'r',
  start: { date: '2026-11-12', time: '09:00', tz: 'Europe/Berlin' }, end: { date: '2026-11-12', time: '09:30', tz: 'Europe/Berlin' },
  access: { update: true, delete: true }, ...o,
})

describe('eventPointIn (calendar-event-edits 4.3)', () => {
  it('keeps the event in its own zone: Lisbon 10:00 is Berlin 11:00', () => {
    expect(eventPointIn('Europe/Berlin', { date: '2026-11-12', time: '10:00' }, 'Europe/Lisbon')).toEqual({ date: '2026-11-12', time: '11:00', tz: 'Europe/Berlin' })
  })
  it('a zone behind the viewer can change the date', () => {
    expect(eventPointIn('America/New_York', { date: '2026-11-12', time: '01:00' }, 'Europe/Berlin')).toEqual({ date: '2026-11-11', time: '19:00', tz: 'America/New_York' })
  })
  it('across a DST change the offset of the event day applies', () => {
    // Berlin is still on summer time on 2026-10-24 while New York is too; on 2026-10-26 Berlin is on winter time.
    expect(eventPointIn('Europe/Berlin', { date: '2026-10-26', time: '09:00' }, 'America/New_York').time).toBe('14:00')
    expect(eventPointIn('Europe/Berlin', { date: '2026-10-24', time: '09:00' }, 'America/New_York').time).toBe('15:00')
  })
  it('a floating event stays floating at the wall time chosen', () => {
    expect(eventPointIn(undefined, { date: '2026-11-12', time: '10:00' }, 'Europe/Lisbon')).toEqual({ date: '2026-11-12', time: '10:00' })
  })
})

describe('drops and keys (calendar-event-edits 5.1, 5.2, 5.4)', () => {
  const place = { date: '2026-11-12', start: 9 * 60, end: 9 * 60 + 30 }

  it('a move keeps the length and the zone', () => {
    expect(eventChangeFor(ev(), { type: 'slot', date: '2026-11-13', start: 14 * 60 }, place, 'Europe/Berlin')).toEqual({
      start: { date: '2026-11-13', time: '14:00', tz: 'Europe/Berlin' }, end: { date: '2026-11-13', time: '14:30', tz: 'Europe/Berlin' }, allDay: false,
    })
  })
  it('resizing the lower edge keeps the start; the upper edge keeps the end', () => {
    expect(eventChangeFor(ev(), { type: 'resize', estimate: 120 }, place, 'Europe/Berlin')!.end).toEqual({ date: '2026-11-12', time: '11:00', tz: 'Europe/Berlin' })
    const up = eventChangeFor(ev(), { type: 'resize-start', date: '2026-11-12', start: 8 * 60, estimate: 90 }, place, 'Europe/Berlin')!
    expect([up.start!.time, up.end!.time]).toEqual(['08:00', '09:30'])
  })
  it('the lane makes it all-day; an all-day event dropped on the hours gets the viewer\'s zone', () => {
    expect(eventChangeFor(ev(), { type: 'lane', date: '2026-11-14' }, place)).toEqual({ start: { date: '2026-11-14' }, end: { date: '2026-11-15' }, allDay: true })
    const allDay = ev({ allDay: true, start: { date: '2026-11-12' }, end: { date: '2026-11-13' } })
    expect(eventChangeFor(allDay, { type: 'slot', date: '2026-11-12', start: 600 }, null, 'Europe/Lisbon')!.start).toEqual({ date: '2026-11-12', time: '10:00', tz: 'Europe/Lisbon' })
  })
  it('a floating event stays floating', () => {
    const floating = ev({ start: { date: '2026-11-12', time: '09:00' }, end: { date: '2026-11-12', time: '09:30' } })
    expect(eventChangeFor(floating, { type: 'slot', date: '2026-11-12', start: 600 }, place, 'Europe/Lisbon')!.start).toEqual({ date: '2026-11-12', time: '10:00' })
  })
  it('a drop into a slot is not a change, and a drop in place changes nothing', () => {
    expect(eventChangeFor(ev(), { type: 'into-slot', slotId: 'x' }, place)).toBeNull()
    expect(eventChangeFor(ev(), { type: 'slot', date: '2026-11-12', start: 540 }, place, 'Europe/Berlin')).toBeNull()
  })
  it('Down twice is 30 minutes later; the edges move by 15 minutes', () => {
    const g = { ev: ev(), place }
    const once = eventKeyTarget(g, 'nudge', 1)
    expect(once).toEqual({ type: 'slot', date: '2026-11-12', start: 555 })
    const twice = eventKeyTarget({ ev: g.ev, place: { ...place, start: 555, end: 585 } }, 'nudge', 1)
    expect(twice).toEqual({ type: 'slot', date: '2026-11-12', start: 570 })
    expect(eventKeyTarget(g, 'shift-day', -1)).toEqual({ type: 'slot', date: '2026-11-11', start: 540 })
    expect(eventKeyTarget(g, 'estimate', 1)).toEqual({ type: 'resize', estimate: 45 })
    expect(eventKeyTarget(g, 'estimate', -1)).toEqual({ type: 'resize', estimate: 15 })
    expect(eventKeyTarget(g, 'estimate-start', -1)).toEqual({ type: 'resize-start', date: '2026-11-12', start: 525, estimate: 45 })
  })
  it('only changeable events join the order, after the other items', () => {
    const locked = ev({ id: 'e2', access: { update: false, delete: false, reason: 'recurring' } })
    const day = { date: '2026-11-12', events: new Map([['event:e1', { id: 'event:e1', start: 540, end: 570, event: ev() }], ['event:e2', { id: 'event:e2', start: 600, end: 630, event: locked }]]) }
    const events = gridEvents([day as never])
    expect([...events.keys()]).toEqual(['event:e1'])
    expect(withEvents(['t1'], events)).toEqual(['t1', 'event:e1'])
    expect(eventGhost({ taskId: 'event:e1', kind: 'move', x: 0, y: 0, target: { type: 'slot', date: '2026-11-12', start: 600 } }, events, '2026-11-12')).toEqual({ id: 'drag-ghost', start: 600, length: 30, title: 'Standup' })
  })
})

describe('the popover editor (calendar-event-edits 5.3)', () => {
  it('Save makes the same change a drag makes', () => {
    const p = editorPatch(ev(), { title: 'Standup', date: '2026-11-12', start: '15:00', end: '15:30' }, 'Europe/Berlin')
    expect(p).toEqual(eventChangeFor(ev(), { type: 'slot', date: '2026-11-12', start: 15 * 60 }, { date: '2026-11-12', start: 540, end: 570 }, 'Europe/Berlin'))
  })
  it('a title alone, nothing changed, and an end before the start', () => {
    expect(editorPatch(ev(), { title: 'Planning', date: '2026-11-12', start: '09:00', end: '09:30' }, 'Europe/Berlin')).toEqual({ summary: 'Planning' })
    expect(editorPatch(ev(), { title: 'Standup', date: '2026-11-12', start: '09:00', end: '09:30' }, 'Europe/Berlin')).toBeNull()
    expect(editorPatch(ev(), { title: 'Standup', date: '2026-11-12', start: '10:00', end: '09:30' }, 'Europe/Berlin')).toBeNull()
  })
})
