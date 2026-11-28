// The path at the top of a task (GitHub issue 862): project, then every parent,
// then the task. Two or more parents fold the middle into one menu that stays
// next to its button on a phone, so the header remains one line.
import { type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { splitParents } from '../../lib/taskPath'
import { Icon, Menu, MenuItem, TruncatedText, useCut } from '../../ui'

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

/**
 * The nearest step up in a narrow header (tablet-header-room D5): a back arrow and the
 * step's name. The name shows whole or not at all; while it does not fit, the arrow
 * alone leads back and carries the name for a screen reader.
 */
function BackStep({ label, onClick, mark, attrs }: { label: string; onClick: () => void; mark?: ReactNode; attrs: Record<`data-${string}`, string | undefined> }) {
  const [ref, cut] = useCut<HTMLSpanElement>()
  return (
    <button type="button" className={`inline-flex min-w-0 items-center gap-1.5 ${crumbClass}`} onClick={onClick} aria-label={cut ? label : undefined} data-crumb-back {...attrs}>
      <Icon name="arrow-left" size="sm" className="shrink-0" aria-hidden />
      <span ref={ref} className={`inline-flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap ${cut ? 'invisible' : ''}`}>{mark}{label}</span>
    </button>
  )
}

export function TaskPath({ origin, project, parents, current, onOpen, compact = false, nearestOnly = false, back = false }: {
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
  /**
   * A phone's header (GitHub issue 1050): only the nearest step up, at full width. The task's
   * own title is the page below, and the steps further up are one tap away from that step.
   */
  nearestOnly?: boolean
  /** With `nearestOnly`, in a header's own row: the step is a back arrow with its name, whole or not at all. */
  back?: boolean
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
    // Cut, it shows the whole title on hover and keyboard focus.
    node: <TruncatedText text={current} className="min-w-0 px-1 text-strong" aria-current="page" data-crumb="task" />,
  })

  const nearest = shown.at(-1)
  const step = nearest ? { label: nearest.title || t('Untitled'), onClick: () => onOpen(nearest.id), attrs: { 'data-crumb': 'parent', 'data-parent-id': nearest.id } }
    : project ? { ...project, attrs: { 'data-crumb': 'project' } }
    : origin ? { ...origin, attrs: { 'data-crumb': 'origin' } } : null
  const shownBits = !nearestOnly ? bits : back && step ? [{ key: 'back', node: <BackStep {...step} /> }] : bits.slice(-2, -1)

  return (
    <nav aria-label={t('Task path')} data-breadcrumb className={`flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden font-normal ${compact ? 'text-meta' : 'text-body'}`}>
      {shownBits.map((b, i) => (
        // A squeezed crumb keeps room for its chevron and an ellipsis and clips the rest,
        // so it never paints over the next one (GitHub issue 1050). The task's own title,
        // whole on the page below, takes only the room the steps up leave (basis 0), so they
        // keep their whole names while they fit (GitHub issue 2134).
        <span key={b.key} className={`flex items-center gap-0.5 ${b.key === 'more' ? 'shrink-0' : `overflow-hidden has-focus-visible:overflow-visible ${i > 0 ? 'min-w-10' : 'min-w-8'}${b.key === 'task' ? ' grow basis-0' : ''}`}`}>
          {i > 0 && <Icon name="chevron-right" size="xs" className="shrink-0 text-faint" aria-hidden />}
          {b.node}
        </span>
      ))}
    </nav>
  )
}
