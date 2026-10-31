// "This and following" and "Delete this and following" from the app (OpenSpec
// change series-split, design D1, D6): one undoable batch written locally first,
// so it works offline. The planning is seriesSplit.ts; loaded with the panel's
// scope control and the projection menu.
import type { ProposedChange } from './assistantTypes'
import { db, type AssistantUndo } from './db'
import { formatDate, logicalToday } from './dates'
import { t } from './i18n'
import { lineageRows } from './lineageRows'
import { getDeviceId, type Change } from './ops'
import { planEndFrom, planSplit } from './seriesSplit'
import type { Task } from './types'
import { applyBatch } from './undo'

export interface SplitResult {
  /** The series the panel shows next: the piece, or the series itself when it only ended. */
  id: string
  entry: AssistantUndo | null
  label: string
}

/** Proposals with the local values an Undo writes back (a new row is removed). */
export async function propose(changes: Change[]): Promise<ProposedChange[]> {
  const out: ProposedChange[] = []
  for (const c of changes) {
    const local = c.entity === 'task' ? ((await db.tasks.get(c.entityId)) as unknown as Record<string, unknown> | undefined) : undefined
    if (!local || local.deleted_at) {
      out.push({ entity: c.entity, entityId: c.entityId, patch: c.patch, create: true })
      continue
    }
    out.push({ entity: c.entity, entityId: c.entityId, patch: c.patch, base: Object.fromEntries(Object.keys(c.patch).map((f) => [f, local[f] ?? null])) })
  }
  return out
}

async function rows(seriesId: string): Promise<{ series: Task; tasks: Task[] } | null> {
  const series = await db.tasks.get(seriesId)
  return series ? { series, tasks: await lineageRows(seriesId) } : null
}

/**
 * Change the series from the occurrence of `date` on with `patch`, as one batch
 * with an Undo; a patch that clears the rule ends the series there instead.
 * Null when the series cannot be split there (the current occurrence, not an
 * occurrence, a completion-relative rule).
 */
export async function splitFromOccurrence(seriesId: string, date: string, patch: Record<string, unknown>, opts: { now?: number; today?: string } = {}): Promise<SplitResult | null> {
  if ('recurrence' in patch && !patch.recurrence) return endFromOccurrence(seriesId, date, opts)
  const now = opts.now ?? Date.now()
  const today = opts.today ?? logicalToday()
  await getDeviceId()
  const r = await rows(seriesId)
  if (!r) return null
  const reminders = await db.reminders.where('task_id').equals(seriesId).toArray()
  const plan = planSplit(r.series, date, patch, r.tasks, now, today, reminders)
  if (!plan) return null
  const label = t('Changed from {date} on', { date: formatDate(date, 'full') })
  const entry = await applyBatch(await propose(plan.changes), { source: 'action', label })
  return { id: plan.pieceId, entry, label }
}

/** "Delete this and following": the series ends the day before `date`, with an Undo. */
export async function endFromOccurrence(seriesId: string, date: string, opts: { today?: string } = {}): Promise<SplitResult | null> {
  await getDeviceId()
  const r = await rows(seriesId)
  if (!r) return null
  const changes = planEndFrom(r.series, date, r.tasks, opts.today ?? logicalToday())
  if (!changes) return null
  const label = t('Deleted from {date} on', { date: formatDate(date, 'full') })
  const entry = await applyBatch(await propose(changes), { source: 'action', label })
  return { id: seriesId, entry, label }
}
