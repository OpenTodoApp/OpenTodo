// The page template (OpenSpec change ux-overhaul, design-system "Page template
// primitives", app-shell "Page template"): every view renders a PageHeader (one
// title size, optional meta, at most two visible actions, an overflow menu and the
// Help action) inside a PageBody whose width is fixed per page type. The header
// stays visible while the content column scrolls. Every page shares one frame
// (ux-feedback-2 D7): centred, at most 80 rem, the same padding; the header spans
// it and the content's width applies left-aligned inside it (index.css
// `.page-frame`), so the title and actions never move between page types.
import { useEffect, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { openHelp } from '../../lib/helpRequest'
import { Menu } from '../overlay/Menu'
import { IconButton } from '../Button'
import { Icon, type IconName } from '../Icon'
import { setPageBar } from './pageBar'
import { DESKTOP_HEADER_QUERY, useMediaQuery } from '../useMediaQuery'
import { t } from '../../lib/i18n'

export type PageWidth = 'list' | 'form' | 'wide' | 'full'

/** The page frame (app-shell "Page template"): centred, at most 80 rem; `data-page-body` picks the content width. */
export const PAGE_FRAME = 'page-frame mx-auto min-w-0 w-full max-w-[80rem]'

export interface PageBodyProps extends HTMLAttributes<HTMLDivElement> {
  /** list: 48 rem (lists and feeds); form: 42 rem (settings and forms); wide: 72 rem (a list with field columns); full: the whole frame (boards, calendars). */
  width?: PageWidth
  /** No bottom padding: the page's own scroller (a board, the calendar grid) fills the column. */
  flush?: boolean
  children: ReactNode
}

/** A page: the shared frame with its padding; the content inside takes the page type's width, left-aligned. */
export function PageBody({ width = 'list', flush = false, className, children, ...rest }: PageBodyProps) {
  return (
    <div {...rest} data-page-body={width} className={`${PAGE_FRAME} px-4 md:px-8 ${flush ? '' : 'pb-6'}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}

export interface PageHeaderProps {
  /** The page title; a string renders in the page title size, a node (an inline rename field) is placed as is. */
  title: ReactNode
  /** Text beside the title: a date, a count, a read-only note. */
  meta?: ReactNode
  /** Below 768 px, a line under the title in the shell's bar (the board's current column); not rendered in the header's own row. */
  subtitle?: ReactNode
  /** Before the title: a colour dot or an icon. */
  leading?: ReactNode
  /** Up to two visible actions; everything else goes in `overflow`. */
  actions?: ReactNode
  /** Menu items (MenuItem, MenuSeparator) of the overflow menu. */
  overflow?: ReactNode
  /** A complete menu element in place of the default overflow (a menu with picker steps). */
  menu?: ReactNode
  /** Help screen id (docs front matter `screens`): shows the Help action. */
  help?: string
  /** A back action, shown before the title (phones, nested pages); `hideFrom: 'lg'` hides it where a side list takes its place. */
  back?: { label: string; href?: string; onClick: () => void; hideFrom?: 'lg' }
  /** The heading element, for focus after navigation. */
  titleRef?: Ref<HTMLHeadingElement>
  /** -1 lets a view move focus to the heading after navigation. */
  titleTabIndex?: -1
  /** Below 768 px the shell's bar carries the title; the header then shows only its actions. */
  level?: 1 | 2
  /** Stays visible while the content scrolls (default). */
  sticky?: boolean
  /** A second row, for a segmented control or tabs; counts against the interface budget. */
  children?: ReactNode
  icon?: IconName
  testId?: string
}

export function PageHeader({ title, subtitle, meta, leading, actions, overflow, menu, help, back, level = 1, sticky = true, children, icon, testId, titleRef, titleTabIndex }: PageHeaderProps) {
  const H = level === 1 ? 'h1' : 'h2'
  // The shell's phone bar shows this page's title and actions below 768 px (app-shell
  // "No desktop top bar"); the header's own row exists only above it, so the actions
  // (menus, dialogs, their shortcuts) are mounted once.
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  const ownRow = level !== 1 || desktop
  // The bar takes the title, Back, the overflow menu, the page menu and Help; the
  // page's own actions stay in the page as a wrapping row, so nothing is clipped at 360 px.
  useEffect(() => {
    if (ownRow) return
    setPageBar({ title, subtitle, overflow, menu, help, back })
    return () => setPageBar(null)
  })
  return (
    <header data-page-header data-testid={testId}
      className={`${sticky ? 'sticky top-0 z-10 -mx-4 bg-canvas/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-canvas/80 md:-mx-8 md:px-8' : ''} ${ownRow || actions ? 'mb-3 pb-3' : ''} ${level === 1 ? (ownRow ? 'pt-3 md:pt-5' : '') : 'pt-5'}`}>
      {!ownRow && actions && <div className="flex flex-wrap items-center gap-1 pt-2" data-page-actions>{actions}</div>}
      {ownRow && <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1" data-page-header-row>
        {back && (
          <a href={back.href ?? '#'} className={`ui-btn ui-btn--ghost ui-btn--sm -ml-2${back.hideFrom === 'lg' ? ' lg:hidden' : ''}`} data-page-back
            onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); back.onClick() }}>
            <Icon name="arrow-left" />{back.label}
          </a>
        )}
        {icon && <span className="flex h-6 w-6 shrink-0 items-center justify-center text-muted" aria-hidden="true"><Icon name={icon} size="md" /></span>}
        {leading}
        {typeof title === 'string'
          ? <H ref={titleRef} tabIndex={titleTabIndex} className="min-w-0 truncate text-h1 font-semibold text-strong outline-none" data-page-title>{title}</H>
          : <H ref={titleRef} tabIndex={titleTabIndex} className="flex min-w-0 items-center text-h1 font-semibold text-strong outline-none" data-page-title>{title}</H>}
        {meta && <span className="min-w-0 text-meta text-muted" data-page-meta>{meta}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1" data-page-actions>
          <PageActions actions={actions} overflow={overflow} menu={menu} help={help} />
        </div>
      </div>}
      {children && <div className="mt-2 flex flex-wrap items-center gap-2" data-page-secondary>{children}</div>}
    </header>
  )
}

/**
 * The page's title in the shell's phone bar (below 768 px): the level-one heading
 * there, since the header's own title row is hidden at that width.
 */
export function PageBarTitle({ children }: { children: ReactNode }) {
  return <h1 className="min-w-0 flex-1 truncate text-h3 font-semibold text-strong" data-phone-title>{children}</h1>
}

/** The right side of a page header or of the phone bar: actions, the overflow menu, Help. */
export function PageActions({ actions, overflow, menu, help }: Pick<PageHeaderProps, 'actions' | 'overflow' | 'menu' | 'help'>) {
  return (
    <>
      {actions}
      {menu}
      {overflow && (
        <Menu kind="menu" label={t('More actions')} trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-60">
          {overflow}
        </Menu>
      )}
      {help && <IconButton icon="circle-help" label={t('Help')} size="sm" data-help-screen={help} aria-haspopup="dialog" onClick={(e) => openHelp(help, e.currentTarget)} />}
    </>
  )
}
