import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import vectors from './frames.vectors.json'
import { db, useDatabase } from './db'
import {
  clockMinutes, createFrame, fitInFrame, formatWeekdays, frameInputError, frameOccurrences, frameSource, frameTimesValid, layoutFrames,
  MAX_FRAMES, parseWeekdays, reorderFrames, sortedFrames, updateFrame, weekdaysLabel, weekOrder, type FrameInput,
} from './frames'
import { FRAME_DEFAULTS } from './ops'
import type { Frame } from './types'

const frame = (over: Partial<Frame>): Frame => ({ ...FRAME_DEFAULTS, id: 'f', _clock: {}, ...over } as Frame)

describe('frame occurrences (shared vectors with internal/frames)', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const got = frameOccurrences(c.frames.map((f) => frame(f as Partial<Frame>)), c.from, c.to)
      expect(got.map((o) => ({ id: o.frame.id, date: o.date, start: o.frame.start, end: o.frame.end }))).toEqual(c.occurrences)
    })
  }
})

describe('frame values', () => {
  it('reads clocks and weekday lists', () => {
    expect(clockMinutes('09:30')).toBe(570)
    expect(clockMinutes('9:5')).toBeNull()
    expect(clockMinutes('24:00')).toBeNull()
    expect(parseWeekdays('5,1,1,x,8')).toEqual([1, 5])
    expect(formatWeekdays([5, 1, 3, 3])).toBe('1,3,5')
    expect(frameTimesValid({ start: '12:00', end: '11:00' })).toBe(false)
  })

  it('names weekday lists in the week order', () => {
    expect(weekdaysLabel('1,2,3,4,5')).toBe('Mon–Fri')
    expect(weekdaysLabel('2,4')).toBe('Tue, Thu')
    expect(weekdaysLabel('1,2,3,4,5,6,7')).toBe('Every day')
    expect(weekdaysLabel('6,7', 1)).toBe('Sat, Sun')
    expect(weekdaysLabel('6,7,1', 6)).toBe('Sat–Mon')
    expect(weekOrder(0)).toEqual([7, 1, 2, 3, 4, 5, 6])
  })

  it('reads a planning source key', () => {
    expect(frameSource('label:deep')).toEqual({ kind: 'label', id: 'deep' })
    expect(frameSource('')).toBeNull()
    expect(frameSource('inbox')).toBeNull()
  })

  it('lays overlapping frames side by side', () => {
    const f = frame({})
    const placed = layoutFrames([{ frame: f, date: 'd', start: 960, end: 1020 }, { frame: f, date: 'd', start: 990, end: 1050 }, { frame: f, date: 'd', start: 1080, end: 1140 }])
    expect(placed.map((p) => [p.start, p.lane, p.lanes])).toEqual([[960, 0, 2], [990, 1, 2], [1080, 0, 1]])
  })

  it('finds the first free start inside a frame', () => {
    const occ = { start: 540, end: 660 }
    // A 09:00–09:30 task inside: a 45-minute task goes to 09:30.
    expect(fitInFrame(occ, [{ start: 540, end: 570 }], 45)).toBe(570)
    // Full: nothing fits.
    expect(fitInFrame(occ, [{ start: 540, end: 660 }], 60)).toBeNull()
    // Too long for the frame.
    expect(fitInFrame(occ, [], 150)).toBeNull()
    // Busy time outside the frame does not matter.
    expect(fitInFrame(occ, [{ start: 400, end: 540 }], 30)).toBe(540)
  })

  it('checks the form values', () => {
    const ok: FrameInput = { title: 'Deep work', weekdays: '1,2', start: '09:00', end: '11:00', color: '#64748b', source: '', from_date: null, until_date: null }
    expect(frameInputError(ok)).toBeNull()
    expect(frameInputError({ ...ok, title: ' ' })).toMatch(/title/)
    expect(frameInputError({ ...ok, weekdays: '' })).toMatch(/day/)
    expect(frameInputError({ ...ok, end: '08:00' })).toMatch(/after the start/)
    expect(frameInputError({ ...ok, from_date: '2026-11-10', until_date: '2026-11-01' })).toMatch(/last day/)
  })
})

describe('frame writes', () => {
  beforeEach(async () => {
    useDatabase(`frames-${Math.random()}`)
    await db.open()
  })
  const input: FrameInput = { title: ' Deep work ', weekdays: '5,1,2,3,4', start: '09:00', end: '11:00', color: '#64748b', source: 'label:deep', from_date: null, until_date: null }

  it('creates, edits and orders frames through ops', async () => {
    const id = await createFrame(input)
    const row = await db.frames.get(id)
    expect(row).toMatchObject({ title: 'Deep work', weekdays: '1,2,3,4,5', start: '09:00', end: '11:00', source: 'label:deep', deleted_at: null })
    expect(await db.outbox.count()).toBeGreaterThan(0)
    const before = await db.outbox.count()
    await updateFrame(id, { ...input, title: 'Deep work', end: '11:30' })
    // Only the changed field is written (title and weekdays were already stored cleaned).
    expect(await db.outbox.count()).toBe(before + 1)
    const second = await createFrame({ ...input, title: 'Admin' })
    await reorderFrames([second, id])
    expect(sortedFrames(await db.frames.toArray()).map((f) => f.title)).toEqual(['Admin', 'Deep work'])
  })

  it('refuses the 51st live frame and writes nothing', async () => {
    for (let i = 0; i < MAX_FRAMES; i++) await createFrame({ ...input, title: `F${i}` })
    const before = await db.outbox.count()
    await expect(createFrame({ ...input, title: 'One more' })).rejects.toThrow(/50 frames/)
    expect(await db.outbox.count()).toBe(before)
  })
})
