// A page's header on a phone (OpenSpec change phone-lists, design D3): the bar with
// the menu button, the page's own controls and its menu, then the title large with
// its lead line. It is fed the props a page gives its header on the desktop
// (PageHeaderDrawContext), so the title, the lead line, the actions and the menus
// are built once. The bar takes the title when the large one has scrolled away. A
// page places its header inside its own 16 px gutter, so the bar bleeds to the edges
// and the title starts 4 px inside the gutter, at the same place on every screen.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { Icon, IconButton, PageActions, type PageHeaderProps } from '../../ui'
import { useOwnBar } from '../chrome'
import { PhoneHeader } from './PhoneHeader'

/** What scrolls `el`: the nearest ancestor that scrolls, or null for the window. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}

export function PhonePageHeader({ title, meta, subtitle, leading, actions, barActions = false, overflow, menu, help, briefing, children, back, onMenu }: PageHeaderProps & {
  /** Opens the drawer. */
  onMenu: () => void
}) {
  // The screen does not scroll itself: it sits in whatever scrolls it (the shell's content, a pane).
  // The screen draws its own bar: the shell leaves its phone bar out.
  useOwnBar()
  const head = useRef<HTMLDivElement>(null)
  const [titled, setTitled] = useState(false)
  useEffect(() => {
    const el = head.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setTitled(!e.isIntersecting), { root: scrollParent(el), rootMargin: '-48px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const lead: ReactNode = meta ?? subtitle
  return (
    <>
      <PhoneHeader bleed title={typeof title === 'string' ? title : undefined} shown={titled}
        lead={back
          ? <a href={back.href ?? '#'} aria-label={back.label} data-page-back className="flex h-11 w-11 items-center justify-center rounded-control text-default focus-visible:outline-2 focus-visible:outline-focus"
              onClick={(e) => { e.preventDefault(); back.onClick() }}><Icon name="arrow-left" size="md" /></a>
          : <IconButton icon="menu" label={t('Open menu')} onClick={onMenu} className="touch-target" />}
        trailing={<PageActions actions={barActions ? actions : undefined} overflow={overflow} menu={menu} help={help} helpInMenu />} />
      <div className="px-1 pb-4 pt-1" data-phone-head>
        <div ref={head} className="flex min-w-0 items-center gap-2">
          {leading}
          {typeof title === 'string'
            ? <h1 tabIndex={-1} className="min-w-0 text-display text-strong outline-none" data-page-title>{title}</h1>
            : <h1 tabIndex={-1} className="flex min-w-0 items-center text-display text-strong outline-none" data-page-title>{title}</h1>}
        </div>
        {lead && <div className="mt-0.5 text-prose text-muted" data-page-meta data-phone-summary>{lead}</div>}
        {briefing && <div className="mt-2 text-prose text-muted" data-page-briefing>{briefing}</div>}
        {/* Actions a page did not fit for the bar's two slots stay in the page as a wrapping row, so nothing is pushed sideways. */}
        {actions && !barActions && <div className="mt-2 flex flex-wrap items-center gap-1" data-page-actions>{actions}</div>}
        {children && <div className="mt-2 flex flex-wrap items-center gap-2" data-page-secondary>{children}</div>}
      </div>
    </>
  )
}
