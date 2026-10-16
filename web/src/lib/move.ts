// Manual ordering (OpenSpec `manual-ordering`): drag-and-drop and keyboard moves of
// tasks within a project list (each section, each parent's subtasks), the Inbox and
// board columns, and of projects among their sidebar siblings. A move reads the
// target list, plans the position writes with lib/ordering and records them, plus
// any container field (`parent_id`, `section_id`), in ONE mutateMany() call: one
// timestamp, applied locally first, so it works offline and converges under
// per-field last-writer-wins (design D3). No new fields, no new routes.
import { db } from './db'
import { mutateMany, type Change } from './ops'
import { planMove, planStep, type Placement, type PositionChange } from './ordering'
import { buildProjectTree } from './projects'
import { effectiveSection } from './sections'
import { canEditProject, canEditTasks, membershipMap, roleOf } from './sharing'
import { buildTree, isDescendant, type Tree } from './tree'
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
    ? await db.tasks.where('project_id').equals(projectId).filter((task) => !task.deleted_at).toArray()
    : await db.tasks.filter((tk) => !tk.deleted_at && !tk.project_id).toArray()
  const sections = projectId ? await db.sections.where('project_id').equals(projectId).toArray() : []
  return { all, tree: buildTree(all.filter((item) => !item.completed_at)), sections: new Map(sections.map((s) => [s.id, s])) }
}

/** The list a task belongs to: its parent's subtasks, or the top-level tasks of one section. */
function taskSiblings(ctx: TaskContext, parent: string | null, section: string | null): Task[] {
  if (parent !== null) return (ctx.tree.nodes.get(parent)?.children ?? []).map((n) => n.item)
  return ctx.tree.roots.map((n) => n.item).filter((task) => effectiveSection(task, ctx.sections) === section)
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

interface ProjectContext {
  all: Project[]
  tree: Tree<Project>
  writable: (p: Project) => boolean
}

async function projectContext(): Promise<ProjectContext> {
  const all = await db.projects.filter((p) => !p.deleted_at).toArray()
  const m = await membershipMap()
  // A project's position is a project field: only its owner or an admin may write it
  // (project-sharing role table); other shared projects bound a renumbered window.
  return { all, tree: buildProjectTree(all), writable: (p) => canEditProject(roleOf(p.id, m)) }
}

function projectSiblings(ctx: ProjectContext, parent: string | null): Project[] {
  return (parent === null ? ctx.tree.roots : ctx.tree.nodes.get(parent)?.children ?? []).map((n) => n.item)
}

/** Whether the signed-in user may move this project in the sidebar. */
export async function canReorderProject(id: string): Promise<boolean> {
  return canEditProject(roleOf(id, await membershipMap()))
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
 * Generic entry point named in the change's tasks: move a task or project to
 * `index` (or an anchor) in the list given by its container fields.
 */
export async function moveItem(entity: 'task' | 'project', id: string, place: { container: { parent_id: string | null; section_id?: string | null }; index: Placement }): Promise<boolean> {
  return entity === 'task'
    ? moveTask(id, { ...place.container, at: place.index })
    : moveProjectTo(id, { parent_id: place.container.parent_id, at: place.index })
}
