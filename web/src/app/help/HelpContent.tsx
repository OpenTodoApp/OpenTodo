import { type MouseEvent, useEffect, useRef } from 'react'
import type { HelpPage } from '../../lib/help'

/**
 * One guide's HTML (generated at build time from docs/, trusted, with only the
 * docs build's allow-listed tags). Links to other guides stay in the app
 * (`onOpen`), links to admin and developer pages open on the website in a new tab,
 * and `#anchor` links scroll within the guide.
 */
export function HelpContent({ page, anchor, onOpen }: { page: HelpPage; anchor?: string; onOpen: (slug: string, anchor?: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const target = anchor ? root.querySelector(`[id="${CSS.escape(anchor)}"]`) : null
    if (target) target.scrollIntoView({ block: 'start' })
    else root.closest('[data-help-scroll]')?.scrollTo({ top: 0 })
  }, [page.slug, anchor])

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest('a')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return
    const doc = a.getAttribute('data-doc')
    const href = a.getAttribute('href') ?? ''
    if (doc !== null) {
      e.preventDefault()
      onOpen(doc, href.split('#')[1])
    } else if (href.startsWith('#')) {
      e.preventDefault()
      ref.current?.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)?.scrollIntoView({ block: 'start' })
    }
  }

  // dangerouslySetInnerHTML: build-time content from docs/, see the docs build allow-list.
  return <div ref={ref} className="help-prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: page.html }} />
}
