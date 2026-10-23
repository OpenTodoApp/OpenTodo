// Moving between workspaces (OpenSpec change workspaces, design D5): the
// current workspace is device state; switching keeps the view when it exists
// in the target workspace (the Inbox stays the Inbox) and opens the Inbox
// otherwise; opening an entity of another workspace switches first and says so.
import { useEffect } from 'react'
import { t } from '../lib/i18n'
import { onCurrentWorkspaceGone, readWorkspaceState, switchTo, workspaceIdFor, workspaceOfEntity, type PartitionedKind } from '../lib/workspaces'
import { useWorkspaceState } from '../lib/localData'
import { updateTask } from '../lib/ops'
import { showBulkToast } from './bulk/toastStore'
import { focusHeading, pageHeading } from './pageFocus'
import { navigate, type Route } from './router'

/** Views whose content belongs to one workspace's entities: switching leaves them for the Inbox. */
const ENTITY_VIEWS: ReadonlySet<Route['view']> = new Set(['project', 'label', 'view', 'place', 'task'])

/** The route to show after switching from `route`. */
export function routeAfterSwitch(route: Route): Route {
  return ENTITY_VIEWS.has(route.view) ? { view: 'inbox' } : route
}

/** Switches the device to `id` from `route`; focus lands on the page heading. */
export async function switchWorkspace(id: string, route: Route, focus = false): Promise<void> {
  await switchTo(id)
  const next = routeAfterSwitch(route)
  if (next !== route) navigate(next)
  if (focus) {
    // After the views re-render on the new workspace's data; nothing to focus once the
    // document is gone (a page unloading, or a test environment torn down before the tick).
    setTimeout(() => {
      if (typeof document === 'undefined') return
      const h = pageHeading(document.querySelector('main'))
      if (h) focusHeading(h)
    }, 50)
  }
}

/**
 * Before opening an entity: when it belongs to another workspace, switch the
 * device there and show "Switched to <name>". Resolves once switched.
 */
export async function followEntity(kind: PartitionedKind, id: string): Promise<boolean> {
  const ws = await workspaceOfEntity(kind, id)
  if (!ws) return false
  const state = await readWorkspaceState()
  if (ws === state.current) return false
  await switchTo(ws)
  const name = state.list.find((w) => w.id === ws)?.name ?? ''
  showBulkToast(t('Switched to {name}', { name: workspaceLabel(name, state.list.find((w) => w.id === ws)?.default ?? false) }), null, { ttl: 4000 })
  return true
}

/** A workspace's name as shown: the default workspace's untouched name is translated. */
export function workspaceLabel(name: string, isDefault: boolean): string {
  return isDefault && name === 'Personal' ? t('Personal') : name
}

/**
 * The shell's part: an address, a notification or a palette result naming an
 * entity of another workspace switches the device there first (workspaces
 * "Links and notifications across workspaces"; the address format does not
 * change), and when the current workspace is gone the device is back in the
 * default one with a toast.
 */
export function useWorkspaceFollow(route: Route, panelTask: string | null): void {
  const key = route.view === 'project' || route.view === 'task' || route.view === 'label' || route.view === 'view' ? `${route.view}:${route.id}` : ''
  useEffect(() => {
    if (!key) return
    const [kind, id] = key.split(':') as [PartitionedKind, string]
    void followEntity(kind, id)
  }, [key])
  useEffect(() => { if (panelTask) void followEntity('task', panelTask) }, [panelTask])
  useEffect(() => onCurrentWorkspaceGone((names) => {
    navigate({ view: 'inbox' })
    showBulkToast(names[0] ? t('{name} is no longer available', { name: names[0] }) : t('That workspace is no longer available'), null, { ttl: 5000 })
  }), [])
}

/** The current workspace's name while the account has more than one, else undefined (quick add's placeholder). */
export function useWorkspaceName(): string | undefined {
  const state = useWorkspaceState()
  if (state.list.length <= 1) return undefined
  const w = state.list.find((x) => x.id === state.current)
  return w ? workspaceLabel(w.name, w.default) : undefined
}

/**
 * After quick add put a task in the Inbox: with more than one workspace the
 * toast offers "Move to <other workspace>" (the default workspace, or the first
 * other one from it).
 */
export async function offerMoveToWorkspace(taskId: string): Promise<void> {
  const state = await readWorkspaceState()
  if (state.list.length <= 1) return
  const other = state.list.find((w) => w.id !== state.current && w.default) ?? state.list.find((w) => w.id !== state.current)
  if (!other) return
  const here = state.list.find((w) => w.id === state.current)
  showBulkToast(t('Added to {name}', { name: here ? workspaceLabel(here.name, here.default) : '' }), null, {
    ttl: 5000,
    action: { label: t('Move to {name}', { name: workspaceLabel(other.name, other.default) }), run: () => { void updateTask(taskId, { workspace_id: workspaceIdFor(other.id, state.list) }) } },
  })
}

/** The account's other workspaces, by name: the targets of "Move to workspace…". */
export function useOtherWorkspaces(): { id: string; name: string }[] {
  const state = useWorkspaceState()
  return state.list.filter((w) => w.id !== state.current).map((w) => ({ id: w.id, name: workspaceLabel(w.name, w.default) }))
}
