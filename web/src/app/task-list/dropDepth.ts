// The level of a drop between two rows of a tree list (OpenSpec change drop-depth,
// GitHub issue 1037): the depths a gap allows, the depth the pointer's sideways
// movement points at, and the parent and place it means. Pure but for the indent
// step, so the rule is tested without a browser; useListDrag measures the pointer.
import type { ListGroup, ListRow } from '../../lib/listGroups'
import type { Placement } from '../../lib/ordering'
import type { DropZone } from '../listDrop'

/** A visible row of a tree list, as a gap between two rows sees it. */
export interface GapRow {
  id: string
  /** Effective parent in the view (null: top level). */
  parent: string | null
  depth: number
}

/**
 * The depths a drop between two rows of one group can take (OpenSpec change drop-depth):
 * from the row below's depth (the rows under the line keep their parent) to one deeper
 * than the row above (a subtask of it). `above` and `below` leave out the dragged task
 * and its subtasks; null at the group's edge.
 */
export function gapDepths(above: GapRow | null, below: GapRow | null): { min: number; max: number } {
  if (!above) return { min: below?.depth ?? 0, max: below?.depth ?? 0 }
  const max = above.depth + 1
  return { min: Math.min(below?.depth ?? 0, max), max }
}

/**
 * The depth a drag points at: the dragged task's own depth, one level for every
 * whole `step` of pixels the pointer has moved sideways since the drag began, within the gap's
 * depths. Moving straight up or down keeps the task's level.
 */
export function pointedDepth(start: number, dx: number, step: number, range: { min: number; max: number }): number {
  const d = start + Math.trunc(dx / Math.max(1, step))
  return Math.max(range.min, Math.min(range.max, d))
}

/**
 * Container and place for a drop at `depth` in the gap between `above` and `below`
 * (drop-depth): one deeper than `above` makes it a subtask of `above` (first when its
 * subtasks show right below, else last); `above`'s depth or less places it after
 * `above`'s ancestor at that depth. `rowOf` finds a visible row by id.
 */
export function gapTarget(above: GapRow | null, below: GapRow | null, depth: number, rowOf: (id: string) => GapRow | undefined): { parent_id: string | null; at: Placement } | null {
  if (!above) return below ? { parent_id: below.parent, at: { before: below.id } } : null
  if (depth > above.depth) return { parent_id: above.id, at: below?.parent === above.id ? { before: below.id } : 'bottom' }
  let anchor = above
  while (anchor.depth > depth && anchor.parent) {
    const up = rowOf(anchor.parent)
    if (!up) break
    anchor = up
  }
  return { parent_id: anchor.parent, at: { after: anchor.id } }
}

export const gapRow = (r: ListRow): GapRow => ({ id: r.task.id, parent: r.parent, depth: r.depth })

/**
 * The rows on either side of a before or after drop on `id` (drop-depth), in the row's
 * group, leaving out the dragged task and its subtasks; null without a group.
 */
export function gapAround(groups: readonly ListGroup[] | undefined, own: ReadonlySet<string>, id: string, zone: DropZone): { above: GapRow | null; below: GapRow | null } | null {
  const g = zone === 'inside' ? undefined : groups?.find((x) => x.rows.some((r) => r.task.id === id))
  if (!g) return null
  const rs = g.rows.filter((r) => !own.has(r.task.id))
  const i = rs.findIndex((r) => r.task.id === id)
  const above = zone === 'before' ? rs[i - 1] : rs[i]
  const below = zone === 'before' ? rs[i] : rs[i + 1]
  return { above: above ? gapRow(above) : null, below: below ? gapRow(below) : null }
}

/** One level of a drag's sideways movement: a row's indent step (1.5 rem). */
export function indentStep(): number {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return (Number.isFinite(rem) && rem > 0 ? rem : 16) * 1.5
}
