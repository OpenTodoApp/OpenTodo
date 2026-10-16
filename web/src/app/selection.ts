// Multi-select for task lists (OpenSpec change bulk-edit, design D1): the cursor
// row stays separate; this is the ticked set, its anchor and the last extended
// range, as pure functions plus a small hook. Read-only rows are never ticked.
import { useEffect, useMemo, useState } from 'react'

export interface Selection {
  ticked: ReadonlySet<string>
  /** Where the last tick or extension started. */
  anchor: string | null
  /** Rows the last `extendTo` added (not ticked before it), so moving back shrinks the range. */
  range: ReadonlySet<string>
}

export const EMPTY: Selection = { ticked: new Set(), anchor: null, range: new Set() }

type IsReadOnly = (id: string) => boolean
const never: IsReadOnly = () => false

/** Tick or untick one row; it becomes the anchor. */
export function toggle(sel: Selection, id: string, readOnly: IsReadOnly = never): Selection {
  if (readOnly(id)) return sel
  const ticked = new Set(sel.ticked)
  if (ticked.has(id)) ticked.delete(id)
  else ticked.add(id)
  return { ticked, anchor: id, range: new Set() }
}

/** Tick every row from the anchor to `id` (in `rows` order), replacing the previous extension. */
export function extendTo(sel: Selection, rows: readonly string[], id: string, readOnly: IsReadOnly = never): Selection {
  const anchor = sel.anchor && rows.includes(sel.anchor) ? sel.anchor : id
  const a = rows.indexOf(anchor)
  const b = rows.indexOf(id)
  if (b < 0) return sel
  const [from, to] = a <= b ? [a, b] : [b, a]
  // Rows ticked individually stay ticked; only the previous extension is replaced.
  const base = new Set([...sel.ticked].filter((t) => !sel.range.has(t)))
  const added = rows.slice(from, to + 1).filter((r) => !readOnly(r) && !base.has(r))
  return { ticked: new Set([...base, ...added]), anchor, range: new Set(added) }
}

/** Tick every (writable) row. */
export function selectAll(sel: Selection, rows: readonly string[], readOnly: IsReadOnly = never): Selection {
  return { ticked: new Set(rows.filter((r) => !readOnly(r))), anchor: sel.anchor, range: new Set() }
}

/** Drop ids that are no longer listed (completed, moved, deleted). */
export function retain(sel: Selection, rows: readonly string[]): Selection {
  const keep = new Set(rows)
  if ([...sel.ticked].every((t) => keep.has(t)) && (!sel.anchor || keep.has(sel.anchor))) return sel
  return {
    ticked: new Set([...sel.ticked].filter((t) => keep.has(t))),
    anchor: sel.anchor && keep.has(sel.anchor) ? sel.anchor : null,
    range: new Set([...sel.range].filter((t) => keep.has(t))),
  }
}

export interface SelectionApi {
  ticked: ReadonlySet<string>
  toggle(id: string): void
  /** Extend from the anchor to `id`; `within` limits the order (a board column). */
  extendTo(id: string, within?: readonly string[]): void
  selectAll(): void
  set(ids: readonly string[]): void
  clear(): void
}

/** The selection of one list: `rows` are task ids in visible order. */
export function useSelection(rows: readonly string[], readOnly: IsReadOnly): SelectionApi {
  const [sel, setSel] = useState<Selection>(EMPTY)
  useEffect(() => { setSel((s) => retain(s, rows)) }, [rows])
  return useMemo(() => ({
    ticked: sel.ticked,
    toggle: (id) => setSel((s) => toggle(s, id, readOnly)),
    extendTo: (id, within) => setSel((s) => extendTo(s, within ?? rows, id, readOnly)),
    selectAll: () => setSel((s) => selectAll(s, rows, readOnly)),
    set: (ids) => setSel({ ticked: new Set(ids.filter((i) => !readOnly(i))), anchor: ids[0] ?? null, range: new Set() }),
    clear: () => setSel(EMPTY),
  }), [sel, rows, readOnly])
}
