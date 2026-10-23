// One header for every group of a task list (OpenSpec change ux-overhaul,
// task-list-presentation "Group headers"): a title, a count, a collapse control
// and trailing actions that appear on hover, focus or touch. Date groups, section
// groups, project groups, "Later" and "Sub-projects" all render through it. In a
// list it is a group bar (precision-rows D4): a 32 px strip on the raised surface with
// the label at the metadata size and medium weight in the default text tone, in
// sentence case whoever named the group, and the count in the faint tone. On a board
// column's sunken surface it stays a plain heading. No header is red: how late a task
// is shows on its row.
import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import { ReadAs } from '../Chips'
import { t } from '../../lib/i18n'

export interface ListGroupHeaderProps {
  title: ReactNode
  /** Open tasks beneath the header (omit to show none). */
  count?: number
  /** The count's tone: faint in lists, muted on a board column's sunken surface (surfaces-v2 D6). */
  countTone?: 'faint' | 'muted'
  /** `generated` by the view (a date, Earlier, Today, Blocked, Later, Completed, No section): uppercase; `named` by the user (a section, a project, a label): sentence case. */
  kind?: 'generated' | 'named'
  /** Collapsible groups show a chevron; the header's button toggles them. */
  collapsed?: boolean
  onToggle?: () => void
  /** Trailing actions (quick add, the section menu, a reveal control); hidden until hover, focus or touch. */
  actions?: ReactNode
  /** The actions are the group's purpose (Today's Earlier group): always visible, wrapping under the label on a phone. */
  actionsAlwaysVisible?: boolean
  /** Always-visible trailing text ("2 completed"). */
  note?: ReactNode
  /** Heading level inside the page; h2 under a page title. */
  level?: 2 | 3
  /** Marks the header's element for tests and drop targets. */
  testId?: string
  className?: string
  /** The filled group bar of a list; a board column passes false (its column is the surface). */
  bar?: boolean
}

/** The label's classes (precision-rows D4): one style whether the view or the user named the group; `kind` stays a hook for tests and drop targets. */
const GROUP_LABEL = 'min-w-0 truncate text-meta font-medium text-default'

export function ListGroupHeader({ title, count, countTone = 'faint', kind = 'generated', collapsed, onToggle, actions, actionsAlwaysVisible = false, note, level = 2, testId, className = '', bar = true }: ListGroupHeaderProps) {
  const H = level === 2 ? 'h2' : 'h3'
  const collapsible = onToggle !== undefined
  const text = (
    <>
      <span className={GROUP_LABEL} data-group-label={kind}>{title}</span>
      {count !== undefined && <span className={`text-meta tabular-nums ${countTone === 'muted' ? 'text-muted' : 'text-faint'}`} data-group-count><ReadAs label={t('{n, plural, one {# open task} other {# open tasks}}', { n: count })}>{count}</ReadAs></span>}
    </>
  )
  return (
    <div className={`group flex items-center gap-1.5 ${bar ? 'mt-2 mb-0.5 min-h-8 rounded-chip bg-raised px-2' : 'min-h-9 px-1'} ${actionsAlwaysVisible ? 'flex-wrap' : ''} ${className}`} data-group-header data-group-bar={bar || undefined} data-testid={testId} data-collapsed={collapsed || undefined}>
      <H className="flex min-w-0 flex-1 items-center">
        {collapsible ? (
          // Named by its visible title and count (WCAG 2.5.3 Label in Name); aria-expanded says whether it is open.
          <button type="button" className="flex min-w-0 items-center gap-1.5 rounded-control py-1 pr-1 text-left hover:text-strong"
            aria-expanded={!collapsed} onClick={onToggle} data-group-toggle>
            <Icon name="chevron-right" size="xs" className={`shrink-0 text-faint transition-transform duration-(--duration-ui) ${collapsed ? '' : 'rotate-90'}`} />
            {text}
          </button>
        ) : <span className="flex min-w-0 items-center gap-1.5 py-1">{text}</span>}
      </H>
      {note && <span className="text-meta text-faint" data-group-note>{note}</span>}
      {actions && <span className={`flex items-center gap-0.5 ${actionsAlwaysVisible ? 'flex-wrap' : 'hover-reveal'}`} data-group-actions={actionsAlwaysVisible ? 'always' : ''}>{actions}</span>}
    </div>
  )
}
