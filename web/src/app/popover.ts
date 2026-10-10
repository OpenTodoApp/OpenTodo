// Dropdowns built on <details> are absolutely positioned next to their summary. On
// phones headers wrap, so a right-aligned panel can open past the left edge (the
// view menu on a dashboard opened 122 px off screen). Used as the details' onToggle,
// this shifts an open panel back inside the viewport.

const MARGIN = 8

interface Rect { left: number; right: number }
interface Panel { style: { transform: string }; getBoundingClientRect(): Rect }
interface Details { open: boolean; querySelector(selector: string): Panel | null }

/** Horizontal shift that brings [left, right] inside a viewport of width `vw`. */
export function shiftIntoView(r: Rect, vw: number, margin = MARGIN): number {
  if (r.left < margin) return margin - r.left
  if (r.right > vw - margin) return Math.max(margin - r.left, vw - margin - r.right)
  return 0
}

export function keepInViewport(e: { currentTarget: Details }, vw = document.documentElement.clientWidth): void {
  const details = e.currentTarget
  const panel = details.querySelector(':scope > div, :scope > ul')
  if (!panel) return
  panel.style.transform = ''
  if (!details.open) return
  const dx = shiftIntoView(panel.getBoundingClientRect(), vw)
  if (dx) panel.style.transform = `translateX(${dx}px)`
}
