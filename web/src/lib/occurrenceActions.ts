// Acting on one occurrence of a repeating task from the app (OpenSpec change
// series-exceptions, design D4, D5): complete, skip, move or edit one occurrence
// alone, as one undoable batch written locally first, so it works offline. The
// planning is planActOn in recurring.ts. An Undo never trashes the record: it
// writes back the untouched open occurrence on its date (D3), so the date stays an
// exception and a later action on it is never lost to a purge.
import type { ProposedChange } from './assistantTypes'
import { completeUndoable, type UndoableResult } from './undoActions'
import { db } from './db'
import { lineageRows } from './lineageRows'
import { dueFromView, logicalToday } from './dates'
import { getDeviceId, mutateMany, type Change } from './ops'
import { planActOn, type OccurrenceAction } from './seriesPlan'
import type { Due, Task } from './types'
import { applyBatch } from './undo'
import { t } from './i18n'

export interface OccurrenceResult extends UndoableResult {
  /** The record written (or the series' id when the action completed the series). */
  recordId: string | null
}

function labelOf(action: OccurrenceAction, habit: boolean): string {
  switch (action.kind) {
    case 'complete': return t('Occurrence completed')
    case 'skip': return habit ? t('Day skipped') : t('Occurrence skipped')
    case 'move': return t('Occurrence moved')
    default: return t('Occurrence changed')
  }
}

async function plan(seriesId: string, date: string | null, action: OccurrenceAction, now: number, today: string) {
  const series = await db.tasks.get(seriesId)
  if (!series) return null
  const records = await lineageRows(seriesId)
  const reminders = await db.reminders.where('task_id').equals(seriesId).toArray()
  const p = planActOn(series, date, action, records, now, today, reminders)
  return p ? { series, p } : null
}

/**
 * Act on the occurrence of `date` (the current one when null) with an Undo
 * offer. Returns null when the date cannot be acted on (not an occurrence, a
 * completion-relative series, no next occurrence to move the series to).
 */
export async function actOnOccurrenceUndoable(
  seriesId: string, date: string | null, action: OccurrenceAction, opts: { now?: number; today?: string } = {},
): Promise<OccurrenceResult | null> {
  const now = opts.now ?? Date.now()
  const today = opts.today ?? logicalToday()
  await getDeviceId()
  const planned = await plan(seriesId, date, action, now, today)
  if (!planned) return null
  const { series, p } = planned
  // The last occurrence: the series completes like a plain task.
  if (p.end) return { ...(await completeUndoable(seriesId, true, { now, today })), recordId: seriesId }
  const proposed: ProposedChange[] = []
  for (const c of p.changes) {
    if (c.entity === 'reminder') {
      proposed.push({ entity: c.entity, entityId: c.entityId, patch: c.patch, create: true })
      continue
    }
    const local = (await db.tasks.get(c.entityId)) as unknown as Record<string, unknown> | undefined
    const from = local ?? (c.entityId === p.recordId ? p.base : undefined)
    const base = from ? Object.fromEntries(Object.keys(c.patch).map((f) => [f, from[f] ?? null])) : undefined
    proposed.push({ entity: c.entity, entityId: c.entityId, patch: c.patch, ...(base ? { base } : { create: true }) })
  }
  const label = labelOf(action, !!series.habit)
  const entry = await applyBatch(proposed, { source: 'action', label })
  return { entry, label, recordId: p.recordId }
}

/** The same without an Undo offer (keyboard and panel edits that save per field). */
export async function actOnOccurrence(seriesId: string, date: string | null, action: OccurrenceAction, opts: { now?: number; today?: string } = {}): Promise<string | null> {
  const now = opts.now ?? Date.now()
  const planned = await plan(seriesId, date, action, now, opts.today ?? logicalToday())
  if (!planned) return null
  await getDeviceId()
  if (planned.p.end) return null
  await mutateMany(planned.p.changes as Change[])
  return planned.p.recordId
}

/**
 * Move one occurrence to a day (and time) read in the viewer's zone, like any drop
 * (absolute-datetimes): at the series' time unless `time` names one (null: no time).
 */
export async function moveOccurrenceFromView(seriesId: string, occurrence: string, date: string, time?: string | null): Promise<OccurrenceResult | null> {
  const series = await db.tasks.get(seriesId)
  if (!series?.due) return null
  const viewed = time === undefined ? (series.due.time ? { date, time: series.due.time } : { date }) : time ? { date, time } : { date }
  return actOnOccurrenceUndoable(seriesId, occurrence, { kind: 'move', due: dueFromView(series.due, viewed) as Due })
}

/** The series of an occurrence record, when it is still an open series. */
export async function seriesOf(task: Pick<Task, 'series_id'>): Promise<Task | null> {
  if (!task.series_id) return null
  const s = await db.tasks.get(task.series_id)
  return s && s.recurrence && !s.completed_at && !s.deleted_at ? s : null
}
