// Free time (assistant-time-blocks D1): the shared vectors with internal/freetime.
import { describe, expect, it } from 'vitest'
import vectors from './freeTime.vectors.json'
import { freeTime, MAX_FREE_DAYS, type FreeTimeInput } from './freeTime'

describe('free time (shared vectors with internal/freetime)', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      expect(freeTime(c.input as unknown as FreeTimeInput)).toEqual(c.days)
    })
  }
})

describe('free time range', () => {
  const empty = { zone: 'UTC', day_start: 0, day_end: 60, min_minutes: 1, events: [], frames: [], slots: [], tasks: [] }
  it('refuses a range out of order or longer than the limit', () => {
    expect(() => freeTime({ ...empty, from: '2026-10-15', to: '2026-10-14' })).toThrow(RangeError)
    expect(() => freeTime({ ...empty, from: '2026-10-01', to: '2026-10-15' })).toThrow(RangeError)
    expect(freeTime({ ...empty, from: '2026-10-01', to: '2026-10-14' })).toHaveLength(MAX_FREE_DAYS)
  })
})
