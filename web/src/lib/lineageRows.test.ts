// The rows a series' planning reads come by index (db.ts v31: `series_id`,
// `split_from.series`), never from a scan of every task: completing a repeating task in
// a large account read the whole tasks table (performance-10k; the native app's budget,
// native-app-foundation 5.4).
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { lineageRows, lineageScan } from './lineageRows'
import { completeTask, createTask, getDeviceId, resetDeviceId, skipOccurrence } from './ops'
import type { Task } from './types'

let n = 0
beforeEach(async () => {
  useDatabase(`lineage-rows-${Date.now()}-${n++}`)
  resetDeviceId()
  await getDeviceId()
  await db.meta.put({ key: 'userId', value: 'u-ana' })
})

const TODAY = '2026-11-13'
const NOW = Date.parse(`${TODAY}T10:00:00Z`)

/** The rows the scan of every task chose, which the indexed read must still choose. */
async function byScan(seriesIds: string[]): Promise<Task[]> {
  const ids = new Set(seriesIds)
  return db.tasks.filter((tk) => ids.has(tk.id) || (tk.series_id != null && ids.has(tk.series_id)) || !!tk.split_from).toArray()
}

async function countingReads<T>(fn: () => Promise<T>): Promise<{ value: T; reads: number }> {
  let reads = 0
  const count = (row: unknown) => { reads++; return row }
  db.tasks.hook('reading', count)
  try {
    return { value: await fn(), reads }
  } finally {
    db.tasks.hook('reading').unsubscribe(count)
  }
}

const sorted = (rows: Task[]) => rows.map((t) => t.id).sort()

describe('lineageRows', () => {
  it('completing and skipping a repeating task read a handful of rows among many tasks', async () => {
    for (let i = 0; i < 300; i++) await createTask({ title: `Task ${i}` })
    const daily = await createTask({ title: 'Water the plants', due: { date: TODAY }, recurrence: 'every day' })
    const weekly = await createTask({ title: 'Review', due: { date: TODAY }, recurrence: 'every week' })

    const done = await countingReads(() => completeTask(daily, { now: NOW, today: TODAY }))
    expect(done.value).not.toBeNull()
    expect((await db.tasks.get(daily))?.due?.date).toBe('2026-11-14')
    expect(done.reads).toBeLessThan(30)

    const again = await countingReads(() => completeTask(daily, { now: NOW + 1, today: TODAY }))
    expect((await db.tasks.get(daily))?.due?.date).toBe('2026-11-15')
    expect(again.reads).toBeLessThan(30)

    const skipped = await countingReads(() => skipOccurrence(weekly, { now: NOW, today: TODAY }))
    expect(skipped.value).toBe(true)
    expect(skipped.reads).toBeLessThan(30)
  })

  it('reads the same rows as a scan of every task: the series, its records, the pieces and theirs', async () => {
    const plain = await createTask({ title: 'Plain' })
    const root = await createTask({ title: 'Root', due: { date: '2026-11-01' }, recurrence: 'every day' })
    const other = await createTask({ title: 'Other series', due: { date: TODAY }, recurrence: 'every day' })
    await completeTask(root, { now: NOW, today: '2026-11-01' })
    await completeTask(other, { now: NOW, today: TODAY })
    const piece = await createTask({ title: 'Piece', due: { date: '2026-11-10' }, recurrence: 'every week' })
    await db.tasks.update(piece, { split_from: { series: root, date: '2026-11-10' } })
    await completeTask(piece, { now: NOW, today: '2026-11-10' })

    for (const ids of [[root], [piece], [other], [root, other], [plain]]) {
      const want = await byScan(ids)
      // The scan also kept other series' records out; the indexed read may add the
      // records of a piece's lineage, which lineageRows then filters.
      const got = await lineageScan(ids)
      for (const id of sorted(want)) expect(sorted(got)).toContain(id)
    }
    // A piece's lineage: the root, the piece and both their records, nothing of the other series.
    const rows = await lineageRows(piece)
    expect(rows.map((t) => t.title).sort()).toEqual(['Piece', 'Piece', 'Root', 'Root'])
    expect(sorted(await lineageRows(root))).toEqual(sorted(rows))
    expect((await lineageRows(other)).map((t) => t.title)).toEqual(['Other series', 'Other series'])
    expect((await lineageRows(plain)).map((t) => t.title)).toEqual(['Plain'])
  })
})
