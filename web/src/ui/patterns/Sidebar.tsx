// Sidebar building blocks (OpenSpec change ux-overhaul, app-shell "Sidebar
// structure", design D2): one item for destinations, projects, labels and
// filters, and one group header. The app's Sidebar composes them; drag, keyboard
// moves and live counts stay in the app.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'

const ACTIVE = 'bg-accent-soft font-medium text-on-accent-soft'
const IDLE = 'text-muted hover:bg-sunken hover:text-default dark:hover:bg-raised'

export interface SidebarItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: ReactNode
  /** An icon from the set, or `leading` for a colour dot or avatar. */
  icon?: IconName
  leading?: ReactNode
  /** A live count, shown quietly on the right. */
  count?: number
  /** A badge (unread changes) or a small marker (shared), before the count. */
  badge?: ReactNode
  active?: boolean
  /** Tree depth; indentation is applied by the row that owns the item, this only keeps the slot. */
  depth?: number
}

/** A destination or an entity in the sidebar: icon or leading, label, badge, count. */
export const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(function SidebarItem(
  { label, icon, leading, count, badge, active = false, depth, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} aria-current={active ? 'page' : undefined} data-sidebar-item data-depth={depth}
      className={`flex min-h-9 w-full min-w-0 items-center gap-2 rounded-control px-2 py-1.5 text-left text-body ${active ? ACTIVE : IDLE}${className ? ` ${className}` : ''}`}
      {...rest}>
      {icon ? <span className="flex w-5 shrink-0 justify-center text-muted" aria-hidden="true"><Icon name={icon} /></span> : leading ? <span className="flex w-5 shrink-0 items-center justify-center">{leading}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge}
      {count ? <span className="text-meta tabular-nums text-faint" data-count>{count}</span> : null}
    </button>
  )
})

export interface SidebarGroupProps {
  title: string
  /** Collapsible groups show a chevron and hide their children while closed. */
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
  /** Small actions on the right of the title (All, New). */
  actions?: ReactNode
  /** Accessible name of the group's navigation landmark; defaults to the title. */
  label?: string
  children: ReactNode
  testId?: string
}

/** A titled group of items: Filters, Projects, Labels. */
export function SidebarGroup({ title, collapsible = false, open = true, onToggle, actions, label, children, testId }: SidebarGroupProps) {
  const heading = collapsible ? (
    <button type="button" className="flex min-h-6 items-center gap-1 rounded-chip uppercase hover:text-muted" onClick={onToggle} aria-expanded={open}>
      <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />{title}
    </button>
  ) : <span className="flex min-h-6 items-center">{title}</span>
  return (
    <nav aria-label={label ?? title} data-sidebar-group={title} data-testid={testId}>
      <div className="mt-5 mb-1 flex items-center justify-between px-2 text-hint font-semibold uppercase tracking-wide text-faint">
        {heading}
        {actions && <span className="flex items-center gap-1 normal-case">{actions}</span>}
      </div>
      {(!collapsible || open) && <div className="space-y-0.5">{children}</div>}
    </nav>
  )
}

/** A small text action in a group header (All, New). */
export function SidebarGroupAction({ children, active = false, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" className={`rounded-chip px-1.5 py-0.5 text-hint font-medium normal-case hover:bg-sunken dark:hover:bg-raised ${active ? 'text-accent' : 'text-faint hover:text-muted'}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </button>
  )
}
