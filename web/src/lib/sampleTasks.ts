// The start guide's sample tasks (OpenSpec change moments-and-onboarding, design D2-D4;
// first-run "Sample tasks"): three Inbox tasks that each teach one thing, created as
// ordinary ops marked with the additive `sample` field, so they sync, edit, complete
// and trash like any task but never count in Statistics, the Loop pulse or the digest.
// "Remove sample tasks" trashes every task still marked, open or completed, as one
// undoable batch. The offer is made once per account: while the guide is unfinished
// and no sample task was ever created (a trashed one still counts, and syncs).
import { useLiveQuery } from 'dexie-react-hooks'
import { planTrash, toProposed } from './bulk'
import { logicalToday } from './dates'
import { db } from './db'
import { useLiveTasks } from './liveTasks'
import { getDeviceId, mutateMany, planTask, type Change } from './ops'
import { perList } from './taskDelta'
import type { Task } from './types'
import { applyBatch } from './undo'
import { msg, t } from './i18n'

/** Whether a task is one of the start guide's samples; rows stored before the field read as false. */
export const isSample = (task: Pick<Task, 'sample'>): boolean => task.sample === true

// The titles stay within 50 characters and the note within 200 in every catalog (i18n test).
export const SAMPLE_TITLES = [
  msg('Tick me off when you have read this'),
  msg('Plan today: due at 10:00, takes 15 minutes'),
  msg('Open me: I have a subtask'),
] as const
export const SAMPLE_SUBTASK = msg('Subtasks tick off on their own row')
export const SAMPLE_NOTE = msg('Click a task to open its panel. The + button adds tasks, projects and more. Made a mistake? Undo is in the toast and Ctrl+Z.')

/**
 * Creates the three sample tasks (and the third's subtask) in the Inbox as ONE batch,
 * each marked `sample`. No label, project or other entity is created. Returns the ids.
 */
export async function createSampleTasks(today = logicalToday()): Promise<string[]> {
  const inputs = [
    { title: t(SAMPLE_TITLES[0]), description: t(SAMPLE_NOTE) },
    { title: t(SAMPLE_TITLES[1]), due: { date: today, time: '10:00' }, estimate_minutes: 15 },
    { title: t(SAMPLE_TITLES[2]) },
  ]
  const changes: Change[] = []
  const ids: string[] = []
  for (const [i, input] of inputs.entries()) {
    const { id, change } = await planTask(input)
    // planTask reads the next position once; keep the three in their teaching order.
    const patch = change.patch as { position: number }
    changes.push({ ...change, patch: { ...change.patch, position: patch.position + i, sample: true, estimate_minutes: input.estimate_minutes ?? null } })
    ids.push(id)
  }
  const sub = await planTask({ title: t(SAMPLE_SUBTASK), parent_id: ids[2] })
  changes.push({ ...sub.change, patch: { ...sub.change.patch, sample: true } })
  await mutateMany(changes)
  return ids
}

/** Whether any live sample task exists (the "Remove sample tasks" actions show while it does). */
export function useHasSampleTasks(): boolean {
  const tasks = useLiveTasks()
  return !!tasks && holdsSample(tasks)
}

/**
 * Whether a snapshot holds a live sample task, once per snapshot and patched from the
 * rows a write changed. A query of the table found no sample by reading every row,
 * again after each write: on a new device's first sync of 10,000 tasks that kept the
 * Inbox, whose menu asks, three times slower than Today (inbox-first-sync).
 */
export const holdsSample = perList<boolean>(
  (tasks) => tasks.some((task) => isSample(task) && !task.deleted_at),
  (prev, changes) => (changes.some((c) => (c.after && isSample(c.after)) || (c.before && isSample(c.before))) ? null : prev),
)

/** Whether a sample task was ever created on this account (trashed ones included): the offer is made once. */
export function useSampleOfferTaken(): boolean | undefined {
  return useLiveQuery(async () => !!(await db.tasks.filter(isSample).first()), [])
}

/**
 * Trashes every task still marked sample, with its subtasks, as one undoable batch.
 * Returns the undo id and the toast's words ("3 sample tasks removed").
 */
export async function removeSampleTasks(now = Date.now()): Promise<{ undoId: string | null; label: string; count: number }> {
  await getDeviceId()
  const all = await db.tasks.filter((task) => !task.deleted_at).toArray()
  const samples = all.filter(isSample)
  const ids = new Set(samples.map((task) => task.id))
  // A sample subtask goes with its sample parent; the count names the top-level ones.
  const topmost = samples.filter((task) => !task.parent_id || !ids.has(task.parent_id))
  const n = topmost.length
  const label = t('{n, plural, one {# sample task removed} other {# sample tasks removed}}', { n })
  if (n === 0) return { undoId: null, label, count: 0 }
  const entry = await applyBatch(await toProposed(planTrash(topmost, all, now)), { source: 'bulk', label })
  return { undoId: entry?.id ?? null, label, count: n }
}
