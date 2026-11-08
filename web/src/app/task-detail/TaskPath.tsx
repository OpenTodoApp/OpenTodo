// The path at the top of a task (GitHub issue 862): project, then every parent,
// then the task. Two or more parents fold the middle into one menu that stays
// next to its button on a phone, so the header remains one line.
import { type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { splitParents } from '../../lib/taskPath'
import { Icon, Menu, MenuItem } from '../../ui'

const crumbClass = 'min-h-6 rounded-control px-1 text-muted hover:bg-hover hover:text-default'

export interface TaskPathCrumb {
  label: string
  onClick: () => void
  /** A project colour mark before the name. */
  mark?: ReactNode
}

export interface TaskPathParent {
  id: string
  title: string
}

export function TaskPath({ origin, project, parents, current, onOpen, compact = false }: {
  /** The list the task was opened from, when that is not the project itself. */
  origin?: TaskPathCrumb | null
  /** The project, or Inbox when the task has neither a project nor an origin. */
  project?: TaskPathCrumb | null
  /** Parents from the furthest to the nearest. */
  parents: TaskPathParent[]
  current: string
  onOpen: (id: string) => void
  /** The docked panel's first line, a step smaller than the page title. */
  compact?: boolean
}) {
  const { hidden, shown } = splitParents(parents)
  const between = t('{n, plural, one {# parent in between} other {# parents in between}}', { n: hidden.length })
  const bits: { key: string; node: ReactNode }[] = []
  if (origin) {
    bits.push({
      key: 'origin',
      node: <button type="button" className={`min-w-0 truncate ${crumbClass}`} onClick={origin.onClick} data-crumb="origin">{origin.label}</button>,
    })
  }
  if (project) {
    bits.push({
      key: 'project',
      node: (
        <button type="button" className={`inline-flex min-w-0 items-center gap-1.5 ${crumbClass}`} onClick={project.onClick} data-crumb="project">
          {project.mark}<span className="truncate">{project.label}</span>
        </button>
      ),
    })
  }
  if (hidden.length) {
    bits.push({
      key: 'more',
      node: (
        <Menu anchored kind="menu" align="start" label={`… ${between}`}
          trigger={<span aria-hidden="true">…</span>}
          triggerClassName={`shrink-0 ${crumbClass}`}
          triggerProps={{ 'data-crumb': 'more' }}>
          {hidden.map((p) => (
            <MenuItem key={p.id} label={p.title || t('Untitled')} data-parent-id={p.id} onSelect={() => onOpen(p.id)} />
          ))}
        </Menu>
      ),
    })
  }
  for (const p of shown) {
    bits.push({
      key: p.id,
      node: (
        <button type="button" className={`min-w-0 truncate ${crumbClass}`} data-crumb="parent" data-parent-id={p.id} onClick={() => onOpen(p.id)}>
          {p.title || t('Untitled')}
        </button>
      ),
    })
  }
  bits.push({
    key: 'task',
    node: <span className="min-w-0 truncate px-1 text-strong" aria-current="page" data-crumb="task">{current}</span>,
  })

  return (
    <nav aria-label={t('Task path')} data-breadcrumb className={`flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden font-normal ${compact ? 'text-meta' : 'text-body'}`}>
      {bits.map((b, i) => (
        // A squeezed crumb keeps room for its chevron and an ellipsis and clips the rest,
        // so it never paints over the next one (GitHub issue 1050).
        <span key={b.key} className={`flex items-center gap-0.5 ${b.key === 'more' ? 'shrink-0' : `overflow-hidden has-focus-visible:overflow-visible ${i > 0 ? 'min-w-10' : 'min-w-8'}`}`}>
          {i > 0 && <Icon name="chevron-right" size="xs" className="shrink-0 text-faint" aria-hidden />}
          {b.node}
        </span>
      ))}
    </nav>
  )
}
