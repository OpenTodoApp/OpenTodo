import { describe, expect, it } from 'vitest'
import { dayPartFields, dayPartOf, dayPartsOn, doOnPatch, partOfTime, placedPart, DAY_PARTS, type DoOnChoice } from './dayParts'
import * as v10 from './testdata/dayParts-1.0'
import type { Task } from './types'

// OpenSpec change day-parts, D1–D3.
describe('day parts', () => {
  it('the pairing never writes evening with a day part', () => {
    for (const part of [...DAY_PARTS, null]) {
      const f = dayPartFields(part)
      expect(f.evening && f.day_part !== null).toBe(false)
      expect(dayPartOf(f)).toBe(part)
    }
  })
  it('an older client turning This Evening on over Morning reads as Evening, and off again as Morning', () => {
    expect(dayPartOf({ day_part: 'morning', evening: true })).toBe('evening')
    expect(dayPartOf({ day_part: 'morning', evening: false })).toBe('morning')
    expect(dayPartOf({ day_part: 'night', evening: false })).toBeNull()
  })
  it('places a task by its time only without a part: before 12:00, to 17:59, from 18:00', () => {
    expect([partOfTime('11:59'), partOfTime('12:00'), partOfTime('17:59'), partOfTime('18:00')]).toEqual(['morning', 'afternoon', 'afternoon', 'evening'])
    expect(placedPart({ due: { date: '2026-10-14', time: '20:00' }, day_part: 'morning' })).toBe('morning')
    expect(placedPart({ due: { date: '2026-10-14', time: '09:00' } })).toBe('morning')
    expect(placedPart({ due: { date: '2026-10-14' } })).toBeNull()
  })
  it('the preference reads as off unless "on"', () => {
    expect([dayPartsOn(null), dayPartsOn({ day_parts: '' }), dayPartsOn({ day_parts: 'yes' }), dayPartsOn({ day_parts: 'on' })]).toEqual([false, false, false, true])
  })
})

// OpenSpec change when-picker, D2: in the Do on row a part and a time are exclusive.
describe('doOnPatch', () => {
  const ZONE = 'Europe/Berlin'
  const timed: Pick<Task, 'due'> = { due: { date: '2026-11-10', time: '14:00' } }
  const zoned: Pick<Task, 'due'> = { due: { date: '2026-11-10', time: '14:00', tz: 'America/New_York' } }
  const dated: Pick<Task, 'due'> = { due: { date: '2026-11-10' } }

  it('a part writes its pairing and the date without the time', () => {
    expect(doOnPatch(timed, { part: 'morning' }, ZONE)).toEqual({ due: { date: '2026-11-10' }, day_part: 'morning', evening: false })
    expect(doOnPatch(timed, { part: 'evening' }, ZONE)).toEqual({ due: { date: '2026-11-10' }, day_part: null, evening: true })
  })
  it('a part drops a fixed zone with the time, keeping the day the viewer sees', () => {
    // 14:00 in New York is 20:00 the same day in Berlin.
    expect(doOnPatch(zoned, { part: 'afternoon' }, ZONE)).toEqual({ due: { date: '2026-11-10' }, day_part: 'afternoon', evening: false })
    const late: Pick<Task, 'due'> = { due: { date: '2026-11-10', time: '20:00', tz: 'America/New_York' } }
    expect(doOnPatch(late, { part: null }, ZONE)!.due).toEqual({ date: '2026-11-11' })
  })
  it('Any time writes the Any time pairing and removes the time', () => {
    expect(doOnPatch(timed, { part: null }, ZONE)).toEqual({ due: { date: '2026-11-10' }, day_part: null, evening: false })
  })
  it('a part on a date without a time writes only the pairing', () => {
    expect(doOnPatch(dated, { part: 'evening' }, ZONE)).toEqual({ day_part: null, evening: true })
  })
  it('a time writes the time with the Any time pairing, and keeps a fixed zone fixed', () => {
    expect(doOnPatch(dated, { time: '09:00' }, ZONE)).toEqual({ due: { date: '2026-11-10', time: '09:00' }, day_part: null, evening: false })
    expect(doOnPatch(zoned, { time: '21:00' }, ZONE)).toEqual({ due: { date: '2026-11-10', time: '15:00', tz: 'America/New_York' }, day_part: null, evening: false })
  })
  it('a typed date with a time writes both, also on an undated task', () => {
    expect(doOnPatch({ due: null }, { date: '2026-11-11', time: '15:00' }, ZONE)).toEqual({ due: { date: '2026-11-11', time: '15:00' }, day_part: null, evening: false })
  })
  it('only the row is exclusive: Shift+E and the other writers set the pairing alone and keep the time, and the part wins for placement', () => {
    expect(Object.keys(dayPartFields('evening')).sort()).toEqual(['day_part', 'evening'])
    expect(placedPart({ due: { date: '2026-11-10', time: '09:00' }, ...dayPartFields('evening') })).toBe('evening')
  })
  it('without a do date there is nothing to write', () => {
    expect(doOnPatch({ due: null }, { part: 'morning' }, ZONE)).toBeNull()
    expect(doOnPatch({ due: null }, { time: '09:00' }, ZONE)).toBeNull()
  })
  it('never writes evening with a day part, and a 1.0 client reads every write as the row meant it', () => {
    const choices: DoOnChoice[] = [{ part: null }, { part: 'morning' }, { part: 'afternoon' }, { part: 'evening' }, { time: '09:00' }, { time: '19:30' }]
    for (const before of [timed, zoned, dated]) {
      for (const choice of choices) {
        const after = { ...before, evening: true, day_part: 'morning', ...doOnPatch(before, choice, ZONE) } as Task
        expect(after.evening && after.day_part !== null).toBe(false)
        // What the 1.0 client (v1.0.0 dayParts.ts, frozen) reads: the part chosen, or none with the time.
        const want = 'part' in choice ? choice.part : null
        expect(v10.dayPartOf(after)).toBe(want)
        expect(!!after.due?.time).toBe('time' in choice)
        if ('time' in choice) expect(v10.placedPart({ ...after, due: { date: after.due!.date, time: choice.time } })).toBe(partOfTime(choice.time))
      }
    }
  })
})
