// Tooltip (OpenSpec change ux-overhaul, design-system "Tooltip primitive"): opens
// on hover after 400 ms and on focus at once, shows a label and an optional
// shortcut, closes on Escape and blur, is announced as the control's description
// and does not open on touch (the accessible name still applies). Focus that a
// press gives the control (a tap on a phone, a click) does not open it either,
// so a tapped menu button leaves no tip over the drawer it opened (issue 169). Icon-only
// buttons use it by default; screens never use the native `title` attribute.
import { cloneElement, type ReactElement, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface TooltipProps {
  /** What the control does, in a few words. */
  label: ReactNode
  /** The keyboard shortcut that runs it, shown beside the label. */
  shortcut?: string
  /** Where the tip opens relative to the control. */
  side?: 'top' | 'bottom' | 'right'
  /** The control: one element that accepts the pointer and focus handlers and `aria-describedby`. */
  children: ReactElement<Record<string, unknown>>
  /** Hover delay in milliseconds (focus opens at once). */
  delay?: number
  /** Never opens and leaves no text on the control (cut text that fits: TruncatedText). */
  disabled?: boolean
}

const GAP = 6

function coarsePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export function Tooltip({ label, shortcut, side = 'bottom', children, delay = 400, disabled = false }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLElement | null>(null)
  const tip = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Set between a press and its release: the focus it brings is not keyboard focus.
  const pressed = useRef(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const show = useCallback((immediate: boolean) => {
    clearTimeout(timer.current)
    if (disabled) return
    if (immediate) setOpen(true)
    else timer.current = setTimeout(() => setOpen(true), delay)
  }, [delay, disabled])
  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setOpen(false)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { if (disabled) hide() }, [disabled, hide])

  // Escape closes the tip wherever focus is (also from the control itself).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, hide])

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const a = anchor.current, t = tip.current
    if (!a || !t) return
    const r = a.getBoundingClientRect()
    const w = t.offsetWidth, h = t.offsetHeight
    const vw = document.documentElement.clientWidth, vh = window.innerHeight
    if (side === 'right') {
      // Beside the control (the collapsed sidebar's icon rail); falls back below it at the viewport's edge.
      const fits = r.right + GAP + w <= vw - 8
      const top = fits ? Math.max(8, Math.min(vh - h - 8, r.top + r.height / 2 - h / 2)) : r.bottom + GAP
      const left = fits ? r.right + GAP : Math.max(8, Math.min(vw - w - 8, r.left))
      setPos({ top, left })
      return
    }
    let top = side === 'bottom' ? r.bottom + GAP : r.top - h - GAP
    if (side === 'bottom' && top + h > vh) top = r.top - h - GAP
    if (side === 'top' && top < 0) top = r.bottom + GAP
    const left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2))
    setPos({ top: Math.max(0, top), left })
  }, [open, side])

  const child = children
  const described = [child.props['aria-describedby'] as string | undefined, open ? id : undefined].filter(Boolean).join(' ') || undefined
  const control = cloneElement(child, {
    ref: (el: HTMLElement | null) => {
      anchor.current = el
      const r = (child as unknown as { ref?: unknown }).ref ?? (child.props.ref as unknown)
      if (typeof r === 'function') r(el)
      else if (r && typeof r === 'object') (r as { current: HTMLElement | null }).current = el
    },
    'aria-describedby': described,
    // The tooltip's text on its control while closed: the interface audit's truncation
    // check (ux-audit-three-widths M10) finds the full text of a cut name here.
    'data-tip': !disabled && typeof label === 'string' ? label : undefined,
    onPointerEnter: (e: PointerEvent) => { (child.props.onPointerEnter as ((e: PointerEvent) => void) | undefined)?.(e); if (e.pointerType !== 'touch' && !coarsePointer()) show(false) },
    onPointerLeave: (e: PointerEvent) => { (child.props.onPointerLeave as ((e: PointerEvent) => void) | undefined)?.(e); hide() },
    onPointerDown: (e: PointerEvent) => { (child.props.onPointerDown as ((e: PointerEvent) => void) | undefined)?.(e); pressed.current = true; hide() },
    onPointerUp: (e: PointerEvent) => { (child.props.onPointerUp as ((e: PointerEvent) => void) | undefined)?.(e); pressed.current = false },
    onPointerCancel: (e: PointerEvent) => { (child.props.onPointerCancel as ((e: PointerEvent) => void) | undefined)?.(e); pressed.current = false },
    onFocus: (e: FocusEvent) => { (child.props.onFocus as ((e: FocusEvent) => void) | undefined)?.(e); if (!pressed.current) show(true) },
    onBlur: (e: FocusEvent) => { (child.props.onBlur as ((e: FocusEvent) => void) | undefined)?.(e); hide() },
  } as Record<string, unknown>)

  const tipNode = open ? (
    <div ref={tip} id={id} role="tooltip" data-tooltip
      className="overlay-fade-in pointer-events-none fixed z-[70] max-w-64 rounded-chip border border-strong bg-pop px-2 py-1 text-meta text-default shadow-2"
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}>
      <span>{label}</span>
      {shortcut && <><span className="mx-1 text-faint"> · </span><kbd className="ui-kbd">{shortcut}</kbd></>}
    </div>
  ) : null

  return (
    <>
      {control}
      {tipNode && (typeof document === 'undefined' ? tipNode : createPortal(tipNode, document.body))}
    </>
  )
}
