import type { GroupDrop } from '../../lib/viewOrderMove'
import { dropZone, type DropZone } from '../listDrop'
import { gapDepths, gapTarget, pointedDepth, type GapRow } from './dropDepth'

export interface DragDepth {
  start: number
  dx: number
  step: number
}

/** Resolve the row and depth shown by a project-group drop line and the exact placement it writes. */
export function projectGroupPlacement(rows: readonly GapRow[], target: string, dragged: string,
  nesting: boolean, canNest: boolean, rect: Pick<DOMRect, 'top' | 'height'>, y: number, gesture: DragDepth): {
  zone: DropZone; depth?: number; placement: Pick<GroupDrop, 'at' | 'parentId' | 'siblingAt'>
} | null {
  const row = rows.find((r) => r.id === target)
  if (!row || row.id === dragged || (!nesting && row.depth)) return null
  const zone = dropZone(y, rect.top, rect.height, nesting)
  if (!nesting) return beside(row.id, zone)

  // Visible rows are in tree order. Remove the dragged subtree so a gap never points into it.
  const own = new Set([dragged])
  const visible = rows.filter((r) => {
    if (r.parent && own.has(r.parent)) own.add(r.id)
    return !own.has(r.id)
  })
  if (own.has(row.id)) return null
  if (zone === 'inside') return canNest ? { zone, placement: { parentId: row.id } } : null
  const i = visible.findIndex((r) => r.id === row.id) + (zone === 'after' ? 1 : 0)
  const above = visible[i - 1] ?? null
  const below = visible[i] ?? null
  const depth = pointedDepth(gesture.start, gesture.dx, gesture.step, gapDepths(above, below))
  const into = gapTarget(above, below, depth, (id) => visible.find((r) => r.id === id))
  if (!into) return null
  if (into.parent_id) return canNest ? { zone, depth, placement: { parentId: into.parent_id, siblingAt: into.at } } : null
  return typeof into.at === 'object' ? { zone, depth, placement: { at: into.at } } : null
}

function beside(id: string, zone: DropZone): { zone: DropZone; placement: Pick<GroupDrop, 'at'> } {
  return { zone, placement: { at: zone === 'before' ? { before: id } : { after: id } } }
}
