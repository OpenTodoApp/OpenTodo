// After a sync pull (OpenSpec change series-exceptions, M5 and D12): a series a
// device moved before it saw another device's record can stand on an exception
// date; any device that may edit it moves it to the next free occurrence, the same
// value on every device (planRepair). And on an encrypted account the server
// writes the records it creates without content (a ciphertext is bound to its
// entity id): an unlocked device fills in the series' title and notes, encrypted
// for the record by the ordinary write path.
import { db } from './db'
import { isEnabled } from './e2ee'
import { logicalToday } from './dates'
import { mutateMany, type Change } from './ops'
import { isOccurrenceRecord } from './recurring'
import { planRepair } from './seriesPlan'
import { membershipMap, roleOf } from './sharing'
import type { Op, Task } from './types'

/** The series whose rows or records the pulled ops touched. */
async function touchedSeries(ops: readonly Op[]): Promise<Task[]> {
  const ids = new Set(ops.filter((o) => o.entity === 'task').map((o) => o.entityId))
  if (ids.size === 0) return []
  const rows = (await db.tasks.bulkGet([...ids])).filter((t): t is Task => !!t)
  const seriesIds = new Set<string>()
  for (const t of rows) {
    if (t.recurrence) seriesIds.add(t.id)
    if (t.series_id) seriesIds.add(t.series_id)
  }
  return (await db.tasks.bulkGet([...seriesIds])).filter((t): t is Task => !!t && !!t.recurrence && !t.completed_at && !t.deleted_at)
}

/** The writes that repair and fill the series a pull touched (none for a viewer's). */
export async function seriesUpkeep(ops: readonly Op[], opts: { today?: string; now?: number; encrypted?: boolean } = {}): Promise<Change[]> {
  const series = await touchedSeries(ops)
  if (series.length === 0) return []
  const memberships = await membershipMap()
  const today = opts.today ?? logicalToday()
  const now = opts.now ?? Date.now()
  const encrypted = opts.encrypted ?? (await isEnabled())
  const out: Change[] = []
  for (const s of series) {
    if (roleOf(s.project_id, memberships) === 'viewer') continue
    const records = await db.tasks.filter((t) => t.series_id === s.id).toArray()
    out.push(...planRepair(s, records, today, now))
    if (!encrypted) continue
    for (const r of records) {
      if (r.deleted_at || !isOccurrenceRecord(r) || r.title !== '' || s.title === '') continue
      out.push({ entity: 'task', entityId: r.id, patch: { title: s.title, ...(r.description === '' && s.description ? { description: s.description } : {}) } })
    }
  }
  return out
}

/** Repair and fill after a pull; the writes upload with the next round. */
export async function afterPullSeries(ops: readonly Op[]): Promise<void> {
  const changes = await seriesUpkeep(ops)
  if (changes.length) await mutateMany(changes)
}
