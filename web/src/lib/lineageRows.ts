// The local rows a series' planning reads (OpenSpec change series-split, M7): the
// pieces of its lineage and their occurrence records, or only the series' own
// records when it was never split. One scan of the tasks.
import { db } from './db'
import { lineageOf } from './lineage'
import type { Task } from './types'

export async function lineageRows(seriesId: string, scanned?: Task[]): Promise<Task[]> {
  const rows = scanned ?? await lineageScan([seriesId])
  const series = rows.find((tk) => tk.id === seriesId)
  if (!series || !rows.some((tk) => tk.split_from && !tk.deleted_at)) return rows.filter((tk) => tk.series_id === seriesId || tk.id === seriesId)
  const named = rows.flatMap((tk) => (tk.split_from ? [tk.split_from.series] : [])).filter((id) => !rows.some((tk) => tk.id === id))
  const roots = (await db.tasks.bulkGet([...new Set(named)])).filter((tk): tk is Task => !!tk)
  const ids = new Set(lineageOf(series, [...rows, ...roots]).map((p) => p.task.id))
  return [...rows, ...roots].filter((tk) => ids.has(tk.id) || (tk.series_id != null && ids.has(tk.series_id)))
}

/**
 * The rows lineageRows reads, for several series at once: the series themselves, every
 * piece of a split series, and the occurrence records of all of those. Read by index
 * (`series_id`, `split_from.series`), never the whole tasks table: completing a
 * repeating task in a 10,000-task account read every task (performance-10k; the native
 * app's budget, native-app-foundation). Pass the result to lineageRows for each series.
 */
export async function lineageScan(seriesIds: Iterable<string>): Promise<Task[]> {
  const ids = new Set(seriesIds)
  // Pieces are rare (a series changed "from this occurrence on"); any of them may belong
  // to an asked series' lineage, so the records of every piece and every root are read too.
  const pieces = await db.tasks.where('split_from.series').above('').toArray()
  const lineage = new Set(ids)
  for (const p of pieces) {
    lineage.add(p.id)
    if (p.split_from) lineage.add(p.split_from.series)
  }
  const [records, asked] = await Promise.all([db.tasks.where('series_id').anyOf([...lineage]).toArray(), db.tasks.bulkGet([...ids])])
  const rows = new Map<string, Task>()
  for (const tk of [...asked, ...pieces, ...records]) if (tk) rows.set(tk.id, tk)
  return [...rows.values()]
}
