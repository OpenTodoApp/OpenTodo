// The task's project picker with several workspaces (OpenSpec workspaces, "Moving
// projects and tasks between workspaces"): every workspace's projects, grouped by
// workspace with the current one first, each group with its own "No project". A task
// follows its project's workspace, so picking another workspace's project moves it
// there; another workspace's "No project" moves it to that workspace's Inbox.
import { INBOX_KEY, projectSource, type PickerItem, type ProjectSourceOptions } from '../../lib/pickerSources'
import type { Project } from '../../lib/types'
import { projectsIn, type WorkspaceState } from '../../lib/workspaces'

/** The Inbox option of a workspace that is not the current one. */
export const inboxKeyOf = (workspace: string): string => `${INBOX_KEY}:${workspace}`

export function projectsByWorkspace(state: WorkspaceState, everyProject: readonly Project[], opts: ProjectSourceOptions): PickerItem[] {
  const current = state.list.find((w) => w.id === state.current)
  if (state.list.length < 2 || !current) return projectSource(projectsIn(state, everyProject), opts)
  const order = [current, ...state.list.filter((w) => w.id !== current.id)]
  return order.flatMap((w) => {
    const here = w.id === current.id
    const items = projectSource(projectsIn({ ...state, current: w.id }, everyProject), here ? opts : { ...opts, current: null })
    return items.map((i) => ({ ...i, group: w.name, workspace: w.id, ...(i.key === INBOX_KEY && !here ? { key: inboxKeyOf(w.id) } : {}) }))
  })
}
