// Moving between workspaces (OpenSpec change workspaces, design D5): the
// current workspace is device state; switching keeps the view when it exists
// in the target workspace (the Inbox stays the Inbox) and opens the Inbox
// otherwise; opening an entity of another workspace switches first and says so.
import { useEffect } from 'react'
import { t } from '../lib/i18n'
import { onCurrentWorkspaceGone, readWorkspaceState, switchTo, workspaceOfEntity, type PartitionedKind } from '../lib/workspaces'
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
    // After the views re-render on the new workspace's data.
    setTimeout(() => {
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
