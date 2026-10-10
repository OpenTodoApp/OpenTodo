// Project-specific tree rules on top of the generic tree module (OpenSpec
// `project-hierarchy`): the sidebar tree, rolled-up open counts and the per-device
// collapse state. Everything here is derived from local data or stored in the
// local `meta` table; nothing here writes an op, so it is correct offline and the
// tree converges by construction (orphans at the top level, cycles broken at the
// member with the newest `parent_id` clock, see tree.ts).
import { getMeta, setMeta } from './db'
import { buildTree, descendants, isDescendant as isTreeDescendant, type Tree, type TreeNode } from './tree'
import type { Project, Task } from './types'

export type ProjectTree = Tree<Project>
export type ProjectNode = TreeNode<Project>

/** The projects the sidebar shows: neither deleted nor archived. */
export function visibleProjects(projects: Iterable<Project>): Project[] {
  const out: Project[] = []
  for (const p of projects) if (!p.deleted_at && !p.archived) out.push(p)
  return out
}

/**
 * Build the sidebar forest from any project list. Deleted and archived projects are
 * left out, so a child of one is shown at the top level until its parent comes back.
 * Children are ordered by `position`; `node.depth` starts at 0.
 */
export function buildProjectTree(projects: Iterable<Project>): ProjectTree {
  return buildTree(visibleProjects(projects))
}

/** Ids of every project below `id`, following raw parent pointers (deleted and archived included). */
export function descendantIds(id: string, projects: Project[]): Set<string> {
  return descendants(id, projects)
}

/** True when `candidate` is `ancestor` itself or sits somewhere below it. */
export function isDescendant(candidate: string, ancestor: string, projects: Project[]): boolean {
  return isTreeDescendant(candidate, ancestor, projects)
}

/**
 * Open-task count per project as the sidebar shows it: a collapsed project counts
 * its whole visible subtree, an expanded one only its own tasks. One pass over the
 * tasks, then one bottom-up pass over the tree; linear in both.
 */
export function openCountsByProject(tasks: Iterable<Task>, tree: ProjectTree, collapsed: Set<string>): Map<string, number> {
  const own = ownOpenCounts(tasks)
  const out = new Map<string, number>()
  const total = (n: ProjectNode): number => {
    let sum = own.get(n.id) ?? 0
    for (const c of n.children) sum += total(c)
    out.set(n.id, collapsed.has(n.id) ? sum : (own.get(n.id) ?? 0))
    return sum
  }
  for (const r of tree.roots) total(r)
  return out
}

/** Open-task total of each project's whole visible subtree (what a sub-project list shows). */
export function subtreeOpenCounts(tasks: Iterable<Task>, tree: ProjectTree): Map<string, number> {
  return openCountsByProject(tasks, tree, new Set(tree.nodes.keys()))
}

function ownOpenCounts(tasks: Iterable<Task>): Map<string, number> {
  const own = new Map<string, number>()
  for (const t of tasks) {
    if (t.deleted_at || t.completed_at || !t.project_id) continue
    own.set(t.project_id, (own.get(t.project_id) ?? 0) + 1)
  }
  return own
}

// ---- per-device collapse state (local `meta`, never synced) ----

export const COLLAPSED_PROJECTS_KEY = 'collapsedProjects'

export async function getCollapsedProjects(): Promise<Set<string>> {
  return new Set(await getMeta<string[]>(COLLAPSED_PROJECTS_KEY, []))
}

export async function setCollapsedProjects(ids: Set<string>): Promise<void> {
  await setMeta(COLLAPSED_PROJECTS_KEY, [...ids])
}

/** Collapse or expand one project; `force` sets the state instead of toggling. */
export async function toggleCollapsedProject(id: string, force?: boolean): Promise<Set<string>> {
  const set = await getCollapsedProjects()
  const want = force ?? !set.has(id)
  if (want) set.add(id)
  else set.delete(id)
  await setCollapsedProjects(set)
  return set
}

/**
 * Navigating to a project reveals it: every ancestor leaves the collapsed set.
 * Writes only when something changes, so calling it on each render is harmless.
 */
export async function expandAncestorsOf(id: string, projects: Project[]): Promise<void> {
  const set = await getCollapsedProjects()
  if (set.size === 0) return
  const byId = new Map(projects.map((p) => [p.id, p]))
  const seen = new Set<string>([id])
  let changed = false
  let cur = byId.get(id)?.parent_id ?? null
  while (cur !== null && !seen.has(cur)) {
    seen.add(cur)
    if (set.delete(cur)) changed = true
    cur = byId.get(cur)?.parent_id ?? null
  }
  if (changed) await setCollapsedProjects(set)
}
