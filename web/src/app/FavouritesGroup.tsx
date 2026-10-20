// The Favourites group (sidebar-favourites D4, app-shell "Favourites group"): the
// user's pinned projects, labels and saved filters, mixed, in the user's order, each
// with the mark of its own group, its count by the rule of its kind (a project's on
// hover, none on a label or a filter: quiet-sidebar D2) and the same menu. It has no chevron
// and no actions; Alt+↑ / Alt+↓ on a row moves it among the favourites.
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react'
import { moveFavourite, type Favourite } from '../lib/favourites'
import { subtreeOpenCounts, type ProjectTree } from '../lib/projects'
import type { Project, Task } from '../lib/types'
import { isDashboard, openCount, type ViewSummary } from '../lib/views'
import { t } from '../lib/i18n'
import { hueFor, Icon, ReadAs, SidebarGroup, SidebarItem } from '../ui'
import { act } from './actionError'
import { LabelMenu } from './LabelsView'
import { ProjectRowMenu } from './ProjectRowMenu'
import { navigate, type Route } from './router'
import { openTasksLabel, ProjectMark } from './Sidebar'
import { ViewMenu, viewIcon } from './ViewsView'

const keyOf = (f: Pick<Favourite, 'kind' | 'id'>) => `${f.kind}:${f.id}`

export function FavouritesGroup({ favourites, route, collapsed, projects, tree, openTasks, today, labelCounts, viewCounts, projectCountMode = 'hover' }: {
  favourites: Favourite[]
  route: Route
  /** The icon rail. */
  collapsed: boolean
  /** Every live project, for a sub-project's path in its tooltip. */
  projects: readonly Project[]
  /** The sidebar's tree and open tasks: a project's count here is its whole subtree's (D4). */
  tree: ProjectTree
  openTasks: readonly Task[]
  today: string
  labelCounts: Map<string, number>
  viewCounts: Map<string, ViewSummary>
  /** `always` where there is no hover (a coarse pointer). */
  projectCountMode?: 'always' | 'hover'
}) {
  const pinsProject = favourites.some((f) => f.kind === 'project')
  const projectCounts = useMemo(
    () => (pinsProject ? subtreeOpenCounts(openTasks.filter((tk) => openCount(tk, today)), tree) : new Map<string, number>()),
    [pinsProject, openTasks, tree, today],
  )
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const pathOf = (p: Project): string | undefined => {
    const names: string[] = []
    const seen = new Set<string>()
    for (let cur = p.parent_id ? byId.get(p.parent_id) : undefined; cur && !seen.has(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
      seen.add(cur.id)
      names.unshift(cur.name)
    }
    return names.length ? [...names, p.name].join(' › ') : undefined
  }
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
  const isActive = (f: Favourite) => (route.view === f.kind && 'id' in route && route.id === f.id)

  return (
    <SidebarGroup title={t('Favourites')} collapsed={collapsed} testId="sidebar-favourites">
      {favourites.map((f) => {
        const common = {
          'data-favourite': keyOf(f), active: isActive(f), collapsed, onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onKey(e, f),
          onClick: () => navigate({ view: f.kind, id: f.id } as Route),
        }
        let item
        let menu
        if (f.kind === 'project') {
          item = <SidebarItem {...common} label={f.item.name} title={pathOf(f.item)} leading={<ProjectMark project={f.item} />}
            count={projectCounts.get(f.id)} countMode={projectCountMode} countLabel={openTasksLabel(projectCounts.get(f.id))} />
          menu = <ProjectRowMenu project={f.item} within="favourites" className="hover-reveal" />
        } else if (f.kind === 'label') {
          const n = labelCounts.get(f.id)
          item = <SidebarItem {...common} label={f.item.name} count={n} countMode="hidden" countLabel={openTasksLabel(n)}
            leading={<span data-hue={hueFor(f.item.color)} className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-hue-solid" />} />
          menu = <LabelMenu label={f.item} within="favourites" className="hover-reveal" />
        } else {
          const c = viewCounts.get(f.id)
          const list = !isDashboard(f.item)
          item = <SidebarItem {...common} label={f.item.name}
            leading={<span style={{ color: f.item.color }}><Icon name={viewIcon(f.item)} /></span>}
            count={list && c && c.ok ? c.count : undefined} countMode="hidden" countLabel={openTasksLabel(list && c && c.ok ? c.count : undefined)}
            badge={list && c && !c.ok ? <span className="text-meta text-danger"><ReadAs label={c.error}>!</ReadAs></span> : undefined} />
          menu = <ViewMenu view={f.item} within="favourites" className="hover-reveal" />
        }
        return (
          <div key={keyOf(f)} className="group flex items-center" data-favourite-row={keyOf(f)}>
            {item}
            {!collapsed && menu}
          </div>
        )
      })}
    </SidebarGroup>
  )
}
