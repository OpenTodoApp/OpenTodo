import { useMemo, type ReactNode } from 'react'
import { useProjects } from '../lib/localData'
import { buildProjectTree, rollUpCounts } from '../lib/projects'
import { SUB_PROJECTS, subProjectsFoldedKey, type ListGroup } from '../lib/listGroups'
import type { Project } from '../lib/types'
import { Icon, ListGroupHeader } from '../ui'
import { navigate } from './router'
import { ProjectMark } from './ProjectMark'
import { useLiveOwnOpenCounts } from '../lib/liveTasks'
import { t } from '../lib/i18n'
import { taskDrop } from './taskDrop'
import { useCollapsedRows } from './task-list/collapsedRows'

/**
 * A sub-project's row (project-organization "Sub-projects inside a project view"): a task
 * row's columns (subprojects-above-tasks), the fold arrow in its leading slot when the list
 * offers it (subproject-inline D2), the mark in the checkbox column, the name opening the
 * sub-project and its subtree's open count. A dragged task drops on it while `drop` (D5).
 */
function SubProjectRow({ project, count, depth = 0, open = false, onToggle, drop = false }: {
  project: Project; count: number; depth?: number; open?: boolean; onToggle?: () => void; drop?: boolean
}) {
  return (
    <div className="row-hover flex items-center gap-2 rounded-control px-2 text-body data-drop-active:ring-2 data-drop-active:ring-accent"
      style={depth ? { paddingLeft: `${depth * 1.5 + 0.5}rem` } : undefined} data-sub-project-row={project.id} data-task-drop={drop ? taskDrop.project(project.id) : undefined}>
      <span aria-hidden={onToggle ? undefined : true} className="flex h-6 w-4 shrink-0 items-center justify-center">
        {onToggle && (
          <button type="button" aria-expanded={open} aria-label={open ? t('Collapse {name}', { name: project.name }) : t('Expand {name}', { name: project.name })}
            onClick={onToggle} data-sub-project-toggle
            className="flex h-5 w-4 items-center justify-center rounded-chip text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised pointer-fine:-mx-1 pointer-fine:h-6 pointer-fine:w-6 pointer-coarse:-mx-1 pointer-coarse:-my-2.5 pointer-coarse:h-11 pointer-coarse:w-11">
            <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />
          </button>
        )}
      </span>
      <button type="button" onClick={() => navigate({ view: 'project', id: project.id })} data-sub-project={project.id}
        className="flex min-h-9 min-w-0 flex-1 items-center gap-2 py-1.5 text-left pointer-coarse:min-h-11">
        <span className="flex w-5 shrink-0 items-center justify-center"><ProjectMark project={project} /></span>
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        <span className="text-meta tabular-nums text-faint">{count}<span className="sr-only"> {t('Open tasks including sub-projects')}</span></span>
      </button>
    </div>
  )
}

/**
 * The "Sub-projects" group at the top of a project view, from the list model (subproject-inline
 * D1): its bar, folded per project on this device, then each shown sub-project's row and, while
 * it is open, its rows one step in (`rows`). Derived from local data, so it is live and correct offline.
 */
export function SubProjectsGroup({ groups, projects, toggle, canEdit, rows }: {
  groups: readonly ListGroup[]
  projects: readonly Project[]
  toggle: (key: string) => void
  /** Whether the person may edit tasks of a project: its row then takes a dropped task. */
  canEdit: (projectId: string) => boolean
  rows: (g: ListGroup) => ReactNode
}) {
  const [bar, ...subs] = groups
  const byId = useMemo(() => new Map(projects.map((x) => [x.id, x])), [projects])
  return (
    <section className="mb-3" aria-label={t('Sub-projects')} data-sub-projects>
      <ListGroupHeader title={bar.heading ?? ''} count={bar.count} collapsed={bar.folded} onToggle={() => toggle(bar.openKey!)} />
      {subs.length > 0 && (
        <ul>
          {subs.map((g) => {
            const project = byId.get(g.subProject!)
            return project && (
              <li key={g.key} data-sub-project-block={project.id}>
                <SubProjectRow project={project} count={g.count ?? 0} depth={g.depth} open={!g.folded} onToggle={g.openKey ? () => toggle(g.openKey!) : undefined} drop={canEdit(project.id)} />
                {!g.folded && <div style={{ paddingLeft: `${((g.depth ?? 0) + 1) * 1.5}rem` }}>{rows(g)}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const NO_ROWS = () => null
const NO_DROP = () => false

/**
 * The Sub-projects group above a project's timeline (project-organization): its direct,
 * non-archived sub-projects with their subtree counts, no arrow, since the timeline's bars
 * are not list rows (subproject-inline D6). Renders nothing for a leaf project.
 */
export function SubProjects({ projectId }: { projectId: string }) {
  const projects = useProjects()
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  const children = tree.nodes.get(projectId)?.children
  const own = useLiveOwnOpenCounts()
  const counts = useMemo(() => rollUpCounts(own, tree, new Set(tree.nodes.keys())), [own, tree])
  const { collapsed, toggleCollapsed } = useCollapsedRows()
  if (!children?.length) return null
  const key = subProjectsFoldedKey(projectId)
  const folded = collapsed.has(key)
  const groups: ListGroup[] = [
    { key: SUB_PROJECTS, heading: t('Sub-projects'), count: children.length, folded, openKey: key, rows: [] },
    ...(folded ? [] : children.map((n): ListGroup => ({ key: n.id, heading: n.item.name, subProject: n.id, count: counts.get(n.id) ?? 0, folded: true, rows: [] }))),
  ]
  return <SubProjectsGroup groups={groups} projects={projects} toggle={toggleCollapsed} canEdit={NO_DROP} rows={NO_ROWS} />
}
