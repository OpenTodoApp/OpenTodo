// The page template (OpenSpec change ux-overhaul, design-system "Page template
// primitives", app-shell "Page template"): every view renders a PageHeader (one
// title size, optional meta, at most two visible actions, an overflow menu and the
// Help action) inside a PageBody whose width is fixed per page type. The header
// stays visible while the content column scrolls.
import type { HTMLAttributes, ReactNode } from 'react'
import { openHelp } from '../../app/help/store'
import { Menu } from '../../app/overlay/Menu'
import { IconButton } from '../Button'
import { Icon, type IconName } from '../Icon'

export type PageWidth = 'list' | 'form' | 'full'

const WIDTH: Record<PageWidth, string> = {
  list: 'max-w-3xl',
  form: 'max-w-2xl',
  full: '',
}

export interface PageBodyProps extends HTMLAttributes<HTMLDivElement> {
  /** list: 48 rem (lists and feeds); form: 42 rem (settings and forms); full: the whole column (boards, calendars). */
  width?: PageWidth
  children: ReactNode
}

/** The content column of a page: horizontal padding and one width per page type. */
export function PageBody({ width = 'list', className, children, ...rest }: PageBodyProps) {
  return (
    <div {...rest} data-page-body={width} className={`mx-auto min-w-0 w-full px-4 pb-6 md:px-8 ${WIDTH[width]}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}

export interface PageHeaderProps {
  /** The page title; a string renders in the page title size, a node (an inline rename field) is placed as is. */
  title: ReactNode
  /** Text beside the title: a date, a count, a read-only note. */
  meta?: ReactNode
  /** Before the title: a colour dot or an icon. */
  leading?: ReactNode
  /** Up to two visible actions; everything else goes in `overflow`. */
  actions?: ReactNode
  /** Menu items (MenuItem, MenuSeparator) of the overflow menu. */
  overflow?: ReactNode
  /** Help screen id (docs front matter `screens`): shows the Help action. */
  help?: string
  /** A back action, shown before the title (phones, nested pages). */
  back?: { label: string; href?: string; onClick: () => void }
  /** Below 768 px the shell's bar carries the title; the header then shows only its actions. */
  level?: 1 | 2
  /** Stays visible while the content scrolls (default). */
  sticky?: boolean
  /** A second row, for a segmented control or tabs; counts against the interface budget. */
  children?: ReactNode
  icon?: IconName
  testId?: string
}

export function PageHeader({ title, meta, leading, actions, overflow, help, back, level = 1, sticky = true, children, icon, testId }: PageHeaderProps) {
  const H = level === 1 ? 'h1' : 'h2'
  return (
    <header data-page-header data-testid={testId}
      className={`${sticky ? 'sticky top-0 z-10 -mx-4 bg-canvas/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-canvas/80 md:-mx-8 md:px-8' : ''} mb-3 pt-5 pb-3`}>
      <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1">
        {back && (
          <a href={back.href ?? '#'} className="ui-btn ui-btn--ghost ui-btn--sm -ml-2" data-page-back
            onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); back.onClick() }}>
            <Icon name="arrow-left" />{back.label}
          </a>
        )}
        {icon && <span className="flex h-6 w-6 shrink-0 items-center justify-center text-muted" aria-hidden="true"><Icon name={icon} size="md" /></span>}
        {leading}
        {typeof title === 'string' ? <H className="min-w-0 truncate text-h1 font-semibold text-strong" data-page-title>{title}</H> : <H className="flex min-w-0 items-center text-h1 font-semibold text-strong" data-page-title>{title}</H>}
        {meta && <span className="min-w-0 text-meta text-muted" data-page-meta>{meta}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1" data-page-actions>
          {actions}
          {overflow && (
            <Menu kind="menu" label="More actions" trigger={<Icon name="ellipsis" size="md" />} triggerClassName="btn-ghost touch-target px-2 py-1.5" width="sm:w-60">
              {overflow}
            </Menu>
          )}
          {help && <IconButton icon="circle-help" label="Help" size="sm" data-help-screen={help} aria-haspopup="dialog" onClick={(e) => openHelp(help, e.currentTarget)} />}
        </div>
      </div>
      {children && <div className="mt-2 flex flex-wrap items-center gap-2" data-page-secondary>{children}</div>}
    </header>
  )
}
