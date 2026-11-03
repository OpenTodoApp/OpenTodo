// What a filter needs to name workspaces (OpenSpec change group-mentions, D6):
// the cached workspaces, the workspace each task belongs to under the partition
// rules, and every workspace's tasks, projects and labels, which a query that
// names a workspace is evaluated over.
import { useMemo } from 'react'
import type { FilterContext } from '../lib/filter'
import { NO_TASKS, useTasksOfEveryWorkspace } from '../lib/liveTasks'
import { useLabelsOfEveryWorkspace, useProjectsOfEveryWorkspace, useWorkspaceState } from '../lib/localData'
import type { Task } from '../lib/types'
import { Partition } from '../lib/workspaces'

export type WorkspaceFilterContext = Pick<FilterContext, 'workspaces' | 'workspaceOf' | 'everyWorkspace'>

export function useWorkspaceFilter(): WorkspaceFilterContext {
  const state = useWorkspaceState()
  const projects = useProjectsOfEveryWorkspace()
  const labels = useLabelsOfEveryWorkspace()
  const tasks = useTasksOfEveryWorkspace() ?? NO_TASKS
  return useMemo(() => workspaceFilterContext(state.defaultId, state.list, projects, labels, tasks), [state, projects, labels, tasks])
}

/** The pure part of useWorkspaceFilter (tests). With one workspace there is nothing to widen. */
export function workspaceFilterContext(
  defaultId: string, list: readonly { id: string; name: string }[],
  projects: FilterContext['projects'], labels: FilterContext['labels'], tasks: readonly Task[],
): WorkspaceFilterContext {
  const p = new Partition(defaultId, list.map((w) => w.id), projects, tasks)
  const workspaceOf = (task: Task) => p.taskRow(task)
  if (list.length <= 1) return { workspaces: list, workspaceOf }
  return { workspaces: list, workspaceOf, everyWorkspace: { tasks, projects, labels } }
}
