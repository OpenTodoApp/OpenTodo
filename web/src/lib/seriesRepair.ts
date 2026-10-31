// After a sync pull (OpenSpec change series-exceptions, M5 and D12): a series a
// device moved before it saw another device's record can stand on an exception
// date; any device that may edit it moves it to the next free occurrence, the same
// value on every device (planRepair). A piece of a split lineage whose stored
// `until` disagrees with its derived end gets the derived one (series-split D3).
// And on an encrypted account the server writes the records and pieces it
// creates without content (a ciphertext is bound to its entity id): an unlocked
// device fills in the series' title and notes, encrypted for the new row by the
// ordinary write path.
import { db } from './db'
import { isEnabled } from './e2ee'
import { logicalToday } from './dates'
import { lineageRows } from './lineageRows'
import { mutateMany, type Change } from './ops'
import { isOccurrenceRecord } from './recurring'
import { planRepair } from './seriesPlan'
import { membershipMap, roleOf } from './sharing'
import type { Op, Task } from './types'

const openSeries = (t: Task | undefined): t is Task => !!t && !!t.recurrence && !t.completed_at && !t.deleted_at && !t.series_id

/** The series whose rows or records the pulled ops touched, and the series a touched piece continues. */
async function touchedSeries(ops: readonly Op[]): Promise<Task[]> {
  const ids = new Set(ops.filter((o) => o.entity === 'task').map((o) => o.entityId))
  if (ids.size === 0) return []
  const rows = (await db.tasks.bulkGet([...ids])).filter((t): t is Task => !!t)
  const seriesIds = new Set<string>()
  for (const t of rows) {
    if (t.recurrence) seriesIds.add(t.id)
    if (t.series_id) seriesIds.add(t.series_id)
    if (t.split_from) seriesIds.add(t.split_from.series)
  }
  return (await db.tasks.bulkGet([...seriesIds])).filter((t): t is Task => !!t && !!t.recurrence && !t.deleted_at)
}

/** A record or piece the server wrote without content gets its series' title and notes. */
function fill(row: Task, from: Task | undefined): Change | null {
  if (!from || row.deleted_at || row.title !== '' || from.title === '') return null
  return { entity: 'task', entityId: row.id, patch: { title: from.title, ...(row.description === '' && from.description ? { description: from.description } : {}) } }
}

/** The writes that repair and fill the series a pull touched (none for a viewer's). */
export async function seriesUpkeep(ops: readonly Op[], opts: { today?: string; now?: number; encrypted?: boolean } = {}): Promise<Change[]> {
  const touched = await touchedSeries(ops)
  if (touched.length === 0) return []
  const memberships = await membershipMap()
  const today = opts.today ?? logicalToday()
  const now = opts.now ?? Date.now()
  const encrypted = opts.encrypted ?? (await isEnabled())
  const out: Change[] = []
  const done = new Set<string>()
  for (const t of touched) {
    if (done.has(t.id)) continue
    const rows = await lineageRows(t.id)
    // Every open piece of the lineage (the touched series alone when it was never split).
    const pieces = rows.filter((r) => openSeries(r))
    if (openSeries(t) && !pieces.some((p) => p.id === t.id)) pieces.push(t)
    for (const s of pieces) {
      if (done.has(s.id)) continue
      done.add(s.id)
      if (roleOf(s.project_id, memberships) === 'viewer') continue
      out.push(...planRepair(s, rows, today, now))
      if (!encrypted) continue
      for (const r of rows) {
        if (r.series_id === s.id && isOccurrenceRecord(r)) {
          const c = fill(r, s)
          if (c) out.push(c)
        }
      }
      if (s.split_from) {
        const c = fill(s, rows.find((r) => r.id === s.split_from!.series))
        if (c) out.push(c)
      }
    }
  }
  return out
}

/** Repair and fill after a pull; the writes upload with the next round. */
export async function afterPullSeries(ops: readonly Op[]): Promise<void> {
  const changes = await seriesUpkeep(ops)
  if (changes.length) await mutateMany(changes)
}
