// The workspace control (OpenSpec change workspaces, design D6): the sidebar's
// header row names the current workspace and opens the switcher, a menu of the
// account's workspaces with their Inbox and Today counts, "New workspace" and
// "Manage workspaces". It is not a destination and adds no row; with one
// workspace it reads "OpenTodo · Personal". Switching is device state.
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BrandMark, CatalogueIcon, hueFor, Icon, isCatalogueIcon, Menu, MenuItem, MenuSeparator, StatusDot } from '../ui'
import { t } from '../lib/i18n'
import { inboxParents, isInboxTask } from '../lib/inbox'
import { useTasksOfEveryWorkspace } from '../lib/liveTasks'
import { useProjectsOfEveryWorkspace, useWorkspaceState } from '../lib/localData'
import { unreadCounts, type UnreadCounts } from '../lib/feed'
import type { Workspace } from '../lib/types'
import { inToday } from '../lib/views'
import { Partition } from '../lib/workspaces'
import { requestNewWorkspace } from './NewWorkspaceDialog'
import { navigate, type Route } from './router'
import { useToday } from './useViews'
import { switchWorkspace, workspaceLabel } from './workspaceNav'

/** A workspace's mark: its catalogue icon in its colour, a colour dot, or the app's mark for an unstyled default workspace. */
export function WorkspaceMark({ workspace, size = 20 }: { workspace: Pick<Workspace, 'icon' | 'color' | 'default'> | undefined; size?: 20 | 24 }) {
  if (!workspace || (workspace.default && !workspace.icon && !workspace.color)) return <BrandMark size={size} />
  // Stored colours render through the palette's hues (design-system).
  const hue = workspace.color ? hueFor(workspace.color) : undefined
  const dot = <span data-hue={hue} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${hue ? 'bg-hue-solid' : 'bg-accent'}`} />
  if (!workspace.icon || !isCatalogueIcon(workspace.icon)) return <span className="flex w-5 justify-center" data-workspace-mark>{dot}</span>
  return <span data-hue={hue} className={`flex w-5 justify-center ${hue ? 'text-hue' : 'text-accent'}`} data-workspace-mark><CatalogueIcon name={workspace.icon} size="sm" fallback={dot} /></span>
}

type Counts = Map<string, { inbox: number; today: number; unread: number }>

/** Inbox, Today and unread counts per workspace, from every workspace's tasks. */
function useWorkspaceCounts(): Counts {
  const state = useWorkspaceState()
  const projects = useProjectsOfEveryWorkspace()
  const tasks = useTasksOfEveryWorkspace()
  const today = useToday()
  const unread = useLiveQuery(() => unreadCounts(), [], { byProject: new Map(), total: 0 } as UnreadCounts)
  return useMemo(() => {
    const out: Counts = new Map(state.list.map((w) => [w.id, { inbox: 0, today: 0, unread: 0 }]))
    if (!tasks || state.list.length === 0) return out
    const p = new Partition(state.defaultId, state.list.map((w) => w.id), projects, tasks)
    const parents = inboxParents(tasks)
    for (const task of tasks) {
      if (task.completed_at) continue
      const c = out.get(p.taskRow(task))
      if (!c) continue
      if (isInboxTask(task, parents)) c.inbox++
      if (inToday(task, today)) c.today++
    }
    for (const [pid, n] of unread.byProject) {
      const c = out.get(p.project(pid))
      if (c) c.unread += n
    }
    return out
  }, [state, projects, tasks, today, unread])
}

/** The sidebar header's control. `collapsed` is the icon rail: the mark alone, the name in the tooltip. */
export function WorkspaceControl({ route, collapsed = false }: { route: Route; collapsed?: boolean }) {
  const state = useWorkspaceState()
  const counts = useWorkspaceCounts()
  const current = state.list.find((w) => w.id === state.current)
  const name = current ? workspaceLabel(current.name, current.default) : t('Personal')
  const single = state.list.length <= 1
  const elsewhere = state.list.filter((w) => w.id !== state.current && (counts.get(w.id)?.unread ?? 0) > 0)
  const updates = elsewhere.length > 0 ? t('Updates in {names}', { names: elsewhere.map((w) => workspaceLabel(w.name, w.default)).join(', ') }) : ''
  const label = single ? `OpenTodo · ${name}` : name
  return (
    <div data-workspace-control className="flex min-w-0 flex-1">
      <Menu kind="menu" label={updates ? t('Workspace: {name}, {updates}', { name: label, updates }) : t('Workspace: {name}', { name: label })} title={t('Workspaces')}
        align="start" width="sm:w-72" tip={collapsed || updates ? (updates || label) : undefined} tipSide={collapsed ? 'right' : 'bottom'}
        triggerProps={{ 'data-workspace-trigger': true }}
        triggerClassName={`flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-control px-1 text-left hover:bg-sunken focus-visible:bg-sunken pointer-fine:min-h-8 dark:hover:bg-raised ${collapsed ? 'justify-center' : ''}`}
        trigger={<>
          <WorkspaceMark workspace={current} />
          {!collapsed && <span className="min-w-0 flex-1 truncate font-semibold text-strong">
            {single ? <><span>OpenTodo</span><span className="text-faint"> · </span><span>{name}</span></> : name}
          </span>}
          {updates && <StatusDot label={updates} data-workspace-updates />}
          {!collapsed && <span aria-hidden className="text-faint"><Icon name="chevron-down" size="xs" /></span>}
        </>}>
        {state.list.map((w) => {
          const c = counts.get(w.id)
          const desc = t('{inbox} in Inbox · {today} today', { inbox: c?.inbox ?? 0, today: c?.today ?? 0 })
          return (
            <MenuItem key={w.id} label={workspaceLabel(w.name, w.default)} description={desc} checked={w.id === state.current}
              marker={(c?.unread ?? 0) > 0 && w.id !== state.current ? <StatusDot label={t('Updates')} /> : undefined}
              onSelect={() => { if (w.id !== state.current) void switchWorkspace(w.id, route, true) }} data-workspace-item={w.id} />
          )
        })}
        <MenuSeparator />
        <MenuItem icon="plus" label={t('New workspace')} onSelect={requestNewWorkspace} data-new-workspace />
        <MenuItem icon="settings" label={t('Manage workspaces')} onSelect={() => navigate({ view: 'settings', section: 'workspaces' })} data-manage-workspaces />
      </Menu>
    </div>
  )
}
