// Anchored placement for popovers from 640 px up (OpenSpec change `mobile-layout`,
// design D1): put the panel on the preferred side of its trigger, flip to the other
// side when it does not fit, and shift it so the whole panel stays `margin` px inside
// the viewport. A few lines instead of a positioning library.

export interface AnchorRect { top: number; left: number; right: number; bottom: number }
export interface Size { width: number; height: number }
export interface PlaceOptions {
  side?: 'bottom' | 'top'
  align?: 'start' | 'end'
  /** Gap between trigger and panel. */
  gap?: number
  /** Minimum distance from the viewport edges. */
  margin?: number
  /** The safe areas (GitHub issue 973): added to the margin on each edge, so no panel runs under the notch, the Dynamic Island, the home indicator or a rounded side. */
  insets?: Insets
}
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Placement {
  top: number
  left: number
  side: 'bottom' | 'top'
  /** Set when the panel is taller than the space on the chosen side; it then scrolls. */
  maxHeight?: number
  /** Set when the panel is wider than the viewport minus the margins. */
  maxWidth?: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function place(anchor: AnchorRect, panel: Size, viewport: Size, opts: PlaceOptions = {}): Placement {
  const { side: preferred = 'bottom', align = 'end', gap = 4, margin = 8, insets } = opts
  const out: Placement = { top: 0, left: 0, side: preferred }
  const m = { top: margin + (insets?.top ?? 0), right: margin + (insets?.right ?? 0), bottom: margin + (insets?.bottom ?? 0), left: margin + (insets?.left ?? 0) }

  // Horizontal: align to the trigger's start or end edge, then shift inside.
  const room = viewport.width - m.left - m.right
  const width = Math.min(panel.width, room)
  if (panel.width > room) out.maxWidth = room
  const ideal = align === 'end' ? anchor.right - width : anchor.left
  out.left = clamp(ideal, m.left, viewport.width - m.right - width)

  // Vertical: preferred side unless it does not fit and the other side has more room.
  const below = viewport.height - m.bottom - (anchor.bottom + gap)
  const above = anchor.top - gap - m.top
  let side = preferred
  const fits = (s: 'bottom' | 'top') => (s === 'bottom' ? below : above) >= panel.height
  if (!fits(side) && (side === 'bottom' ? above > below : below > above)) side = side === 'bottom' ? 'top' : 'bottom'
  out.side = side
  const space = Math.max(0, side === 'bottom' ? below : above)
  const height = Math.min(panel.height, space)
  if (panel.height > space) out.maxHeight = space
  out.top = side === 'bottom' ? anchor.bottom + gap : anchor.top - gap - height
  out.top = clamp(out.top, m.top, Math.max(m.top, viewport.height - m.bottom - height))
  return out
}
