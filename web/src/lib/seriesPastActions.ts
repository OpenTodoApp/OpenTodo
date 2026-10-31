// "Also past ones" from the app (OpenSpec change series-all-scope, design D3, D4):
// an All-occurrences edit of a series the panel chose it for is written as one
// undoable batch with what it adds to the past (seriesPast.ts), locally first so
// it works offline. Loaded on the first such edit.
import { db } from './db'
import { t } from './i18n'
import { lineageRows } from './lineageRows'
import { getDeviceId, mutateMany, type Change } from './ops'
import { planPast } from './seriesPast'
import { propose } from './seriesSplitActions'
import type { Task } from './types'
import { applyBatch } from './undo'

/** One change per row: the past writes join the edit's own. */
function joined(edit: Change[], past: Change[]): Change[] {
  const out = edit.map((c) => ({ ...c, patch: { ...c.patch } }))
  for (const p of past) {
    const had = out.find((c) => c.entity === p.entity && c.entityId === p.entityId)
    // The edit's own value wins on a row both write (a carried open record).
    if (had) had.patch = { ...p.patch, ...had.patch }
    else out.push(p)
  }
  return out
}

/**
 * Write the edit `changes` of `series` (with `patch`) together with what it adds
 * to the past, as one batch with an Undo, and report the undo entry. False when
 * the edit reaches nothing past: the caller writes it as an ordinary edit.
 */
export async function commitWithPast(series: Task, patch: Record<string, unknown>, changes: Change[], committed: (label: string, entryId: string) => void): Promise<boolean> {
  const past = planPast(series, patch, await lineageRows(series.id))
  if (!past.length) return false
  await getDeviceId()
  const label = t('Changed past occurrences too')
  const entry = await applyBatch(await propose(joined(changes, past)), { source: 'action', label })
  if (entry) committed(label, entry.id)
  return true
}

/**
 * A note saved on a series under Also past ones (D3): the past records and
 * earlier pieces that held the series' previous text take the new one. `before`
 * is the series as it was before the save.
 */
export async function carryNotePast(before: Task): Promise<void> {
  const after = await db.tasks.get(before.id)
  if (!after || after.description === before.description) return
  const past = planPast(before, { description: after.description }, await lineageRows(before.id))
  if (past.length) await mutateMany(past)
}
