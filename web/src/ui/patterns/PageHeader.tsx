// The page template (OpenSpec change ux-overhaul, design-system "Page template
// primitives", app-shell "Page template"): every view renders a PageHeader (one
// title size, optional meta, at most two visible actions, an overflow menu and the
// Help action) inside a PageBody whose width is fixed per page type. The header
// stays visible while the content column scrolls. Two frames (page-rhythm D3): a
// standalone page's frame is its content width plus the padding; a layout page (a
// project, the calendars) keeps the one 80 rem frame of ux-feedback-2 D7, so its
// title and actions never move between list, board and timeline. Both start at the
// column's left edge, so opening the panel moves nothing (list-stays-still D1,
// index.css `.page-frame`). The page's meta is a lead line under the title
// (page-rhythm D1), inside the one header element.
import { useEffect, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { openHelp } from '../../lib/helpRequest'
import { Menu } from '../overlay/Menu'
import { IconButton } from '../Button'
import { Icon, type IconName } from '../Icon'
import { TruncatedText } from '../TruncatedText'
import { setPageBar } from './pageBar'
import { DESKTOP_HEADER_QUERY, useMediaQuery } from '../useMediaQuery'
import { t } from '../../lib/i18n'

export type PageWidth = 'list' | 'form' | 'wide' | 'full'

/**
 * Which frame a page has (page-rhythm D3): `standalone` (no layout switch) is its
 * content width plus the padding; `layout` (a project, a board or timeline
 * view, the calendars) is the shared 80 rem frame, content from its left edge.
 */
export type PageFrame = 'standalone' | 'layout'

/** The page frame (app-shell "Page template"): at most 80 rem, at the column's left edge (index.css); `data-page-body` picks the content width, `data-page-frame` the frame. */
export const PAGE_FRAME = 'page-frame min-w-0 w-full max-w-[80rem]'

export interface PageBodyProps extends HTMLAttributes<HTMLDivElement> {
  /** list: 48 rem (lists and feeds); form: 42 rem (settings and forms); wide: 72 rem (a list with field columns); full: the whole frame (boards, calendars). */
  width?: PageWidth
  /** No bottom padding: the page's own scroller (a board, the calendar grid) fills the column. */
  flush?: boolean
  /** The frame (page-rhythm D3): standalone unless the page offers a layout switch; a `full` page is always a layout page. */
  frame?: PageFrame
  children: ReactNode
}

/** A page: its frame with the padding; the content inside takes the page type's width. */
export function PageBody({ width = 'list', flush = false, frame, className, children, ...rest }: PageBodyProps) {
  const kind = frameKind(width, frame)
  return (
    <div {...rest} data-page-body={width} data-page-frame={kind} className={`${PAGE_FRAME} px-4 md:px-8 ${flush ? '' : 'pb-6'}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}

/** The frame of a page: a `full` page fills the shared frame, so it is a layout page. */
export function frameKind(width: PageWidth, frame?: PageFrame): PageFrame {
  return width === 'full' ? 'layout' : frame ?? 'standalone'
}

export interface PageHeaderProps {
  /** The page title; a string renders in the page title size, a node (an inline rename field) is placed as is. */
  title: ReactNode
  /** The lead line under the title (page-rhythm D1): a date and totals, members and role, a count, a read-only note. */
  meta?: ReactNode
  /** Below 768 px, the line under the title in the shell's bar (the board's current column); defaults to the lead line. */
  subtitle?: ReactNode
  /** Before the title: a colour dot or an icon. */
  leading?: ReactNode
  /** Up to two visible actions; everything else goes in `overflow`. */
  actions?: ReactNode
  /** Below 768 px `actions` sit in the shell's bar (two slots at most) instead of a row in the page (phone-v2 D1). */
  barActions?: boolean
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

/** The page title at the display step (page-rhythm D1, tokens-v2). */
const TITLE = 'text-display text-strong'

export function PageHeader({ title, subtitle, meta, leading, actions, barActions = false, overflow, menu, help, back, level = 1, sticky = true, children, icon, testId, titleRef, titleTabIndex }: PageHeaderProps) {
  const H = level === 1 ? 'h1' : 'h2'
  // The shell's phone bar shows this page's title and actions below 768 px (app-shell
  // "No desktop top bar"); the header's own row exists only above it, so the actions
  // (menus, dialogs, their shortcuts) are mounted once.
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  const ownRow = level !== 1 || desktop
  // The bar takes the title, Back, the overflow menu, the page menu and Help; the
  // page's own actions stay in the page as a wrapping row, so nothing is clipped at 360 px,
  // unless the page fitted them into the bar's two slots (phone-v2 D1).
  useEffect(() => {
    if (ownRow) return
    setPageBar({ title, subtitle: subtitle ?? meta, overflow, menu, help, back, actions: barActions ? actions : undefined })
    return () => setPageBar(null)
  })
  // Everything went to the phone bar: no empty header row in the page.
  if (!ownRow && (!actions || barActions) && !children) return null
  return (
    <header data-page-header data-testid={testId}
      className={`${sticky ? 'sticky top-0 z-10 -mx-4 bg-canvas/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-canvas/80 md:-mx-8 md:px-8' : ''} ${ownRow || (actions && !barActions) ? 'mb-3 pb-3' : ''} ${level === 1 ? (ownRow ? 'pt-2 md:pt-4' : '') : 'pt-5'}`}>
      {!ownRow && actions && !barActions && <div className="flex flex-wrap items-center gap-1 pt-2" data-page-actions>{actions}</div>}
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
          ? <TruncatedText as={H} text={title} elRef={titleRef} tabIndex={titleTabIndex} className={`min-w-0 ${TITLE} outline-none`} data-page-title="" />
          : <H ref={titleRef} tabIndex={titleTabIndex} className={`flex min-w-0 items-center ${TITLE} outline-none`} data-page-title>{title}</H>}
        <div className="ml-auto flex shrink-0 items-center gap-1" data-page-actions>
          <PageActions actions={actions} overflow={overflow} menu={menu} help={help} />
        </div>
      </div>}
      {ownRow && meta && <div className="mt-1 min-w-0 text-meta text-muted" data-page-lead data-page-meta>{meta}</div>}
      {children && <div className="mt-2 flex flex-wrap items-center gap-2" data-page-secondary>{children}</div>}
    </header>
  )
}

/**
 * The page's title in the shell's phone bar (below 768 px): the level-one heading
 * there, since the header's own title row is hidden at that width.
 */
export function PageBarTitle({ children }: { children: ReactNode }) {
  // A plain title keeps its full text reachable when cut (ux-fixes-phone D2); an element
  // (a project's Rename button) cuts itself, so the bar's heading is a flex row.
  if (typeof children === 'string') return <TruncatedText as="h1" text={children} className="min-w-0 flex-1 text-h3 font-semibold text-strong" data-phone-title="" />
  return <h1 className="flex min-w-0 flex-1 items-center text-h3 font-semibold text-strong" data-phone-title>{children}</h1>
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
