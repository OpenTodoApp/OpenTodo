// Adding to a reusable list (OpenSpec reusable-lists, design D3–D5): the data side
// of quick add in a project with the mode on. Matching runs on the device's own
// rows, so it works offline and on decrypted titles. The screens call these and
// show the toast (app/reuseAdd.ts).
import { db } from './db'
import { applyBatch } from './undo'
import { toProposed } from './bulk'
import { getDeviceId, mutate, type Change, type NewTaskInput } from './ops'
import { canEditTasks, membershipMap, roleOf } from './sharing'
import { positionAtEnd } from './ordering'
import { duplicateLosers, findMatch, isReusable, sortsIntoAisles, type ReuseMatch } from './reusable'
import { AISLE_ICONS, aisleForTitle, aisleName, loadVocabularies, missingAisles, sectionForAisle, type Aisle } from './aisles'
import { currentLanguage, t } from './i18n'
import { uuid } from './ids'
import type { AssistantUndo } from './db'
import type { Task } from './types'

/** The item an add to a reusable list matches, or null (not a reusable list, a subtask, a win, no match). */
export async function reuseMatchFor(input: Pick<NewTaskInput, 'title' | 'project_id' | 'parent_id' | 'completed'>): Promise<ReuseMatch<Task> | null> {
  const pid = input.project_id
  if (!pid || input.parent_id || input.completed) return null
  const project = await db.projects.get(pid)
  if (!project || project.deleted_at || !isReusable(project)) return null
  const tasks = await db.tasks.where('project_id').equals(pid).toArray()
  return findMatch(pid, input.title, tasks)
}

/**
 * Reopens a matched item in place as one undoable batch, with what the add typed
 * applied to it as edits (D3): a due date, a priority, labels (added to its own),
 * a deadline, a start, an energy, an estimate. Its section, notes and labels stay.
 */
export async function reopenItem(task: Task, input: NewTaskInput): Promise<AssistantUndo | null> {
  const patch: Record<string, unknown> = { completed_at: null, completed_by: null }
  if (input.due !== undefined && input.due !== null) patch.due = input.due
  if (input.priority !== undefined && input.priority !== 4 && input.priority !== task.priority) patch.priority = input.priority
  const added = (input.labels ?? []).filter((l) => !task.labels.includes(l))
  if (added.length) patch.labels = [...task.labels, ...added]
  if (input.deadline) patch.deadline = input.deadline
  if (input.start) patch.start = input.start
  if (input.energy) patch.energy = input.energy
  if (input.estimate_minutes) patch.estimate_minutes = input.estimate_minutes
  await getDeviceId()
  const changes: Change[] = [{ entity: 'task', entityId: task.id, patch }]
  return applyBatch(await toProposed(changes, await membershipMap()), { source: 'action', label: t('{title} is back on the list', { title: task.title }) })
}

/** Reopens several matched items as one undoable batch (a pasted list). */
export async function reopenItems(tasks: readonly Task[]): Promise<AssistantUndo | null> {
  if (!tasks.length) return null
  await getDeviceId()
  const changes: Change[] = tasks.map((task) => ({ entity: 'task', entityId: task.id, patch: { completed_at: null, completed_by: null } }))
  return applyBatch(await toProposed(changes, await membershipMap()), { source: 'action', label: t('Reopened on the list') })
}

/**
 * A new item's section in a list that sorts into aisles (D5): the live section
 * keyed with the aisle its words name, when there is one. An explicit section
 * (a section's own quick add) always wins, and anywhere else the input is
 * returned as it is.
 */
export async function placeInAisle<T extends NewTaskInput>(input: T): Promise<T> {
  const pid = input.project_id
  if (!pid || input.parent_id || input.section_id) return input
  const project = await db.projects.get(pid)
  if (!project || !sortsIntoAisles(project)) return input
  const sections = await db.sections.where('project_id').equals(pid).toArray()
  const vocabularies = await loadVocabularies(currentLanguage())
  const section = sectionForAisle(pid, aisleForTitle(input.title, vocabularies), sections)
  return section ? { ...input, section_id: section } : input
}

/** The aisles a project has no section for yet, in store order. */
export async function aislesToAdd(projectId: string): Promise<Aisle[]> {
  return missingAisles(projectId, await db.sections.where('project_id').equals(projectId).toArray())
}

/** Creates the missing aisle sections, named in the app language, in store order after the existing ones (D5). */
export async function addAisleSections(projectId: string): Promise<number> {
  const sections = (await db.sections.where('project_id').equals(projectId).toArray()).filter((s) => !s.deleted_at)
  const missing = missingAisles(projectId, sections)
  const placed: { id: string; position: number }[] = sections.map(({ id, position }) => ({ id, position }))
  const now = Date.now()
  for (const aisle of missing) {
    const id = uuid()
    const position = positionAtEnd(placed)
    placed.push({ id, position })
    await mutate('section', id, {
      name: aisleName(aisle), project_id: projectId, position, created_at: now, deleted_at: null, icon: AISLE_ICONS[aisle], aisle,
    })
  }
  return missing.length
}

/**
 * Duplicate collapse (D4): in every reusable list this device may edit, the
 * duplicates duplicateLosers names are moved to the Trash as ordinary
 * deletions. Every device picks the same survivor, so the result converges.
 * Returns how many items were merged.
 */
export async function collapseDuplicates(now = Date.now()): Promise<number> {
  const projects = (await db.projects.toArray()).filter((p) => !p.deleted_at && isReusable(p))
  if (!projects.length) return 0
  const memberships = await membershipMap()
  let merged = 0
  for (const p of projects) {
    if (!canEditTasks(roleOf(p.id, memberships))) continue
    const tasks = await db.tasks.where('project_id').equals(p.id).toArray()
    const open = tasks.filter((x) => !x.deleted_at && x.completed_at == null && !x.parent_id).map((x) => x.id)
    if (open.length < 2) continue
    const attached = new Set<string>()
    const mark = (rows: { task_id?: string | null; deleted_at?: number | null }[]) => { for (const r of rows) if (r.task_id && !r.deleted_at) attached.add(r.task_id) }
    mark(await db.comments.where('task_id').anyOf(open).toArray())
    mark(await db.attachments.where('task_id').anyOf(open).toArray())
    mark(await db.reminders.where('task_id').anyOf(open).toArray())
    mark(await db.timeEntries.where('task_id').anyOf(open).toArray())
    for (const id of duplicateLosers(p.id, tasks, attached)) {
      await mutate('task', id, { deleted_at: now })
      merged++
    }
  }
  return merged
}
