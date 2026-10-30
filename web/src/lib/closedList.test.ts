import { describe, expect, it } from 'vitest'
import vectors from './closedList.vectors.json'
import { fillSlots, giveBackSlotList, notBlocked, readTodayLimit, takeSlotList, takenSlots, type SlotTask } from './closedList'

type VTask = SlotTask & { available?: boolean }
type Vector = {
  name: string
  limit: unknown
  predicate?: 'flow' | 'none'
  review?: { focus_date?: string; focus?: string; slots_date?: string; slots?: string }
  tasks: VTask[]
  expect: { limit: number; slots: string[]; waiting: string[]; chosen: number }
  take?: { id: string; taken: string[] | 'full' }
}

const review = (r: Vector['review']) => ({ focus_date: '', focus: '', slots_date: '', slots: '', ...r })

describe('closed list fill (shared vectors with internal/closedlist)', () => {
  it('reads the stored limit', () => {
    for (const [raw, want] of vectors.limits as [unknown, number][]) expect(readTodayLimit(raw), String(raw)).toBe(want)
  })

  for (const v of vectors.cases as Vector[]) {
    it(v.name, () => {
      const available = v.predicate === 'flow' ? (t: SlotTask) => (t as VTask).available !== false : notBlocked
      const fill = fillSlots({ tasks: v.tasks, limit: v.limit, today: vectors.today, review: review(v.review) }, available)
      expect(fill).toEqual(v.expect)
      if (v.take) expect(takeSlotList(fill, takenSlots(review(v.review), vectors.today), v.take.id)).toEqual(v.take.taken)
    })
  }

  it('gives a slot back', () => {
    expect(giveBackSlotList(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('keeps at most twenty taken ids', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `t${String(i).padStart(2, '0')}`)
    const tasks = ids.map((id, i) => ({ id, created_at: i }))
    const fill = fillSlots({ tasks, limit: 20, today: vectors.today }, notBlocked)
    const taken = takeSlotList({ ...fill, chosen: 0 }, ids.slice(0, 20), 't24')
    expect(taken).not.toBe('full')
    expect((taken as string[]).length).toBe(20)
    expect((taken as string[]).at(-1)).toBe('t24')
  })
})
