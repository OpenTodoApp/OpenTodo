// Sections and the board view (OpenSpec `board-view`). Every write goes through
// mutate()/mutateMany(); a board has no state of its own, it is a rendering of
// sections and tasks. View mode and collapsed sections are per-device preferences
// in the local `meta` table and are never synced (design D5).
import { db, getMeta, setMeta } from './db'
import { mutate, mutateMany, type Change } from './ops'
import { byPosition, planStep, positionAtEnd } from './ordering'
import type { Section, Task } from './types'
import { t } from './i18n'
import { uuid } from './ids'

/** Live sections of a project, in display order. */
export async function projectSections(projectId: string): Promise<Section[]> {
  const list = await db.sections.where('project_id').equals(projectId).filter((s) => !s.deleted_at).toArray()
  return list.sort(byPosition)
}

/** A new section goes last in its project. Returns its id. Works offline. */
export async function createSection(projectId: string, name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(t('a section needs a name'))
  const id = uuid()
  const siblings = await projectSections(projectId)
  await mutate('section', id, {
    name: trimmed, project_id: projectId, position: positionAtEnd(siblings), created_at: Date.now(), deleted_at: null,
  })
  return id
}

export async function renameSection(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  const s = await db.sections.get(id)
  if (!s || s.deleted_at || !trimmed || trimmed === s.name) return
  await mutate('section', id, { name: trimmed })
}

/**
 * A section's colour and icon (icons-and-section-style): null clears either. Each
 * is its own field, so a colour on one device and a rename on another both win.
 */
export async function setSectionStyle(id: string, style: { color?: string | null; icon?: string | null }): Promise<void> {
  const s = await db.sections.get(id)
  if (!s || s.deleted_at) return
  const patch: Partial<Pick<Section, 'color' | 'icon'>> = {}
  if (style.color !== undefined && style.color !== (s.color ?? null)) patch.color = style.color
  if (style.icon !== undefined && style.icon !== (s.icon ?? null)) patch.icon = style.icon
  if (Object.keys(patch).length) await mutate('section', id, patch)
}

/**
 * Move a section one place up (-1) or down (+1), or to the first or last place,
 * among its project's sections: usually one position op between the new
 * neighbours; when that gap is exhausted, the few neighbours around it are
 * renumbered in the same batch (manual-ordering D2). Returns false when it cannot move.
 */
export async function reorderSection(id: string, delta: -1 | 1 | 'top' | 'bottom'): Promise<boolean> {
  const s = await db.sections.get(id)
  if (!s || s.deleted_at) return false
  const plan = planStep(await projectSections(s.project_id), id, delta)
  if (!plan) return false
  await mutateMany(plan.map((c) => ({ entity: 'section' as const, entityId: c.id, patch: { position: c.position } })))
  return true
}

/**
 * Delete a section: its tombstone plus `section_id = null` on each of its open
 * tasks, one op per task, in one batch, so they fall back to "No section". Completed
 * tasks keep the reference and are shown without a section if reopened (design D3).
 */
export async function deleteSection(id: string): Promise<void> {
  const s = await db.sections.get(id)
  if (!s || s.deleted_at) return
  const tasks = await db.tasks.where('section_id').equals(id).filter((task) => !task.deleted_at && !task.completed_at).toArray()
  const changes: Change[] = [{ entity: 'section', entityId: id, patch: { deleted_at: Date.now() } }]
  for (const tk of tasks) changes.push({ entity: 'task', entityId: tk.id, patch: { section_id: null } })
  await mutateMany(changes)
}

/**
 * The section a task is displayed in, or null for "No section": a reference to a
 * deleted section, a section of another project or one not received yet counts as
 * none (design D3). Display only; nothing is written.
 */
export function effectiveSection(task: Pick<Task, 'section_id' | 'project_id'>, sections: Map<string, Section>): string | null {
  if (!task.section_id) return null
  const s = sections.get(task.section_id)
  if (!s || s.deleted_at || s.project_id !== task.project_id) return null
  return s.id
}

/**
 * Move a task to a section (null = "No section"): sets `section_id` and a position
 * after every open task already in the target column, in one mutate() call, so both
 * fields share a timestamp and concurrent moves resolve to the newer one together
 * (design D4). Works offline.
 */
export async function moveTaskToSection(id: string, sectionId: string | null): Promise<void> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at) throw new Error('task not found')
  if (sectionId !== null) {
    const s = await db.sections.get(sectionId)
    if (!s || s.deleted_at || s.project_id !== task.project_id) throw new Error(t('section is not in the task’s project'))
  }
  const map = await sectionMap(task.project_id)
  const column = task.project_id
    ? await db.tasks.where('project_id').equals(task.project_id)
      .filter((tk) => !tk.deleted_at && !tk.completed_at && tk.id !== id && effectiveSection(tk, map) === sectionId).toArray()
    : []
  await mutate('task', id, { section_id: sectionId, position: positionAtEnd(column) })
}

async function sectionMap(projectId: string | null): Promise<Map<string, Section>> {
  if (!projectId) return new Map()
  const list = await db.sections.where('project_id').equals(projectId).toArray()
  return new Map(list.map((s) => [s.id, s]))
}

/** One heading / column: a section, or null for "No section". */
export interface SectionGroup<T extends Pick<Task, 'id' | 'position' | 'created_at' | 'section_id' | 'project_id'>> {
  section: Section | null
  /** Stable key: the section id, or '' for "No section". */
  key: string
  tasks: T[]
}

/**
 * Bucket a project's open tasks by section: "No section" first (always present),
 * then the project's live sections by position, each with its tasks by position.
 * Dangling references land under "No section" (design D3). `sections` may contain
 * sections of other projects and deleted ones; they are ignored.
 */
export function groupBySection<T extends Pick<Task, 'id' | 'position' | 'created_at' | 'section_id' | 'project_id'>>(
  projectId: string, tasks: T[], sections: Section[],
): SectionGroup<T>[] {
  const map = new Map(sections.map((s) => [s.id, s]))
  const live = sections.filter((s) => s.project_id === projectId && !s.deleted_at).sort(byPosition)
  const groups: SectionGroup<T>[] = [{ section: null, key: '', tasks: [] }, ...live.map((s) => ({ section: s, key: s.id, tasks: [] as T[] }))]
  const index = new Map(groups.map((g, i) => [g.key, i]))
  for (const task of tasks) groups[index.get(effectiveSection(task, map) ?? '') ?? 0].tasks.push(task)
  for (const g of groups) g.tasks.sort(byPosition)
  return groups
}

// ---- per-device preferences (never synced) ----

export type ProjectViewMode = 'list' | 'board' | 'timeline'

/** The `v` cycle: list → board → timeline → list (month-and-timeline-views). */
export function nextViewMode(mode: ProjectViewMode): ProjectViewMode {
  return mode === 'list' ? 'board' : mode === 'board' ? 'timeline' : 'list'
}

const modeKey = (projectId: string) => `view-mode:${projectId}`
const collapsedKey = (projectId: string) => `collapsed-sections:${projectId}`

export async function loadViewMode(projectId: string): Promise<ProjectViewMode> {
  // Unknown values (an older or newer device's) read as the list.
  const v = await getMeta<string>(modeKey(projectId), 'list')
  return v === 'board' || v === 'timeline' ? v : 'list'
}

export async function saveViewMode(projectId: string, mode: ProjectViewMode): Promise<void> {
  await setMeta(modeKey(projectId), mode)
}

/**
 * Opens projects an import just created as boards on this device when they were
 * boards in the source app (OpenSpec change named-importers, design D8). Only the
 * importing device is affected; nothing is synced.
 */
export async function applyImportViewHints(hints: readonly { projectId: string; view: string }[] | undefined): Promise<void> {
  for (const h of hints ?? []) {
    if (h.view === 'board' && h.projectId) await saveViewMode(h.projectId, 'board')
  }
}

/** Section ids ('' = "No section") collapsed in this project's list view on this device. */
export async function loadCollapsedSections(projectId: string): Promise<string[]> {
  const v = await getMeta<unknown>(collapsedKey(projectId), [])
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export async function setSectionCollapsed(projectId: string, key: string, collapsed: boolean): Promise<string[]> {
  const set = new Set(await loadCollapsedSections(projectId))
  if (collapsed) set.add(key)
  else set.delete(key)
  const list = [...set]
  await setMeta(collapsedKey(projectId), list)
  return list
}

const columnsKey = (projectId: string) => `list-columns:${projectId}`

/**
 * The list's columns layout (OpenSpec custom-fields, "Columns layout in the list
 * view"): one column per field, remembered per project on this device, never
 * synced. It is a layout of the list, so `v` still cycles list, board, timeline.
 */
export async function loadListColumns(projectId: string): Promise<boolean> {
  return (await getMeta<unknown>(columnsKey(projectId), false)) === true
}

export async function saveListColumns(projectId: string, on: boolean): Promise<void> {
  await setMeta(columnsKey(projectId), on)
}

const completedKey = (projectId: string) => `list-completed:${projectId}`

/**
 * Completed tasks kept in the project's list (project-completed-section): a
 * Completed group at the end of the list, remembered per project on this device,
 * never synced, like the columns layout.
 */
export async function loadShowCompleted(projectId: string): Promise<boolean> {
  return (await getMeta<unknown>(completedKey(projectId), false)) === true
}

export async function saveShowCompleted(projectId: string, on: boolean): Promise<void> {
  await setMeta(completedKey(projectId), on)
}

/** Meta keys the UI subscribes to with useLiveQuery. */
export const prefKeys = { mode: modeKey, collapsed: collapsedKey, columns: columnsKey, completed: completedKey }
