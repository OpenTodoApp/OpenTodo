import { Icon } from '../../ui'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadHelp, type HelpBundle } from '../../lib/help'
import { navigate } from '../router'
import { trapTab } from '../overlay/stack'
import { isolate, useOverlay } from '../overlay/useOverlay'
import { HelpContent } from './HelpContent'

/**
 * Contextual help (OpenSpec change `user-documentation`, design D5): the guide
 * section for a screen in a panel at the right edge, a full-screen sheet on phones.
 * It opens over whatever is on screen (a dialog, a half-filled form) and leaves it
 * mounted, so closing the panel returns to it exactly as it was.
 */
export function HelpPanel({ screen, trigger, onClose }: { screen: string; trigger: HTMLElement | null; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const triggerRef = useRef(trigger)
  useOverlay({ panel, onClose, trigger: triggerRef })
  const [bundle, setBundle] = useState<HelpBundle | null>(null)
  const [failed, setFailed] = useState(false)
  const [at, setAt] = useState<{ slug: string; anchor?: string } | null>(null)
  useEffect(() => {
    loadHelp().then(({ bundle: b }) => {
      setBundle(b)
      const target = b.screens[screen]
      setAt(target ? { slug: target.page, anchor: target.anchor || undefined } : { slug: b.pages[0]?.slug ?? '' })
    }, () => setFailed(true))
  }, [screen])
  const page = bundle && at ? bundle.pages.find((p) => p.slug === at.slug) : undefined

  const tree = (
    <div className="fixed inset-0 z-[60] flex justify-end bg-scrim" data-overlay-root {...isolate}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (panel.current) trapTab(e, panel.current); e.stopPropagation() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={page ? `Help: ${page.title}` : 'Help'} tabIndex={-1} data-overlay="dialog" data-help-panel
        data-help-scroll className="h-full w-full overflow-y-auto overscroll-contain bg-surface shadow-xl outline-none sm:max-w-lg sm:border-l sm:border-default">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-default bg-surface pl-4 pr-1 pt-[env(safe-area-inset-top)]">
          <p className="min-w-0 flex-1 truncate py-2 text-base font-semibold">{page ? page.title : 'Help'}</p>
          {page && (
            <button type="button" className="btn-ghost touch-target px-2 text-xs" onClick={() => { onClose(); navigate({ view: 'help', page: page.slug }) }}>
              Open in Help
            </button>
          )}
          <button type="button" className="btn-ghost touch-target my-1 px-2 text-lg leading-none" onClick={onClose} aria-label="Close" title="Close" data-overlay-close><Icon name="x" size="md" /></button>
        </div>
        <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {failed && <p className="text-sm text-muted">Help could not be loaded. Reload the app and try again.</p>}
          {!failed && !page && <p className="text-sm text-muted" role="status">Loading…</p>}
          {page && <HelpContent page={page} anchor={at?.anchor} onOpen={(slug, anchor) => setAt({ slug, anchor })} />}
        </div>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? tree : createPortal(tree, document.body)
}
