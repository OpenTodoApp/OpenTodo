// Setting and ending an away period from the app (OpenSpec change away-periods,
// design D1, D3, D4): the stored period and its skips as one undoable batch,
// written on the device first, so it works offline. Loaded with the Away dialog.
import type { ProposedChange } from './assistantTypes'
import { formatAway } from './away'
import { planAway, type AwayPlan, type AwayScope } from './awayPlan'
import { logicalToday } from './dates'
import { db, type AssistantUndo } from './db'
import { t } from './i18n'
import { lineageRows, lineageScan } from './lineageRows'
import { getDeviceId, mutate } from './ops'
import { canEditTask, currentUserId, membershipMap } from './sharing'
import type { Task } from './types'
import { applyBatch } from './undo'
import { USER_PREFS_ID } from './userPrefs'

export interface AwayInput {
  from: string
  to: string
  scope: AwayScope
  quiet: boolean
}

/** The plan of an away period from the local rows (the preview reads its counts). */
export async function planAwayLocal(input: AwayInput, opts: { now?: number; today?: string } = {}): Promise<AwayPlan> {
  const now = opts.now ?? Date.now()
  const today = opts.today ?? logicalToday()
  const series = await db.tasks.filter((tk) => !!tk.recurrence && !tk.completed_at && !tk.deleted_at && !tk.series_id).toArray()
  const memberships = await membershipMap()
  const scanned = await lineageScan(series.map((s) => s.id))
  const rows = new Map<string, Task[]>()
  for (const s of series) rows.set(s.id, await lineageRows(s.id, scanned))
  // Other people's work stays out (covers): a project with members is shared.
  const whose = { me: await currentUserId(), shared: (projectId: string) => memberships.has(projectId) }
  return planAway(series, input.scope, input.from, input.to, (id) => rows.get(id) ?? [], (tk) => canEditTask(tk, memberships), now, today, whose)
}

export interface AwayResult {
  entry: AssistantUndo | null
  label: string
  plan: AwayPlan
}

/** Stores the period and applies its skips in one batch with one Undo (D1, D3). */
export async function setAway(input: AwayInput, opts: { now?: number; today?: string } = {}): Promise<AwayResult> {
  await getDeviceId()
  const plan = await planAwayLocal(input, opts)
  const proposed: ProposedChange[] = []
  for (const c of plan.changes) {
    const local = (await db.tasks.get(c.entityId)) as unknown as Record<string, unknown> | undefined
    // A new record's Undo writes back the untouched open occurrence, never the Trash,
    // as for one occurrence (series-exceptions D3).
    const from = local ?? { ...c.patch, completed_at: null, skipped: false }
    proposed.push({ entity: c.entity, entityId: c.entityId, patch: c.patch, base: Object.fromEntries(Object.keys(c.patch).map((f) => [f, from[f] ?? null])) })
  }
  const prefs = await db.userPrefs.get(USER_PREFS_ID)
  proposed.push({ entity: 'user_prefs', entityId: USER_PREFS_ID, patch: { away: formatAway(input) }, base: { away: prefs?.away ?? '' } })
  const label = t('Away set')
  const entry = await applyBatch(proposed, { source: 'action', label })
  return { entry, label, plan }
}

/** Ends the period now (D4): clears the stored value; the skips stay. */
export function endAway(): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { away: '' })
}
