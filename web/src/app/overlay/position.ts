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
}
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
  const { side: preferred = 'bottom', align = 'end', gap = 4, margin = 8 } = opts
  const out: Placement = { top: 0, left: 0, side: preferred }

  // Horizontal: align to the trigger's start or end edge, then shift inside.
  const room = viewport.width - 2 * margin
  const width = Math.min(panel.width, room)
  if (panel.width > room) out.maxWidth = room
  const ideal = align === 'end' ? anchor.right - width : anchor.left
  out.left = clamp(ideal, margin, viewport.width - margin - width)

  // Vertical: preferred side unless it does not fit and the other side has more room.
  const below = viewport.height - margin - (anchor.bottom + gap)
  const above = anchor.top - gap - margin
  let side = preferred
  const fits = (s: 'bottom' | 'top') => (s === 'bottom' ? below : above) >= panel.height
  if (!fits(side) && (side === 'bottom' ? above > below : below > above)) side = side === 'bottom' ? 'top' : 'bottom'
  out.side = side
  const space = Math.max(0, side === 'bottom' ? below : above)
  const height = Math.min(panel.height, space)
  if (panel.height > space) out.maxHeight = space
  out.top = side === 'bottom' ? anchor.bottom + gap : anchor.top - gap - height
  out.top = clamp(out.top, margin, Math.max(margin, viewport.height - margin - height))
  return out
}
