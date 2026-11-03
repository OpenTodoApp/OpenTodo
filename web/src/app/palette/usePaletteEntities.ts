// The command bar's entities (tasks, projects, labels, views, Settings) from local
// rows, shared by the bar and by PaletteWarmer, which prepares their search text
// before the bar first opens (list-rendering-at-scale D6).
import { useMemo } from 'react'
import { useTasksOfEveryWorkspace } from '../../lib/liveTasks'
import { useProjectsOfEveryWorkspace, useWorkspaceState } from '../../lib/localData'
import type { Label, Project, Task, User, View } from '../../lib/types'
import { Partition, type WorkspaceState } from '../../lib/workspaces'
import { prepareCached } from '../../ui'
import { workspaceLabel } from '../workspaceNav'
import { secondaryOf, type Entry } from './entries'
import { buildEntries, type IndexSource } from './index'

/** The workspace a task or project lives in when it is not the current one (workspaces); undefined with one workspace. */
export function elsewhereOf(state: WorkspaceState, everyProject: readonly Project[], everyTask: readonly Task[]): IndexSource['elsewhere'] {
  if (state.list.length <= 1) return undefined
  const p = new Partition(state.defaultId, state.list.map((w) => w.id), everyProject as Project[], everyTask as Task[])
  const here = p.own(state.current)
  const names = new Map(state.list.map((w) => [w.id, workspaceLabel(w.name, w.default)]))
  return (kind: 'task' | 'project', row: { id: string }) => {
    const ws = kind === 'task' ? p.taskRow(row as Task) : p.project(row.id)
    return ws === here ? undefined : names.get(ws)
  }
}

export function usePaletteEntities(user: User | null, today: string, projects: Project[], labels: Label[], views: View[], tasks: Task[]): Entry[] {
  const workspaceState = useWorkspaceState()
  // Tasks and projects of every workspace: picking one elsewhere switches the device (workspaces).
  const everyTask = useTasksOfEveryWorkspace() ?? tasks
  const everyProject = useProjectsOfEveryWorkspace()
  const elsewhere = useMemo(() => elsewhereOf(workspaceState, everyProject, everyTask), [workspaceState, everyProject, everyTask])
  // The entities do not follow the text typed (ctx does): built once per data change,
  // so the combobox folds their text once (performance-10k).
  return useMemo(() => buildEntries({ tasks: everyTask, projects: everyProject.length ? everyProject : projects, labels, views, user, today, elsewhere }),
    [everyTask, everyProject, projects, labels, views, user, today, elsewhere])
}

/** Folds an entry's text as the bar's combobox does (label; secondary text and keywords), into the shared cache. */
export function prepareEntry(e: Entry): void {
  prepareCached(e.label, [secondaryOf(e, false), e.keywords].filter(Boolean).join(' '))
}
