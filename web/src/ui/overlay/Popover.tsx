import { Icon } from '../Icon'
import { type ReactNode, type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { place } from './position'
import { trapTab, useWide } from './stack'
import { isolate, useOverlay } from './useOverlay'
import { t } from '../../lib/i18n'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  /** The trigger: the panel is placed next to it from 640 px up, and focus returns to it. */
  anchor: RefObject<HTMLElement | null>
  /** Accessible name; also the title of the bottom sheet on phones. */
  label: string
  side?: 'bottom' | 'top'
  align?: 'start' | 'end'
  /** ARIA role of the panel; omit when the content carries its own (a listbox). */
  role?: 'dialog' | 'menu'
  /**
   * Modal (default): focus moves into the panel and the page behind does not scroll.
   * Non-modal is for combobox lists: focus stays in the field that drives them.
   */
  modal?: boolean
  /** Width of the anchored panel from 640 px up (Tailwind class). */
  width?: string
  /** Extra classes for the content (padding). */
  className?: string
  children: ReactNode
}

/** Whether `node` sits in an overlay root mounted after `own` (a nested picker), so above it. */
export function isAbove(node: Node, own: HTMLElement): boolean {
  const root = (node instanceof Element ? node : node.parentElement)?.closest('[data-overlay-root]')
  if (!root || root === own || root.contains(own) || own.contains(root)) return false
  return !!(own.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING)
}

/**
 * Menus, pickers and small panels (OpenSpec change `mobile-layout`): below 640 px a
 * bottom sheet across the screen with a title and a close button; from 640 px up a
 * panel next to its trigger, flipped and shifted to stay inside the viewport.
 */
export function Popover(p: PopoverProps) {
  if (!p.open) return null
  return <PopoverPanel {...p} />
}

function PopoverPanel({ onClose, anchor, label, side = 'bottom', align = 'end', role = 'dialog', modal = true, width = 'sm:w-56', className = '', children }: PopoverProps) {
  const wide = useWide()
  const panel = useRef<HTMLDivElement>(null)
  useOverlay({ panel, onClose, modal, trigger: anchor })
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight?: number; maxWidth?: number } | null>(null)

  const measure = useCallback(() => {
    const a = anchor.current, el = panel.current
    if (!wide || !a || !el) return
    const r = a.getBoundingClientRect()
    const vw = document.documentElement.clientWidth, vh = window.innerHeight
    // Measure the natural size: drop a previous height cap first.
    const prevMax = el.style.maxHeight
    el.style.maxHeight = ''
    const size = { width: el.offsetWidth, height: el.scrollHeight }
    el.style.maxHeight = prevMax
    const next = place(r, size, { width: vw, height: vh }, { side, align })
    setPos((cur) => (cur && cur.top === next.top && cur.left === next.left && cur.maxHeight === next.maxHeight && cur.maxWidth === next.maxWidth ? cur : next))
  }, [anchor, wide, side, align])

  useLayoutEffect(() => {
    if (!wide) return
    measure()
    // Scrolling inside the panel itself does not move its anchor: only outer scrolls re-place it
    // (re-placing on its own scroll kept a tall panel from ever holding still).
    const onMove = (e?: Event) => { if (e?.target instanceof Node && panel.current?.contains(e.target)) return; measure() }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    if (ro && panel.current) ro.observe(panel.current)
    // Tap outside closes; the trigger toggles on its own. A tap inside an overlay opened
    // after this one (a calendar or zone picker nested in it) is not outside either.
    const onDown = (e: PointerEvent) => {
      const item = e.target as Node
      if (panel.current?.contains(item) || anchor.current?.contains(item)) return
      if (panel.current && isAbove(item, panel.current)) return
      onCloseRef.current()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
      ro?.disconnect()
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [wide, measure, anchor])
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (modal && panel.current) trapTab(e, panel.current)
    isolate.onKeyDown(e)
  }
  const ariaRole = role && modal ? role : undefined

  if (typeof document === 'undefined') return null
  if (!wide) {
    return createPortal(
      <div className="fixed inset-0 z-50" data-overlay-root {...isolate} onKeyDown={onKeyDown} style={modal ? undefined : { pointerEvents: 'none' }}>
        {modal && <div className="absolute inset-0 bg-scrim" aria-hidden="true" onClick={onClose} data-overlay-backdrop />}
        {/* A menu sheet is a dialog whose list carries the menu role: the title and the
            close button may not sit inside a menu. */}
        <div ref={panel} role={ariaRole === 'menu' ? 'dialog' : ariaRole} aria-label={label} aria-modal={ariaRole ? true : undefined} tabIndex={-1} data-overlay="sheet"
          className="pointer-events-auto absolute inset-x-0 flex max-h-[80dvh] flex-col rounded-t-card border-t border-default bg-raised text-body shadow-3 outline-none"
          style={{ bottom: 'var(--vv-bottom, 0px)' }}>
          <div className="relative flex shrink-0 items-center gap-2 border-b border-default pl-4 pr-1 pt-2">
            <span aria-hidden="true" className="absolute left-1/2 top-1 h-1 w-10 -translate-x-1/2 rounded-full bg-faint" />
            <h2 className="min-w-0 flex-1 truncate text-body font-semibold">{label}</h2>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 text-h3 leading-none" aria-label={t('Close')} data-overlay-close
              onMouseDown={modal ? undefined : (e) => e.preventDefault()} onClick={onClose}><Icon name="x" size="md" /></button>
          </div>
          <div role={ariaRole === 'menu' ? 'menu' : undefined} aria-label={ariaRole === 'menu' ? label : undefined}
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] ${className}`}>{children}</div>
        </div>
      </div>,
      document.body,
    )
  }
  return createPortal(
    <div ref={panel} role={ariaRole} aria-label={label} tabIndex={-1} data-overlay="popover" data-overlay-root {...isolate} onKeyDown={onKeyDown}
      className={`surface-overlay fixed z-50 overflow-y-auto overscroll-contain text-body outline-none ${width} ${className}`}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, maxHeight: pos?.maxHeight, maxWidth: pos?.maxWidth, opacity: pos ? 1 : 0 }}>
      {children}
    </div>,
    document.body,
  )
}
