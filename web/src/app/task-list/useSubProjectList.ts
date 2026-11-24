// A project's sub-projects in its list (OpenSpec change subproject-inline): the direct
// sub-projects with their rolled-up counts, and the open tasks of the ones open in place,
// worked out for those only, from an index of open tasks by project and then from the
// rows each write changed (D7).
import { useMemo, useRef } from 'react'
import { appendTo } from '../../lib/collections'
import { isInlineOpen, patchViewTasks, type SubProjectList } from '../../lib/listGroups'
import { openCountsByProject } from '../../lib/liveTasks'
import { useLiveSections } from '../../lib/localData'
import { buildProjectTree, rollUpCounts, type ProjectNode } from '../../lib/projects'
import { Derived, patchSorted, perList } from '../../lib/taskDelta'
import type { Project, Task } from '../../lib/types'

const listed = (task: Task) => !task.completed_at && task.habit_graduated_at == null
const NO_NODES: ProjectNode[] = []
const NO_TASKS: Task[] = []
const NO_PARENTS = { parentOf: () => undefined, hasChildren: () => false }

/** Every project's open tasks, in the snapshot's order (by id). */
const openByProject = perList<Map<string, Task[]>>((tasks) => {
  const m = new Map<string, Task[]>()
  for (const task of tasks) if (task.project_id && listed(task)) appendTo(m, task.project_id, task)
  return m
}, (prev, changes) => {
  const next = new Map(prev)
  for (const c of changes) {
    for (const id of new Set([c.before?.project_id, c.after?.project_id])) {
      if (!id) continue
      const list = patchSorted(next.get(id) ?? NO_TASKS, [{ id: c.id, after: c.after?.project_id === id ? c.after : undefined }], listed).list
      if (list.length) next.set(id, list)
      else next.delete(id)
    }
  }
  return next
})

/** One open sub-project's tasks: looked up in the index, then patched from each write. */
const ownTasks = () => new Derived<Task[], [string, readonly Project[]]>(
  (tasks, id) => openByProject(tasks).get(id) ?? NO_TASKS,
  (prev, changes, _tasks, id, projects) => patchViewTasks(prev, changes, { view: 'project', id }, projects, '', NO_PARENTS),
)

/**
 * The project's Sub-projects group for its list layout (`on`), with `offered` when the
 * rows offer their arrow; `keep` is the view's query and duration filters.
 */
export function useSubProjectList(projectId: string | null, on: boolean, offered: boolean, allTasks: readonly Task[], projects: readonly Project[],
  collapsed: ReadonlySet<string>, keep: ((task: Task) => boolean) | null): { has: boolean; list: SubProjectList | undefined } {
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  const children = (projectId && tree.nodes.get(projectId)?.children) || NO_NODES
  const own = openCountsByProject(allTasks)
  const counts = useMemo(() => rollUpCounts(own, tree, new Set(tree.nodes.keys())), [own, tree])
  const sections = useLiveSections()
  const cache = useRef(new Map<string, ReturnType<typeof ownTasks>>()).current
  const list = useMemo(() => {
    if (!on || !children.length) return undefined
    const base = { children, counts, offered, sections }
    const tasks = new Map<string, readonly Task[]>()
    const walk = (nodes: readonly ProjectNode[]) => {
      for (const n of nodes) {
        if (!isInlineOpen(base, n, collapsed)) continue
        let derived = cache.get(n.id)
        if (!derived) cache.set(n.id, (derived = ownTasks()))
        const open = derived.get(allTasks, n.id, projects)
        tasks.set(n.id, keep ? open.filter(keep) : open)
        walk(n.children)
      }
    }
    walk(children)
    for (const id of cache.keys()) if (!tasks.has(id)) cache.delete(id)
    return { ...base, tasks }
  }, [on, children, counts, offered, sections, collapsed, allTasks, projects, keep, cache])
  return { has: children.length > 0, list }
}
