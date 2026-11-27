// The sums of habits-board (task 1.1): the week across habits, a habit's last 30
// days and its weekdays.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { checkIn, setPastDay } from './habitActions'
import { recentKept, weekdayRates, weekProgress } from './habitDay'
import { habitRowsOf } from './habits'
import { createTask, getDeviceId, resetDeviceId, updateTask } from './ops'

let n = 0
beforeEach(async () => {
  useDatabase(`habit-day-${Date.now()}-${n++}`)
  resetDeviceId()
  await getDeviceId()
})

const TODAY = '2026-11-25' // a Wednesday
async function habit(rule: string, start: string): Promise<string> {
  const id = await createTask({ title: 'H', due: { date: start }, recurrence: rule })
  await updateTask(id, { habit: true })
  await checkIn(id, false, { today: start })
  await updateTask(id, { due: { date: TODAY } })
  return id
}

describe('habits-board sums', () => {
  it('counts the week across habits, a habit\'s last days and its weekdays', async () => {
    const read = await habit('every day', '2026-11-18') // the 18th kept
    for (const d of ['2026-11-19', '2026-11-20', '2026-11-22']) await setPastDay(read, d, 'done', 1, TODAY)
    await setPastDay(read, '2026-11-23', 'skipped', 1, TODAY)
    const run = await habit('every mon, wed, fri', '2026-11-16') // Monday kept
    await setPastDay(run, '2026-11-18', 'done', 1, TODAY)
    const all = await db.tasks.toArray()
    const rowsOf = habitRowsOf(all)
    const habits = all.filter((t) => t.habit && !t.series_id)
    const week = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']
    // Read: 19, 20, 22 kept; 21 and 24 missed; 23 skipped; today pending (due). Run: 20 missed, 23 missed, today pending.
    expect(weekProgress(habits, rowsOf, week, TODAY)).toEqual({ kept: 3, due: 9 })
    const r = habits.find((h) => h.id === read)!
    expect(recentKept(r, rowsOf(r), TODAY, 30)).toEqual({ kept: 4, of: 6 })
    const wd = weekdayRates(habits.find((h) => h.id === run)!, rowsOf(habits.find((h) => h.id === run)!), TODAY)
    expect(wd[1]).toEqual({ kept: 1, of: 2 }) // Mondays: the 16th kept, the 23rd missed
    expect(wd[3]).toEqual({ kept: 1, of: 1 }) // Wednesdays: the 18th kept (today pending is not counted)
    expect(wd[2]).toEqual({ kept: 0, of: 0 }) // Tuesdays: not scheduled
  })
})
