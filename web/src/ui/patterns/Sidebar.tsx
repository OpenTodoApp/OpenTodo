// Sidebar building blocks (OpenSpec change ux-overhaul, app-shell "Sidebar
// structure", design D2): one item for destinations, projects, labels and
// filters, and one group header. The app's Sidebar composes them; drag, keyboard
// moves and live counts stay in the app.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type RefObject, useEffect } from 'react'
import { Icon, type IconName } from '../Icon'
import { Tooltip } from '../Tooltip'

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
  /** Icon rail (app-shell "Resizable sidebar"): the icon only, the name as a tooltip. */
  collapsed?: boolean
}

/** A destination or an entity in the sidebar: icon or leading, label, badge, count. */
export const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(function SidebarItem(
  { label, icon, leading, count, badge, active = false, depth, collapsed = false, className, type = 'button', ...rest },
  ref,
) {
  const button = (
    <button ref={ref} type={type} aria-current={active ? 'page' : undefined} data-sidebar-item data-depth={depth}
      className={`flex min-h-9 w-full min-w-0 items-center gap-2 rounded-control py-1.5 text-left text-body pointer-fine:min-h-8 pointer-fine:py-1 ${collapsed ? 'justify-center px-0' : 'px-2'} ${active ? ACTIVE : IDLE}${className ? ` ${className}` : ''}`}
      {...rest}>
      {icon ? <span className="flex w-5 shrink-0 justify-center text-muted" aria-hidden="true"><Icon name={icon} /></span> : leading ? <span className="flex w-5 shrink-0 items-center justify-center">{leading}</span> : null}
      <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{label}</span>
      {!collapsed && badge}
      {!collapsed && count ? <span className="text-meta tabular-nums text-faint" data-count>{count}</span> : null}
    </button>
  )
  return collapsed && typeof label === 'string' ? <Tooltip label={label} side="right">{button}</Tooltip> : button
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
  /** A badge on the heading while the group is closed (unread updates in More). */
  badge?: ReactNode
  /** The number of items, shown on the heading while the group is closed (sidebar-groups). */
  count?: number
  /** Icon rail: no heading or actions, items only. */
  collapsed?: boolean
  /** Primary-level group (More): no top margin, items in the rail. */
  tight?: boolean
  children: ReactNode
  testId?: string
}

/** A titled group of items: Filters, Projects, Labels. */
export function SidebarGroup({ title, collapsible = false, open = true, onToggle, actions, label, badge, count, collapsed = false, tight = false, children, testId }: SidebarGroupProps) {
  const heading = collapsible ? (
    <button type="button" className="flex min-h-6 items-center gap-1 rounded-chip uppercase hover:text-muted" onClick={onToggle} aria-expanded={open}>
      <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />{title}
      {!open && count !== undefined && <span data-group-count className="ml-0.5 font-medium normal-case tracking-normal tabular-nums">{count}</span>}
      {!open && badge}
    </button>
  ) : <span className="flex min-h-6 items-center">{title}</span>
  return (
    <nav aria-label={label ?? title} data-sidebar-group={title} data-testid={testId}>
      {/* The heading sticks to the top of the sidebar's scroller while its rows scroll (app-shell "Sticky sidebar group headers"); the top padding, not a margin, keeps the canvas behind it. */}
      {!collapsed && (
        <div data-sidebar-group-header className={`${tight ? 'pt-2' : 'pt-5 pointer-fine:pt-4'} sticky top-0 z-10 flex items-center justify-between bg-canvas px-2 pb-1 text-hint font-semibold uppercase tracking-wide text-faint`}>
          {heading}
          {actions && <span className="flex items-center gap-1 normal-case">{actions}</span>}
        </div>
      )}
      {(!collapsible || open || collapsed) && <div className="space-y-0.5">{children}</div>}
    </nav>
  )
}

/** A small text action in a group header (All, New, Find). */
export const SidebarGroupAction = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }>(function SidebarGroupAction(
  { children, active = false, className, ...rest },
  ref,
) {
  return (
    <button ref={ref} type="button" className={`rounded-chip px-1.5 py-0.5 text-hint font-medium normal-case hover:bg-sunken dark:hover:bg-raised ${active ? 'text-accent' : 'text-faint hover:text-muted'}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </button>
  )
})

/**
 * Marks a scroller's edges for the fade masks of `.ui-scroller` (sidebar-compact-desktop):
 * `data-fade-top` while content is hidden above, `data-fade-bottom` while some is hidden
 * below, so a list that fits shows no fade at all.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      el.toggleAttribute('data-fade-top', el.scrollTop > 1)
      el.toggleAttribute('data-fade-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 1)
    }
    const later = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    el.addEventListener('scroll', later, { passive: true })
    // The scroller's own size (a resized window) and its content (a group opened or closed).
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(later) : null
    resize?.observe(el)
    const content = typeof MutationObserver === 'function' ? new MutationObserver(later) : null
    content?.observe(el, { childList: true, subtree: true })
    return () => {
      el.removeEventListener('scroll', later)
      resize?.disconnect()
      content?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ref])
}
