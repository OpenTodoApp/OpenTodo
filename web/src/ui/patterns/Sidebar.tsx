// Sidebar building blocks (OpenSpec change ux-overhaul, app-shell "Sidebar
// structure", design D2): one item for destinations, projects, labels and
// filters, and one group header. The app's Sidebar composes them; drag, keyboard
// moves and live counts stay in the app.
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type RefObject, useEffect } from 'react'
import { t } from '../../lib/i18n'
import { IconButton } from '../Button'
import { Icon, type IconName } from '../Icon'
import { Tooltip } from '../Tooltip'

// The row tones (sidebar-v2 D4): quiet at rest, default on hover and focus, strong on
// the accent tint when active. The icon follows the text, and turns accent when active.
const ACTIVE = 'bg-accent-soft font-medium text-strong'
const IDLE = 'text-faint hover:bg-sunken hover:text-default focus-visible:text-default dark:hover:bg-raised'

/** A group heading's type (sidebar-v2 D7): More's menu row uses it too, so the two read as one kind. */
export const SIDEBAR_HEADING = 'text-hint font-semibold uppercase tracking-wide text-faint'

export interface SidebarItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: ReactNode
  /** An icon from the set, or `leading` for a colour dot or avatar. */
  icon?: IconName
  leading?: ReactNode
  /** A live count, shown quietly on the right. */
  count?: number
  /**
   * When the count is visible (quiet-sidebar D1): `always`, `hover` (while the row is
   * hovered or focused; it keeps its width, so the row never moves) or `hidden`
   * (for assistive technology only). `data-open-count` carries it in every mode.
   */
  countMode?: 'always' | 'hover' | 'hidden'
  /** The count as words ("5 open tasks"), part of the row's accessible name. */
  countLabel?: string
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
  { label, icon, leading, count, countMode = 'always', countLabel, badge, active = false, depth, collapsed = false, className, type = 'button', ...rest },
  ref,
) {
  const quiet = countMode === 'hover' ? ' ui-reveal' : countMode === 'hidden' ? ' sr-only' : ''
  const button = (
    <button ref={ref} type={type} aria-current={active ? 'page' : undefined} data-sidebar-item data-depth={depth} data-tone={active ? 'active' : 'quiet'}
      className={`flex min-h-9 w-full min-w-0 items-center gap-2 rounded-control py-1.5 text-left text-body pointer-fine:min-h-8 pointer-fine:py-1 ${collapsed ? 'justify-center px-0' : 'px-2'} ${active ? ACTIVE : IDLE}${className ? ` ${className}` : ''}`}
      {...rest}>
      {icon ? <span className={`flex w-5 shrink-0 justify-center${active ? ' text-accent' : ''}`} aria-hidden="true"><Icon name={icon} /></span> : leading ? <span className="flex w-5 shrink-0 items-center justify-center">{leading}</span> : null}
      <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{label}</span>
      {!collapsed && badge}
      {!collapsed && count ? <span className={`text-meta tabular-nums text-faint${quiet}`} data-count data-open-count={count} aria-hidden={countLabel ? true : undefined}>{count}</span> : null}
      {count && countLabel ? <span className="sr-only">{`, ${countLabel}`}</span> : null}
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
  /** The number of items, shown on the heading while the group is closed (sidebar-groups) and part of its name in every state (sidebar-v2 D5). */
  count?: number
  /** Icon rail: no heading or actions, items only. */
  collapsed?: boolean
  /** Primary-level group (More): no top margin, items in the rail. */
  tight?: boolean
  children: ReactNode
  testId?: string
}

/**
 * A state marker (quiet-sidebar D4, app-shell "Quiet markers in the sidebar"): a small
 * dot in the accent colour, its meaning as hidden text, so the text is part of the
 * name of the row it sits in. Never a filled badge with text.
 */
export function StatusDot({ label, className, ...rest }: { label: string } & HTMLAttributes<HTMLSpanElement> & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <span className={`inline-flex shrink-0 items-center${className ? ` ${className}` : ''}`} {...rest}>
      <span data-dot aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="sr-only">{`, ${label}`}</span>
    </span>
  )
}

/** A titled group of items: Filters, Projects, Labels. */
export function SidebarGroup({ title, collapsible = false, open = true, onToggle, actions, label, badge, count, collapsed = false, tight = false, children, testId }: SidebarGroupProps) {
  // "Projects, 12 items" in every state; the visible number only while closed.
  const spoken = count !== undefined ? <span className="sr-only">{`, ${t('{n, plural, one {# item} other {# items}}', { n: count })}`}</span> : null
  const heading = collapsible ? (
    <button type="button" className="flex min-h-6 items-center gap-1 rounded-chip uppercase hover:text-muted focus-visible:text-muted" onClick={onToggle} aria-expanded={open}>
      <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />{title}
      {!open && count !== undefined && <span data-group-count aria-hidden="true" className="ml-0.5 font-medium normal-case tracking-normal tabular-nums">{count}</span>}
      {spoken}
      {!open && badge}
    </button>
  ) : <span className="flex min-h-6 items-center">{title}{spoken}</span>
  return (
    <nav aria-label={label ?? title} data-sidebar-group={title} data-testid={testId}>
      {/* The heading sticks to the top of the sidebar's scroller while its rows scroll (app-shell "Sticky sidebar group headers"); the top padding, not a margin, keeps the column's colour behind it (--sidebar-bg, set by the shell: sidebar-v2 D8). The actions show on hover and focus (D5). */}
      {!collapsed && (
        <div data-sidebar-group-header className={`${tight ? 'pt-2' : 'pt-5 pointer-fine:pt-4'} sticky top-0 z-10 flex items-center justify-between bg-(--sidebar-bg,var(--color-canvas)) px-2 pb-1 ${SIDEBAR_HEADING}`}>
          {heading}
          {actions && <span className="ui-reveal flex items-center gap-1 normal-case" data-group-actions>{actions}</span>}
        </div>
      )}
      {(!collapsible || open || collapsed) && <div className="space-y-0.5">{children}</div>}
    </nav>
  )
}

export interface SidebarHeaderProps {
  /** The left of the row: the mark and the name today, a workspace switcher later (sidebar-v2 D1). */
  left: ReactNode
  /** The icon rail: this alone, named by `railLabel` in a tooltip. */
  rail: ReactNode
  railLabel: string
  collapsed?: boolean
  /** Opens search and commands; the button sits at the right of the row (not in the rail, whose footer has it). */
  onSearch?: () => void
  searchLabel?: string
  searchShortcut?: string
}

/** The sidebar's first row (sidebar-v2 D1): a slot on the left, search and commands on the right. */
export function SidebarHeader({ left, rail, railLabel, collapsed = false, onSearch, searchLabel, searchShortcut }: SidebarHeaderProps) {
  return (
    <div data-sidebar-header className={`mb-3 flex min-h-9 items-center gap-2 pointer-fine:mb-2 pointer-fine:min-h-8 ${collapsed ? 'justify-center' : 'px-1'}`}>
      {collapsed
        ? <Tooltip label={railLabel} side="right"><span role="img" aria-label={railLabel} className="flex">{rail}</span></Tooltip>
        : <div className="flex min-w-0 flex-1 items-center gap-2">{left}</div>}
      {!collapsed && onSearch && searchLabel && (
        <IconButton icon="search" label={searchLabel} shortcut={searchShortcut} size="sm" onClick={onSearch}
          aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" data-palette-button />
      )}
    </div>
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
