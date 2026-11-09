// The Favourites group (sidebar-favourites D4, app-shell "Favourites group"): the
// user's pinned projects, labels, saved filters and notes (notes-home D4), mixed, in the user's order, each
// with the mark of its own group, its count by the rule of its kind (a project's on
// hover, none on a label or a filter: quiet-sidebar D2) and the same menu. It has no chevron
// and no actions; Alt+↑ / Alt+↓ on a row moves it among the favourites.
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react'
import { favouriteEdges, moveFavourite, setFavourite, type Favourite } from '../lib/favourites'
import { projectPath, rollUpCounts, type ProjectTree } from '../lib/projects'
import type { Project } from '../lib/types'
import { isDashboard, type ViewSummary } from '../lib/views'
import { t } from '../lib/i18n'
import { hueFor, ReadAs, SidebarGroup, SidebarItem } from '../ui'
import { ActionMenu } from './menus/ActionMenu'
import { pinItem } from './menus/pinItem'
import { act } from './actionError'
import { taskDrop } from './taskDrop'
import { useMembershipMap } from '../lib/localData'
import { canEditTasks, roleOf } from '../lib/sharing'
import { LabelMenu } from './LabelsView'
import { ProjectRowMenu } from './ProjectRowMenu'
import { navigate, type Route } from './router'
import { openTasksLabel } from './Sidebar'
import { ProjectMark } from './ProjectMark'
import { ViewMark, ViewMenu } from './ViewsView'

const keyOf = (f: Pick<Favourite, 'kind' | 'id'>) => `${f.kind}:${f.id}`

/** A pinned note's menu: Pin to sidebar (checked, so choosing it unpins), Move up, Move down. */
function NoteFavouriteMenu({ id, name, favourites, className }: { id: string; name: string; favourites: Favourite[]; className: string }) {
  const { first, last } = favouriteEdges(favourites, 'note', id)
  return (
    <ActionMenu label={t('Menu for note {name}', { name })} title={name} groups={[
      { items: [pinItem(true, () => setFavourite('note', id, false))] },
      { items: [
        { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', shortcut: 'Alt+↑', disabled: first, reason: t('Already first'), onSelect: () => moveFavourite('note', id, -1) },
        { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', shortcut: 'Alt+↓', disabled: last, reason: t('Already last'), onSelect: () => moveFavourite('note', id, 1) },
      ] },
    ]} triggerClassName={`touch-target rounded-control px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised ${className}`} />
  )
}

export function FavouritesGroup({ favourites, route, collapsed, projects, tree, ownCounts, labelCounts, viewCounts, projectCountMode = 'hover', countsAll = false }: {
  favourites: Favourite[]
  route: Route
  /** The icon rail. */
  collapsed: boolean
  /** Every live project, for a sub-project's path in its tooltip. */
  projects: readonly Project[]
  /** The sidebar's tree and each project's own open, active tasks: a project's count here is its whole subtree's (D4). */
  tree: ProjectTree
  ownCounts: ReadonlyMap<string, number>
  labelCounts: Map<string, number>
  viewCounts: Map<string, ViewSummary>
  /** `always` where there is no hover (a coarse pointer). */
  projectCountMode?: 'always' | 'hover'
  /** Every sidebar count on (sidebar-polish D1): each row's count at rest, the menu in its place on hover. */
  countsAll?: boolean
}) {
  const memberships = useMembershipMap()
  const pinsProject = favourites.some((f) => f.kind === 'project')
  const projectCounts = useMemo(
    () => (pinsProject ? rollUpCounts(ownCounts, tree, new Set(tree.nodes.keys())) : new Map<string, number>()),
    [pinsProject, ownCounts, tree],
  )
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const pathOf = (p: Project) => projectPath(p, byId)
  // A moved row is re-rendered in its new place: keep the keyboard focus on it.
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    const key = refocus.current
    if (!key) return
    refocus.current = null
    document.querySelector<HTMLElement>(`[data-favourite="${CSS.escape(key)}"]`)?.focus()
  }, [favourites])
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, f: Favourite) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    e.stopPropagation()
    refocus.current = keyOf(f)
    act(moveFavourite(f.kind, f.id, e.key === 'ArrowUp' ? -1 : 1))
  }
  const menuClass = countsAll ? 'ui-swap-menu' : 'hover-reveal'
  const isActive = (f: Favourite) => (f.kind === 'note' ? route.view === 'notes' && route.id === f.id : route.view === f.kind && 'id' in route && route.id === f.id)

  return (
    <SidebarGroup title={t('Favourites')} collapsed={collapsed} testId="sidebar-favourites">
      {favourites.map((f) => {
        const common = {
          'data-favourite': keyOf(f), active: isActive(f), collapsed, onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onKey(e, f),
          onClick: () => navigate(f.kind === 'note' ? { view: 'notes', id: f.id } : { view: f.kind, id: f.id } as Route),
        }
        let item
        let menu
        if (f.kind === 'project') {
          item = <SidebarItem {...common} label={f.item.name} title={pathOf(f.item)} leading={<ProjectMark project={f.item} />}
            count={projectCounts.get(f.id)} countMode={countsAll ? 'swap' : projectCountMode} countLabel={openTasksLabel(projectCounts.get(f.id))} />
          menu = <ProjectRowMenu project={f.item} within="favourites" appearance className={menuClass} />
        } else if (f.kind === 'label') {
          const n = labelCounts.get(f.id)
          item = <SidebarItem {...common} label={f.item.name} count={n} countMode={countsAll ? 'swap' : 'hidden'} countLabel={openTasksLabel(n)}
            leading={<span data-hue={hueFor(f.item.color)} className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-hue-solid" />} />
          menu = <LabelMenu label={f.item} within="favourites" className={menuClass} />
        } else if (f.kind === 'note') {
          const name = f.item.title.trim() || t('Untitled note')
          item = <SidebarItem {...common} label={name} icon="notebook-pen" />
          menu = <NoteFavouriteMenu id={f.id} name={name} favourites={favourites} className={menuClass} />
        } else {
          const c = viewCounts.get(f.id)
          const list = !isDashboard(f.item)
          item = <SidebarItem {...common} label={f.item.name}
            leading={<span style={{ color: f.item.color }}><ViewMark view={f.item} /></span>}
            count={list && c && c.ok ? c.count : undefined} countMode={countsAll ? 'swap' : 'hidden'} countLabel={openTasksLabel(list && c && c.ok ? c.count : undefined)}
            badge={list && c && !c.ok ? <span className="text-meta text-danger"><ReadAs label={c.error}>!</ReadAs></span> : undefined} />
          menu = <ViewMenu view={f.item} within="favourites" className={menuClass} />
        }
        return (
          <div key={keyOf(f)} className={`group flex items-center rounded-control${countsAll ? ' ui-swap-row' : ''} data-drop-active:ring-2 data-drop-active:ring-accent`} data-favourite-row={keyOf(f)}
            data-task-drop={f.kind === 'project' ? (canEditTasks(roleOf(f.id, memberships)) ? taskDrop.project(f.id) : undefined) : f.kind === 'label' ? taskDrop.label(f.id) : undefined}>
            {item}
            {!collapsed && menu}
          </div>
        )
      })}
    </SidebarGroup>
  )
}
