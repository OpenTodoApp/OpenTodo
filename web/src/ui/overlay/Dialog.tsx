import { Icon } from '../Icon'
import { type ReactNode, useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clearExits, playExit } from './exit'
import { trapTab } from './stack'
import { isolate, useOverlay } from './useOverlay'
import { t } from '../../lib/i18n'

export interface DialogProps {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /** Width of the card from 640 px up. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** A tap outside closes (default). Off for destructive confirmations. */
  dismissable?: boolean
  role?: 'dialog' | 'alertdialog'
  /** Accessible name when the title is not plain text. */
  label?: string
  /** Extra classes for the body. */
  className?: string
  testId?: string
  /**
   * Below 640 px: `center` (default) is a full-screen sheet; `sheet` is anchored to the
   * bottom, at most two thirds of the screen high, with curved top corners, the page
   * visible above it and its body scrolling inside (lean-chrome D3, used by the start
   * guide). It slides up within the emphasis duration and only fades under reduced
   * motion. From 640 px up both are the same centred card, which fades and scales up.
   * `palette` (the command bar, palette-quick-add D4): the full-screen sheet below 640 px;
   * from 640 px a 40 rem card 12 vh from the top, without a visible title bar or body
   * padding, so the content brings its own field and footer.
   */
  placement?: 'center' | 'sheet' | 'palette'
  /**
   * What Escape does, when it is not closing: a dialog with a second view (the template
   * library's detail) steps back first. The close button and a tap outside still close.
   */
  onEscape?: () => void
  /**
   * `dialog` (default): enters with the dialog motion and leaves faster; `fade`: fades in
   * over the interface duration and closes at once, as menus do (the command palette).
   */
  motion?: 'dialog' | 'fade'
}

const WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-5xl' }
const HEADER = 'sticky top-0 z-10 flex items-center gap-2 border-b border-default bg-inherit pl-4 pr-1 pt-[env(safe-area-inset-top)] sm:-top-4 sm:rounded-t-card'
// The sheet sits at the bottom, below the notch: no top inset, its own curved corners.
const HEADER_SHEET = 'sticky top-0 z-10 flex items-center gap-2 rounded-t-card border-b border-default bg-inherit pl-4 pr-1 sm:-top-4'
const CARD = {
  center: 'h-fit min-h-full w-full bg-surface outline-none sm:surface-overlay sm:my-auto sm:min-h-0',
  palette: 'h-fit min-h-full w-full bg-surface outline-none sm:surface-overlay sm:mt-[12vh] sm:mb-auto sm:min-h-0 sm:overflow-hidden sm:max-w-[40rem]',
  sheet: 'dialog-sheet mt-auto h-fit max-h-[66dvh] w-full overflow-y-auto overscroll-contain rounded-t-card border-t border-default bg-surface shadow-3 outline-none sm:surface-overlay sm:my-auto sm:max-h-none sm:overflow-visible sm:border-t-0',
}

/**
 * Prompts, confirmations and help (OpenSpec change `mobile-layout`): a centred card
 * from 640 px up; below 640 px, and whenever the content is taller than the screen,
 * a full-screen sheet. The overlay scrolls, not the card (a percentage max-height on
 * a centred flex child is unreliable on iOS Safari), and the header with the title
 * and the close button stays pinned. Mount it while open. `placement="sheet"` keeps
 * the page visible above a bottom sheet on phones instead (see the prop).
 */
export function Dialog({ title, onClose, children, size = 'sm', dismissable = true, role = 'dialog', label, className = '', testId, placement = 'center', onEscape, motion = 'dialog' }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useOverlay({ panel, onClose: onEscape ?? onClose })
  // The exit (web-app "Overlay motion", motion-v2 D5) plays on a copy once this unmounts.
  useLayoutEffect(() => {
    clearExits()
    const el = root.current
    return () => { if (motion === 'dialog') playExit(el, { closing: '.dialog-card', className: 'overlay-scrim-exit' }) }
  }, [motion])
  const tree = (
    <div ref={root} className="fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain bg-scrim sm:p-4" data-overlay-root {...isolate}
      onClick={(e) => { if (dismissable && e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (panel.current) trapTab(e, panel.current); e.stopPropagation() }}>
      <div ref={panel} role={role} aria-modal="true" aria-labelledby={label ? undefined : titleId} aria-label={label} tabIndex={-1} data-overlay="dialog" data-testid={testId}
        data-placement={placement === 'center' ? undefined : placement} className={`${CARD[placement]} ${motion === 'fade' ? 'overlay-fade-in' : 'dialog-card'} ${placement === 'palette' ? '' : WIDTH[size]}`}>
        <div className={placement === 'sheet' ? HEADER_SHEET : placement === 'palette' ? `${HEADER} sm:hidden` : HEADER}>
          <h2 id={titleId} className="min-w-0 flex-1 py-2 text-body font-semibold">{title}</h2>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target my-1 px-2 text-h3 leading-none" onClick={onClose} aria-label={t('Close')} data-overlay-close><Icon name="x" size="md" /></button>
        </div>
        <div className={`${placement === 'palette' ? 'pb-[env(safe-area-inset-bottom)]' : 'p-4 pb-[max(1rem,env(safe-area-inset-bottom))]'} ${className}`}>{children}</div>
      </div>
    </div>
  )
  // Rendered inline on the server (tests render to static markup), in a portal in the
  // browser so no ancestor's overflow or transform clips it.
  return typeof document === 'undefined' ? tree : createPortal(tree, document.body)
}
