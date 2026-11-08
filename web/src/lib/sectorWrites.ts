// One "when" at a time (OpenSpec change time-sectors, design D2), for writes from
// the app: choosing a sector clears the do-on date, the start and the evening in
// the same batch, and giving a sectored task a do-on date, a start date or Someday
// clears its sector in the same batch. Each batch writes the competing fields
// together, so concurrent edits converge on one of the two states, never a mix.
// The deadline, its reminders, the estimate and the labels are kept. REST, MCP
// and the CLI write exactly what is sent; this module is the app's rule only.
import { db } from './db'
import type { Task } from './types'

type Patchable = { entity: string; entityId: string; patch: Record<string, unknown> }

/** Whether a patch gives the task a do-on date, a start date or Someday. */
function dates(patch: Record<string, unknown>): boolean {
  return (patch.due !== undefined && patch.due !== null) || (typeof patch.start === 'string' && patch.start !== '')
}

/**
 * The batch with `sector: ''` added to every task change that dates a task holding
 * a sector and does not write the sector itself. Tasks without a sector get no op.
 */
export async function withSectorClears<C extends Patchable>(changes: C[]): Promise<C[]> {
  const ids = changes.filter((c) => c.entity === 'task' && !('sector' in c.patch) && dates(c.patch)).map((c) => c.entityId)
  if (!ids.length) return changes
  const rows = await db.tasks.bulkGet(ids)
  const sectored = new Set(rows.filter((r): r is Task => !!r?.sector).map((r) => r.id))
  if (!sectored.size) return changes
  return changes.map((c) => (c.entity === 'task' && sectored.has(c.entityId) && !('sector' in c.patch) && dates(c.patch) ? { ...c, patch: { ...c.patch, sector: '' } } : c))
}

/**
 * The patch of choosing `sector` for a task from the app (design D2): the sector,
 * and the do-on date, the start, the evening flag and the part of the day cleared.
 * Only fields that change are written; clearing (`''`) writes the sector alone.
 */
export function sectorPatch(task: Pick<Task, 'sector' | 'due' | 'start' | 'evening' | 'day_part'>, sector: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if ((task.sector ?? '') !== sector) patch.sector = sector
  if (!sector) return patch
  if (task.due) patch.due = null
  if (task.start) patch.start = null
  if (task.evening) patch.evening = false
  if (task.day_part) patch.day_part = null
  return patch
}
