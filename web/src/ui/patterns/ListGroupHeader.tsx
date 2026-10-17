// One header for every group of a task list (OpenSpec change ux-overhaul,
// task-list-presentation "Group headers"): a title, a count, a collapse control
// and trailing actions that appear on hover, focus or touch. Date groups, section
// groups, project groups, "Later" and "Sub-projects" all render through it.
import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import { ReadAs } from '../Chips'
import { t } from '../../lib/i18n'

export interface ListGroupHeaderProps {
  title: ReactNode
  /** Open tasks beneath the header (omit to show none). */
  count?: number
  /** Overdue keeps the danger tone. */
  tone?: 'default' | 'danger' | 'muted'
  /** Collapsible groups show a chevron; the header's button toggles them. */
  collapsed?: boolean
  onToggle?: () => void
  /** Trailing actions (quick add, the section menu, a reveal control); hidden until hover, focus or touch. */
  actions?: ReactNode
  /** Always-visible trailing text ("2 completed"). */
  note?: ReactNode
  /** Heading level inside the page; h2 under a page title. */
  level?: 2 | 3
  /** Marks the header's element for tests and drop targets. */
  testId?: string
  className?: string
}

export function ListGroupHeader({ title, count, tone = 'default', collapsed, onToggle, actions, note, level = 2, testId, className = '' }: ListGroupHeaderProps) {
  const H = level === 2 ? 'h2' : 'h3'
  const color = tone === 'danger' ? 'text-danger' : tone === 'muted' ? 'text-muted' : 'text-default'
  const collapsible = onToggle !== undefined
  const text = (
    <>
      <span className={`min-w-0 truncate text-body font-semibold ${color}`}>{title}</span>
      {count !== undefined && <span className="text-meta tabular-nums text-faint" data-group-count><ReadAs label={t('{n, plural, one {# open task} other {# open tasks}}', { n: count })}>{count}</ReadAs></span>}
    </>
  )
  return (
    <div className={`group flex min-h-9 items-center gap-1.5 px-1 ${className}`} data-group-header data-testid={testId} data-collapsed={collapsed || undefined}>
      <H className="flex min-w-0 flex-1 items-center">
        {collapsible ? (
          // Named by its visible title and count (WCAG 2.5.3 Label in Name); aria-expanded says whether it is open.
          <button type="button" className="flex min-w-0 items-center gap-1.5 rounded-control py-1 pr-1 text-left hover:bg-sunken dark:hover:bg-raised"
            aria-expanded={!collapsed} onClick={onToggle} data-group-toggle>
            <Icon name="chevron-right" size="xs" className={`shrink-0 text-faint transition-transform duration-(--duration-ui) ${collapsed ? '' : 'rotate-90'}`} />
            {text}
          </button>
        ) : <span className="flex min-w-0 items-center gap-1.5 py-1">{text}</span>}
      </H>
      {note && <span className="text-meta text-faint" data-group-note>{note}</span>}
      {actions && <span className="flex items-center gap-0.5 hover-reveal" data-group-actions>{actions}</span>}
    </div>
  )
}
