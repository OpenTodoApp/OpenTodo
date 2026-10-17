import { type ReactNode, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../lib/i18n'
import { Icon } from '../../ui'
import { isolate, trapTab, useOverlay } from '../../ui'

/**
 * The side sheet (in-app-assistant D9) on the overlay module's behaviour:
 * Escape through the overlay stack, focus moved in and back to the opener,
 * Tab trapped, the page behind locked. A right-hand sheet from 640 px up and a
 * full-screen sheet below, above the on-screen keyboard.
 */
export function AssistantSheet({ title, onClose, onEscape, children, footer, headerExtra }: {
  title: ReactNode
  onClose: () => void
  /** Escape: discards a focused proposal before it closes the panel. */
  onEscape?: () => void
  children: ReactNode
  footer?: ReactNode
  headerExtra?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useOverlay({ panel, onClose: onEscape ?? onClose })
  const tree = (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-end bg-scrim" data-overlay-root {...isolate}
      style={{ bottom: 'var(--vv-bottom, 0px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (panel.current) trapTab(e, panel.current); e.stopPropagation() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-overlay="dialog" data-assistant-panel
        className="flex h-full w-full flex-col bg-surface shadow-3 outline-none sm:max-w-md sm:border-l sm:border-default">
        <div className="flex items-center gap-1 border-b border-default pl-4 pr-1 pt-[env(safe-area-inset-top)]">
          <h2 id={titleId} className="min-w-0 flex-1 truncate py-2 text-body font-semibold">{title}</h2>
          {headerExtra}
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target my-1 px-2 text-h3 leading-none" onClick={onClose} aria-label={t('Close')} data-overlay-close><Icon name="x" size="md" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3" data-assistant-scroll>{children}</div>
        {footer && <div className="border-t border-default px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">{footer}</div>}
      </div>
    </div>
  )
  return typeof document === 'undefined' ? tree : createPortal(tree, document.body)
}
