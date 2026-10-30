// The closed list's preferences and Take a slot (OpenSpec change today-closed-list,
// tasks 1.2 and 3.3): reads never write, every write is one queued op (offline too).
import { beforeEach, describe, expect, it } from 'vitest'
import { fillSlots, readTodayLimit } from './closedList'
import { closedListOffered, doneTodayShown, giveBackSlot, setTodayLimit, takeSlot } from './closedListPrefs'
import { db, useDatabase } from './db'
import { resetDeviceId } from './ops'
import type { Review } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`closed-list-${Date.now()}-${n++}`)
  resetDeviceId()
})

const TODAY = '2026-10-30'
const review = (over: Partial<Review> = {}) => ({ id: 'me', focus_date: '', focus: '', slots_date: '', slots: '', ...over }) as Review
const queued = async (entity: string) => (await db.outbox.toArray()).filter((o) => o.entity === entity)

describe('reading the preferences', () => {
  it('reads 0, 40, 2.5 and "" as off, and never writes', async () => {
    for (const raw of [0, 40, 2.5, '', undefined, null]) expect(readTodayLimit(raw), String(raw)).toBe(0)
    expect(readTodayLimit(7)).toBe(7)
    expect(await db.outbox.count()).toBe(0)
  })

  it('Done today: the stored choice, else shown in the method modes and hidden in Simple lists', () => {
    expect(doneTodayShown({ method_mode: 'lists' })).toBe(false)
    expect(doneTodayShown({ method_mode: '' })).toBe(false)
    expect(doneTodayShown({ method_mode: 'companion' })).toBe(true)
    expect(doneTodayShown({ method_mode: 'first' })).toBe(true)
    expect(doneTodayShown({ method_mode: 'lists', today_done: 'shown' })).toBe(true)
    expect(doneTodayShown({ method_mode: 'first', today_done: 'hidden' })).toBe(false)
    expect(doneTodayShown({ method_mode: 'lists', today_done: 'later' })).toBe(false)
    expect(doneTodayShown(null)).toBe(false)
  })

  it("Today's menu offers the closed list in the method modes or once a limit is set", () => {
    expect(closedListOffered({ method_mode: 'lists' })).toBe(false)
    expect(closedListOffered({ method_mode: 'lists', today_limit: 5 })).toBe(true)
    expect(closedListOffered({ method_mode: 'lists', today_limit: 40 })).toBe(false)
    expect(closedListOffered({ method_mode: 'companion' })).toBe(true)
  })
})

describe('writing', () => {
  it('sets the limit as one op and refuses a value outside 0-20', async () => {
    await expect(setTodayLimit(25)).rejects.toThrow()
    await expect(setTodayLimit(2.5)).rejects.toThrow()
    expect(await queued('user_prefs')).toHaveLength(0)
    await setTodayLimit(5)
    expect((await db.userPrefs.get('me'))?.today_limit).toBe(5)
    expect((await queued('user_prefs')).map((o) => [o.field, o.value])).toEqual([['today_limit', 5]])
  })

  it('Take a slot records the id for the day, offline; a full Today writes nothing', async () => {
    const tasks = ['a', 'b', 'c'].map((id, i) => ({ id, created_at: i }))
    const fill = fillSlots({ tasks, limit: 2, today: TODAY })
    expect(await takeSlot(review(), TODAY, fill, 'c')).toBe('taken')
    const row = await db.review.get('me')
    expect([row?.slots_date, row?.slots]).toEqual([TODAY, 'c'])
    // Yesterday's list reads as empty: today's starts again.
    expect(await takeSlot(review({ slots_date: '2026-10-29', slots: 'b' }), TODAY, fill, 'c')).toBe('taken')
    expect((await db.review.get('me'))?.slots).toBe('c')

    const before = (await queued('review')).length
    const full = fillSlots({ tasks, limit: 2, today: TODAY, review: review({ focus_date: TODAY, focus: 'a,b' }) })
    expect(await takeSlot(review({ focus_date: TODAY, focus: 'a,b' }), TODAY, full, 'c')).toBe('full')
    expect(await queued('review')).toHaveLength(before)

    await giveBackSlot(review({ slots_date: TODAY, slots: 'c,b' }), TODAY, 'c')
    expect((await db.review.get('me'))?.slots).toBe('b')
  })
})
