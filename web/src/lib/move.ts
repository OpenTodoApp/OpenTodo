// Manual ordering (OpenSpec `manual-ordering`): drag-and-drop and keyboard moves of
// tasks within a project list (each section, each parent's subtasks), the Inbox and
// board columns, and of projects among their sidebar siblings. A move reads the
// target list, plans the position writes with lib/ordering and records them, plus
// any container field (`parent_id`, `section_id`), in ONE mutateMany() call: one
// timestamp, applied locally first, so it works offline and converges under
// per-field last-writer-wins (design D3). No new fields, no new routes.
import { db } from './db'
import { mutateMany, type Change } from './ops'
import { compareByPosition, planMove, planMoveMany, planSortByName, planStep, type Placement, type PositionChange } from './ordering'
import { buildProjectTree } from './projects'
import { effectiveSection } from './sections'
import { canEditProject, canEditTasks, membershipMap, roleOf } from './sharing'
import { buildTree, isDescendant, type Tree } from './tree'
import { keepProjectWorkspace, projectsIn, readWorkspaceState } from './workspaces'
import type { Entity, Project, Section, Task } from './types'

/** A keyboard step: one place up or down, or to the top or bottom of the list. */
export type Step = -1 | 1 | 'top' | 'bottom'

/** Where a dragged task lands: its new parent (null = top level), section and place. */
export interface TaskTarget {
  parent_id: string | null
  /** Section for a top-level task ('' or null = "No section"); omitted = keep. */
  section_id?: string | null
  at: Placement
}

/** Where a dragged project lands: its new parent (null = top level) and place. */
export interface ProjectTarget {
  parent_id: string | null
  at: Placement
}

interface TaskContext {
  /** Every live task of the project (or the Inbox), completed ones included. */
  all: Task[]
  /** The open ones as the list shows them. */
  tree: Tree<Task>
  sections: Map<string, Section>
}

async function taskContext(projectId: string | null): Promise<TaskContext> {
  const all = projectId
    ? await db.tasks.where('project_id').equals(projectId).filter((t) => !t.deleted_at).toArray()
    : await db.tasks.filter((t) => !t.deleted_at && !t.project_id).toArray()
  const sections = projectId ? await db.sections.where('project_id').equals(projectId).toArray() : []
  return { all, tree: buildTree(all.filter((t) => !t.completed_at)), sections: new Map(sections.map((s) => [s.id, s])) }
}

/** The list a task belongs to: its parent's subtasks, or the top-level tasks of one section. */
function taskSiblings(ctx: TaskContext, parent: string | null, section: string | null): Task[] {
  if (parent !== null) return (ctx.tree.nodes.get(parent)?.children ?? []).map((n) => n.item)
  return ctx.tree.roots.map((n) => n.item).filter((t) => effectiveSection(t, ctx.sections) === section)
}

function toChanges(entity: Entity, plan: PositionChange[], extra: Record<string, unknown> = {}, movedId?: string): Change[] {
  return plan.map((c) => ({ entity, entityId: c.id, patch: c.id === movedId ? { ...extra, position: c.position } : { position: c.position } }))
}

/** Whether the signed-in user may reorder tasks of this project (viewers may not). */
export async function canReorderTasks(projectId: string | null): Promise<boolean> {
  return canEditTasks(roleOf(projectId, await membershipMap()))
}

/**
 * Drop a task at a place: within its list, into another section, or under another
 * parent of the same project. Container fields and positions go into one batch.
 * Returns false (and writes nothing) when the move is refused or changes nothing:
 * viewer, completed or unknown task, a parent that is the task or one of its
 * descendants, a section of another project, an unknown anchor.
 */
export async function moveTask(id: string, target: TaskTarget): Promise<boolean> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at || task.completed_at) return false
  if (!(await canReorderTasks(task.project_id))) return false
  const ctx = await taskContext(task.project_id)
  const node = ctx.tree.nodes.get(id)
  if (!node) return false
  const parent = target.parent_id
  const patch: Record<string, unknown> = {}
  if (parent !== node.parent) {
    if (parent !== null) {
      if (parent === id || !ctx.tree.nodes.has(parent) || isDescendant(parent, id, ctx.all)) return false
    }
    patch.parent_id = parent
  }
  let section: string | null = null
  if (parent === null) {
    const current = effectiveSection(task, ctx.sections)
    section = target.section_id === undefined ? current : target.section_id || null
    if (section !== null) {
      const s = ctx.sections.get(section)
      if (!s || s.deleted_at) return false
    }
    if (section !== current) patch.section_id = section
  }
  const plan = planMove(taskSiblings(ctx, parent, section), id, target.at)
  if (plan === null) return false
  if (plan.length === 0 && Object.keys(patch).length === 0) return false
  await mutateMany(toChanges('task', plan, patch, id))
  return true
}

/**
 * A placement whose anchor is one of the moved tasks names the nearest task that
 * stays, the way the list showed them (drag-ticked-together D2): after a moved
 * task is after the closest one before it, or the top.
 */
function anchorOutside(siblings: Task[], moved: ReadonlySet<string>, at: Placement): Placement {
  if (typeof at !== 'object') return at
  const sorted = [...siblings].sort(compareByPosition)
  const after = 'after' in at
  const id = after ? at.after : at.before
  if (!moved.has(id)) return at
  const i = sorted.findIndex((s) => s.id === id)
  if (i < 0) return after ? 'top' : 'bottom'
  if (after) {
    for (let j = i - 1; j >= 0; j--) if (!moved.has(sorted[j].id)) return { after: sorted[j].id }
    return 'top'
  }
  for (let j = i + 1; j < sorted.length; j++) if (!moved.has(sorted[j].id)) return { before: sorted[j].id }
  return 'bottom'
}

/**
 * Plan dropping several ticked tasks of one list at a place (OpenSpec change
 * drag-ticked-together, D1–D3). `ids` are in the order the list shows them; they
 * all become siblings under the target's parent, next to each other in that
 * order, so a ticked subtask of a ticked task lands right after it, and every
 * task keeps the subtasks that are not ticked. A target inside a moved subtree
 * climbs out of it to just after its topmost moved ancestor. Null (nothing to
 * write) for an unknown, completed or deleted task, tasks of several lists, a
 * viewer, or a section of another project.
 */
export async function planTasksMove(ids: readonly string[], target: TaskTarget): Promise<Change[] | null> {
  if (ids.length === 0) return null
  const tasks = await db.tasks.bulkGet([...ids])
  if (tasks.some((x) => !x || x.deleted_at || x.completed_at)) return null
  const project = tasks[0]!.project_id ?? null
  if (tasks.some((x) => (x!.project_id ?? null) !== project)) return null
  if (!(await canReorderTasks(project))) return null
  const ctx = await taskContext(project)
  if (ids.some((id) => !ctx.tree.nodes.has(id))) return null
  const moved = new Set(ids)
  const inMoved = (id: string) => ids.some((m) => isDescendant(id, m, ctx.all))
  let parent = target.parent_id
  let at = target.at
  let section: string | null | undefined = target.section_id
  // Never under a moved task or what it carries: just after the topmost one instead.
  while (parent !== null && inMoved(parent)) {
    at = { after: parent }
    section = undefined
    parent = ctx.tree.nodes.get(parent)?.parent ?? null
  }
  if (parent !== null && !ctx.tree.nodes.has(parent)) return null
  if (parent === null) {
    const anchor = typeof at === 'object' ? ('after' in at ? at.after : at.before) : null
    const beside = anchor ? ctx.all.find((x) => x.id === anchor) : undefined
    const current = effectiveSection(beside ?? tasks[0]!, ctx.sections)
    section = section === undefined ? current : section || null
    if (section !== null) {
      const sec = ctx.sections.get(section)
      if (!sec || sec.deleted_at) return null
    }
  } else section = null
  const siblings = taskSiblings(ctx, parent, section)
  const plan = planMoveMany(siblings, ids, anchorOutside(siblings, moved, at))
  if (plan === null) return null
  const byId = new Map(tasks.map((x) => [x!.id, x!]))
  return plan.map((c) => {
    const task = byId.get(c.id)
    if (!task) return { entity: 'task', entityId: c.id, patch: { position: c.position } }
    const patch: Record<string, unknown> = { position: c.position }
    if ((ctx.tree.nodes.get(c.id)?.parent ?? null) !== parent) patch.parent_id = parent
    if (parent === null && effectiveSection(task, ctx.sections) !== section) patch.section_id = section
    return { entity: 'task', entityId: c.id, patch }
  })
}

/**
 * Keyboard move (Alt+Up/Down, Alt+Shift+Up/Down) within the task's current list.
 * False at the edge of the list, for a viewer, or for a task not shown in a list.
 */
export async function moveTaskBy(id: string, step: Step): Promise<boolean> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at || task.completed_at) return false
  if (!(await canReorderTasks(task.project_id))) return false
  const ctx = await taskContext(task.project_id)
  const node = ctx.tree.nodes.get(id)
  if (!node) return false
  const section = node.parent === null ? effectiveSection(task, ctx.sections) : null
  const plan = planStep(taskSiblings(ctx, node.parent, section), id, step)
  if (!plan) return false
  await mutateMany(toChanges('task', plan))
  return true
}

/**
 * Where a task sits in its list for the row menu's Move items (accessibility-aa D3, the
 * single-pointer alternative to dragging a row): first and last among its siblings, or
 * null when moveTaskBy would refuse it (viewer, completed, not in a list).
 */
export async function taskStepEdges(id: string): Promise<{ first: boolean; last: boolean } | null> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at || task.completed_at) return null
  if (!(await canReorderTasks(task.project_id))) return null
  const ctx = await taskContext(task.project_id)
  const node = ctx.tree.nodes.get(id)
  if (!node) return null
  const section = node.parent === null ? effectiveSection(task, ctx.sections) : null
  const sorted = [...taskSiblings(ctx, node.parent, section)].sort(compareByPosition)
  const i = sorted.findIndex((s) => s.id === id)
  return { first: i === 0, last: i === sorted.length - 1 }
}

interface ProjectContext {
  all: Project[]
  tree: Tree<Project>
  writable: (p: Project) => boolean
}

async function projectContext(): Promise<ProjectContext> {
  // The current workspace's projects, as the sidebar shows them: a project of another
  // workspace is never a neighbour a move steps over (issue 1956).
  const all = projectsIn(await readWorkspaceState(), await db.projects.toArray()).filter((p) => !p.deleted_at)
  const m = await membershipMap()
  // A project's position is a project field: only its owner or an admin may write it
  // (project-sharing role table); other shared projects bound a renumbered window.
  return { all, tree: buildProjectTree(all), writable: (p) => canEditProject(roleOf(p.id, m)) }
}

function projectSiblings(ctx: ProjectContext, parent: string | null): Project[] {
  return (parent === null ? ctx.tree.roots : ctx.tree.nodes.get(parent)?.children ?? []).map((n) => n.item)
}

/**
 * Drop a project at a place among the sidebar projects of `parent_id`. Re-parenting
 * follows `project-hierarchy` (never under itself, a descendant, or an archived or
 * hidden project). One batch; false when refused or a no-op.
 */
export async function moveProjectTo(id: string, target: ProjectTarget): Promise<boolean> {
  const ctx = await projectContext()
  const node = ctx.tree.nodes.get(id)
  if (!node || !ctx.writable(node.item)) return false
  const parent = target.parent_id
  const patch: Record<string, unknown> = {}
  if (parent !== node.parent) {
    if (parent !== null && (parent === id || !ctx.tree.nodes.has(parent) || isDescendant(parent, id, ctx.all))) return false
    patch.parent_id = parent
    // It stays in the workspace it is in when it becomes a top-level project (issue 544).
    const ws = await keepProjectWorkspace(id)
    if (ws !== undefined) patch.workspace_id = ws
  }
  const plan = planMove(projectSiblings(ctx, parent), id, target.at, { writable: ctx.writable })
  if (plan === null) return false
  if (plan.length === 0 && Object.keys(patch).length === 0) return false
  await mutateMany(toChanges('project', plan, patch, id))
  return true
}

/** Keyboard move of a sidebar project among its siblings (same level). */
export async function moveProjectBy(id: string, step: Step): Promise<boolean> {
  const ctx = await projectContext()
  const node = ctx.tree.nodes.get(id)
  if (!node || !ctx.writable(node.item)) return false
  const plan = planStep(projectSiblings(ctx, node.parent), id, step, { writable: ctx.writable })
  if (!plan) return false
  await mutateMany(toChanges('project', plan))
  return true
}

/**
 * Sort the projects directly under `parent` (null = the top level) by name, once
 * (sort-projects-by-name): ordinary position writes, so the order stays manual
 * afterwards. Projects the user may not move keep their places. [] when already sorted.
 */
export async function planSortProjects(parent: string | null, locale?: string): Promise<Change[]> {
  const ctx = await projectContext()
  if (parent !== null && !ctx.tree.nodes.has(parent)) return []
  return toChanges('project', planSortByName(projectSiblings(ctx, parent), { writable: ctx.writable, locale }))
}
