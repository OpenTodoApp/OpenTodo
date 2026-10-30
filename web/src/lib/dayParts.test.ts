import { describe, expect, it } from 'vitest'
import { dayPartFields, dayPartOf, dayPartsOn, partOfTime, placedPart, DAY_PARTS } from './dayParts'

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
