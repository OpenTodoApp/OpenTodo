// A page's header on a phone (OpenSpec change phone-lists, design D3): the bar with
// the menu button, the page's own controls and its menu, then the title large with
// its lead line. It is fed the props a page gives its header on the desktop
// (PageHeaderDrawContext), so the title, the lead line, the actions and the menus
// are built once. The bar takes the title when the large one has scrolled away.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { IconButton, PageActions, type PageHeaderProps } from '../../ui'
import { PhoneHeader } from './PhoneHeader'

/** What scrolls `el`: the nearest ancestor that scrolls, or null for the window. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}

export function PhonePageHeader({ title, meta, subtitle, leading, actions, overflow, menu, help, briefing, children, onMenu }: PageHeaderProps & {
  /** Opens the drawer. */
  onMenu: () => void
}) {
  // The screen does not scroll itself: it sits in whatever scrolls it (the shell's content, a pane).
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
      <PhoneHeader title={typeof title === 'string' ? title : undefined} shown={titled}
        lead={<IconButton icon="menu" label={t('Open menu')} onClick={onMenu} className="touch-target" />}
        trailing={<PageActions actions={actions} overflow={overflow} menu={menu} help={help} helpInMenu />} />
      <div className="px-5 pb-4 pt-1" data-phone-head>
        <div ref={head} className="flex min-w-0 items-center gap-2">
          {leading}
          {typeof title === 'string'
            ? <h1 tabIndex={-1} className="min-w-0 text-display text-strong outline-none" data-page-title>{title}</h1>
            : <h1 tabIndex={-1} className="flex min-w-0 items-center text-display text-strong outline-none" data-page-title>{title}</h1>}
        </div>
        {lead && <div className="mt-0.5 text-prose text-muted" data-page-meta data-phone-summary>{lead}</div>}
        {briefing && <div className="mt-2 text-prose text-muted" data-page-briefing>{briefing}</div>}
        {children && <div className="mt-2 flex flex-wrap items-center gap-2" data-page-secondary>{children}</div>}
      </div>
    </>
  )
}
