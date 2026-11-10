// The workspace control (OpenSpec change workspaces, design D6): the sidebar's
// header row names the current workspace and opens the switcher, a menu of the
// account's workspaces with their Inbox and Today counts, "New workspace" and
// "Manage workspaces". It is not a destination and adds no row. It shows the
// workspace's own picture and its name on one line (sidebar-brand-and-row-grid D1);
// the app's mark and name are in the brand line at the sidebar's end. Switching is
// device state.
import { useMemo } from 'react'
import { CatalogueIcon, hueFor, Icon, isCatalogueIcon, Menu, MenuItem, MenuSeparator, StatusDot } from '../ui'
import { t } from '../lib/i18n'
import { inboxParents, isInboxTask } from '../lib/inbox'
import { useTasksOfEveryWorkspace } from '../lib/liveTasks'
import { useSettledValue } from '../lib/useSettledValue'
import { useProjectsOfEveryWorkspace, useWorkspaceState } from '../lib/localData'
import { useUnreadCounts } from '../lib/feed'
import type { Workspace } from '../lib/types'
import { inToday } from '../lib/views'
import { Partition } from '../lib/workspaces'
import { requestNewWorkspace } from './NewWorkspaceDialog'
import { navigate, type Route } from './router'
import { useToday } from './useViews'
import { switchWorkspace, workspaceLabel } from './workspaceNav'

/**
 * A workspace's picture (sidebar-brand-and-row-grid D1, app-shell "Workspace picture"):
 * its catalogue icon on its colour, else the first character of its name on its colour,
 * else on the neutral surface. Never the app's mark: the brand line carries that.
 */
export function WorkspaceMark({ workspace, size = 20 }: { workspace: Pick<Workspace, 'icon' | 'color' | 'default' | 'name'> | undefined; size?: 20 | 24 }) {
  // Stored colours render through the palette's hues (design-system).
  const hue = workspace?.color ? hueFor(workspace.color) : undefined
  const name = workspace ? workspaceLabel(workspace.name, workspace.default) : t('Personal')
  const initial = (Array.from(name.trim())[0] ?? '').toLocaleUpperCase()
  const icon = workspace?.icon && isCatalogueIcon(workspace.icon) ? workspace.icon : null
  return (
    <span aria-hidden="true" data-hue={hue} data-workspace-mark={icon ? 'icon' : 'initial'}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-control font-semibold leading-none ${size === 24 ? 'size-6 text-meta' : 'size-5 text-hint'} ${hue ? 'bg-hue-soft text-hue' : 'border border-default bg-sunken text-muted dark:bg-raised'}`}>
      {/* The initial is drawn by CSS, not a text node: it is a picture, never part of the control's visible name (label-content-name-mismatch). */}
      {icon ? <CatalogueIcon name={icon} size="xs" fallback={<Initial c={initial} />} /> : <Initial c={initial} />}
    </span>
  )
}

function Initial({ c }: { c: string }) {
  return <span data-initial={c} className="before:content-[attr(data-initial)]" />
}

type Counts = Map<string, { inbox: number; today: number; unread: number }>

/** Inbox, Today and unread counts per workspace, from every workspace's tasks. */
function useWorkspaceCounts(): Counts {
  const state = useWorkspaceState()
  const projects = useProjectsOfEveryWorkspace()
  // Counted once the writes stop, as the sidebar's view counts (list-rendering-at-scale D6).
  const every = useTasksOfEveryWorkspace()
  const tasks = useSettledValue(every)
  const today = useToday()
  const unread = useUnreadCounts()
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

/** The current workspace and its shown name, for the icon rail's picture and its tooltip. */
export function useCurrentWorkspace(): { workspace: Workspace | undefined; name: string } {
  const state = useWorkspaceState()
  const workspace = state.list.find((w) => w.id === state.current)
  return { workspace, name: workspace ? workspaceLabel(workspace.name, workspace.default) : t('Personal') }
}

/** The sidebar header's control. `collapsed` is the icon rail: the picture alone, the name in the tooltip. */
export function WorkspaceControl({ route, collapsed = false }: { route: Route; collapsed?: boolean }) {
  const state = useWorkspaceState()
  const counts = useWorkspaceCounts()
  const current = state.list.find((w) => w.id === state.current)
  const name = current ? workspaceLabel(current.name, current.default) : t('Personal')
  const elsewhere = state.list.filter((w) => w.id !== state.current && (counts.get(w.id)?.unread ?? 0) > 0)
  const updates = elsewhere.length > 0 ? t('Updates in {names}', { names: elsewhere.map((w) => workspaceLabel(w.name, w.default)).join(', ') }) : ''
  return (
    <div data-workspace-control className={`flex min-w-0 ${collapsed ? 'justify-center' : 'flex-1'}`}>
      <Menu kind="menu" label={updates ? t('Workspace: {name}, {updates}', { name, updates }) : t('Workspace: {name}', { name })} title={t('Workspaces')}
        align="start" width="sm:w-72" tip={collapsed || updates ? (updates || name) : undefined} tipSide={collapsed ? 'right' : 'bottom'}
        triggerProps={{ 'data-workspace-trigger': true }}
        triggerClassName={`flex min-h-9 min-w-0 items-center gap-2 rounded-control text-left hover:bg-sunken focus-visible:bg-sunken pointer-fine:min-h-8 dark:hover:bg-raised ${collapsed ? 'relative min-w-9 justify-center px-1.5' : 'flex-1 px-1'}`}
        trigger={<>
          <WorkspaceMark workspace={current} />
          {!collapsed && <span className="user-text min-w-0 flex-1 truncate text-body font-semibold text-strong" data-workspace-name>{name}</span>}
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
