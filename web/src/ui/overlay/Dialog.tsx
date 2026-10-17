import { Icon } from '../Icon'
import { type ReactNode, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { trapTab } from './stack'
import { isolate, useOverlay } from './useOverlay'
import { t } from '../../lib/i18n'

export interface DialogProps {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /** Width of the card from 640 px up. */
  size?: 'sm' | 'md' | 'lg'
  /** A tap outside closes (default). Off for destructive confirmations. */
  dismissable?: boolean
  role?: 'dialog' | 'alertdialog'
  /** Accessible name when the title is not plain text. */
  label?: string
  /** Extra classes for the body. */
  className?: string
  testId?: string
}

const WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg' }

/**
 * Prompts, confirmations and help (OpenSpec change `mobile-layout`): a centred card
 * from 640 px up; below 640 px, and whenever the content is taller than the screen,
 * a full-screen sheet. The overlay scrolls, not the card (a percentage max-height on
 * a centred flex child is unreliable on iOS Safari), and the header with the title
 * and the close button stays pinned. Mount it while open.
 */
export function Dialog({ title, onClose, children, size = 'sm', dismissable = true, role = 'dialog', label, className = '', testId }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useOverlay({ panel, onClose })
  const tree = (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain bg-scrim sm:p-4" data-overlay-root {...isolate}
      onClick={(e) => { if (dismissable && e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (panel.current) trapTab(e, panel.current); e.stopPropagation() }}>
      <div ref={panel} role={role} aria-modal="true" aria-labelledby={label ? undefined : titleId} aria-label={label} tabIndex={-1} data-overlay="dialog" data-testid={testId}
        className={`h-fit min-h-full w-full bg-surface outline-none sm:surface-overlay sm:my-auto sm:min-h-0 ${WIDTH[size]}`}>
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-default bg-inherit pl-4 pr-1 pt-[env(safe-area-inset-top)] sm:-top-4 sm:rounded-t-card">
          <h2 id={titleId} className="min-w-0 flex-1 py-2 text-body font-semibold">{title}</h2>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target my-1 px-2 text-h3 leading-none" onClick={onClose} aria-label={t('Close')} data-overlay-close><Icon name="x" size="md" /></button>
        </div>
        <div className={`p-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${className}`}>{children}</div>
      </div>
    </div>
  )
  // Rendered inline on the server (tests render to static markup), in a portal in the
  // browser so no ancestor's overflow or transform clips it.
  return typeof document === 'undefined' ? tree : createPortal(tree, document.body)
}
