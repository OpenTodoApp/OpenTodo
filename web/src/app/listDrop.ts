// Within-list drop placement (OpenSpec `manual-ordering`, design D5): which part of
// a row the pointer is over decides where a dragged task or project lands. Pure, so
// the rule is tested without a browser; lib/dnd supplies the pointer position.
import type { Placement } from '../lib/ordering'

export type DropZone = 'before' | 'after' | 'inside'

/** A drop indicator: the row under the pointer and the zone of it. */
export interface DropAt {
  id: string
  zone: DropZone
}

/**
 * The zone for a pointer at `y` over a row spanning [top, top + height]. With
 * nesting allowed (tree lists, the sidebar) the top and bottom quarters place
 * before / after and the middle nests inside; otherwise (board cards) the halves.
 */
export function dropZone(y: number, top: number, height: number, allowInside: boolean): DropZone {
  const f = height > 0 ? (y - top) / height : 0
  if (!allowInside) return f < 0.5 ? 'before' : 'after'
  return f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'inside'
}

/** The row a drop lands on, as the list shows it. */
export interface DropRow {
  id: string
  /** Effective parent in the view (null: top level). */
  parent: string | null
  /** Its children are shown right below it. */
  expanded: boolean
}

/** Container and place for a drop on `row` (parent_id null = top level of the row's list). */
export function dropTarget(row: DropRow, zone: DropZone): { parent_id: string | null; at: Placement } {
  if (zone === 'inside') return { parent_id: row.id, at: 'bottom' }
  // Just below an expanded parent the indicator sits above its first child: that is
  // where the item lands.
  if (zone === 'after' && row.expanded) return { parent_id: row.id, at: 'top' }
  return { parent_id: row.parent, at: zone === 'before' ? { before: row.id } : { after: row.id } }
}

export const sameDrop = (a: DropAt | null, b: DropAt | null) => a === b || (!!a && !!b && a.id === b.id && a.zone === b.zone)

/** Measure the zone under the pointer for an element carrying `attr="id"`. */
export function zoneUnder(attr: string, id: string, y: number, allowInside: boolean): DropZone | null {
  const el = document.querySelector(`[${attr}="${CSS.escape(id)}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return dropZone(y, r.top, r.height, allowInside)
}

/**
 * Drag feedback (OpenSpec change ux-overhaul, task-list-presentation "Drag
 * feedback"): the dragged row lifts with the popover elevation and a slight scale,
 * an opacity change only under reduced motion; the drop position is a line with a
 * dot at its start; a drop inside rings the row. Pure, so the classes are tested.
 */
export function dragFeedback(reducedMotion: boolean): { lift: string; line: string; inside: string } {
  return {
    lift: reducedMotion ? 'opacity-60' : 'scale-[1.01] shadow-2 opacity-90',
    line: "pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-accent before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:rounded-full before:bg-accent before:content-['']",
    inside: 'ring-2 ring-accent',
  }
}
