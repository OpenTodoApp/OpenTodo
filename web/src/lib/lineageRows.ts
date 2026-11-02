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
 * The one scan of the tasks lineageRows reads, for several series at once:
 * every record and piece, and the series themselves. Pass it to lineageRows
 * for each of them (performance-10k: a pull touching many series scanned the
 * whole table once per series).
 */
export function lineageScan(seriesIds: Iterable<string>): Promise<Task[]> {
  const ids = new Set(seriesIds)
  return db.tasks.filter((tk) => tk.series_id != null || !!tk.split_from || ids.has(tk.id)).toArray()
}
