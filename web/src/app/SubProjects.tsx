import { useMemo, type ReactNode } from 'react'
import { SUB_PROJECTS, type ListGroup } from '../lib/listGroups'
import type { Project } from '../lib/types'
import { Icon, ListGroupHeader } from '../ui'
import { navigate } from './router'
import { ProjectMark } from './ProjectMark'
import { t } from '../lib/i18n'
import { taskDrop } from './taskDrop'

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
    // → opens a folded sub-project and ← folds an open one, from either of its buttons, as on a tree.
    <div className="row-hover flex items-center gap-2 rounded-control px-2 text-body data-drop-active:ring-2 data-drop-active:ring-accent"
      style={depth ? { paddingLeft: `${depth * 1.5 + 0.5}rem` } : undefined} data-sub-project-row={project.id} data-task-drop={drop ? taskDrop.project(project.id) : undefined}
      onKeyDown={(e) => { if (onToggle && ((e.key === 'ArrowRight' && !open) || (e.key === 'ArrowLeft' && open))) { e.preventDefault(); e.stopPropagation(); onToggle() } }}>
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

const NO_ROWS = () => null
const NO_DROP = () => false

/** The Sub-projects bar and the sub-project groups that lead a project's groups (subproject-inline D1), or null. */
export const subProjectLead = (groups: readonly ListGroup[]): ListGroup[] | null =>
  groups[0]?.key === SUB_PROJECTS ? groups.filter((g) => g.key === SUB_PROJECTS || g.subProject) : null

/**
 * The "Sub-projects" group at the top of a project view, from the list model (subproject-inline
 * D1): its bar, folded per project on this device, then each shown sub-project's row and, while
 * it is open, its rows one step in (`rows`) and its own sub-projects as a nested list, so
 * assistive technology hears the nesting. Derived from local data, so it is live and correct offline.
 */
export function SubProjectsGroup({ groups, projects, toggle, canEdit = NO_DROP, rows = NO_ROWS }: {
  groups: readonly ListGroup[]
  projects: readonly Project[]
  toggle: (key: string) => void
  /** Whether the person may edit tasks of a project: its row then takes a dropped task. */
  canEdit?: (projectId: string) => boolean
  rows?: (g: ListGroup) => ReactNode
}) {
  const [bar, ...subs] = groups
  const byId = useMemo(() => new Map(projects.map((x) => [x.id, x])), [projects])
  // The groups are flat in render order, each with its depth: a deeper run is the nested list of the row above it.
  const level = (from: number, depth: number): [ReactNode[], number] => {
    const items: ReactNode[] = []
    let i = from
    while (i < subs.length && (subs[i].depth ?? 0) >= depth) {
      const g = subs[i++]
      let nested: ReactNode[] = []
      if (i < subs.length && (subs[i].depth ?? 0) > depth) [nested, i] = level(i, depth + 1)
      const project = byId.get(g.subProject!)
      if (!project) continue
      items.push(
        <li key={g.key} data-sub-project-block={project.id}>
          <SubProjectRow project={project} count={g.count ?? 0} depth={depth} open={!g.folded} onToggle={g.openKey ? () => toggle(g.openKey!) : undefined} drop={canEdit(project.id)} />
          {!g.folded && <div style={{ paddingLeft: `${(depth + 1) * 1.5}rem` }}>{rows(g)}</div>}
          {nested.length > 0 && <ul>{nested}</ul>}
        </li>,
      )
    }
    return [items, i]
  }
  if (!bar) return null
  return (
    <section className="mb-3" aria-label={t('Sub-projects')} data-sub-projects>
      <ListGroupHeader title={bar.heading ?? ''} count={bar.count} collapsed={bar.folded} onToggle={() => toggle(bar.openKey!)} />
      {subs.length > 0 && <ul>{level(0, 0)[0]}</ul>}
    </section>
  )
}
