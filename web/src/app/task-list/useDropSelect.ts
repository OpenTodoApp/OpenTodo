// A drop selects the row it moved (GitHub issue 2165). The row is in sight where the
// pointer left it, but its move renders after the selection: revealing it then would
// scroll the list back to where the row came from. The reveal asks `wasDropped` first.
import { useCallback, useEffect, useRef } from 'react'
import { isFirstRow, revealRow } from './revealRow'

export function useDropSelect<K>(selected: K | null, select: (key: K) => void): [onDropped: (key: K) => void, wasDropped: (key: K) => boolean] {
  const current = useRef(selected)
  current.current = selected
  const dropped = useRef<K | null>(null)
  // A drop on the selected row changes no selection, so no reveal would clear the mark.
  const onDropped = useCallback((key: K) => { if (key !== current.current) dropped.current = key; select(key) }, [select])
  /** Whether `key` is the selection a drop just made; true once. */
  const wasDropped = useCallback((key: K) => { const was = dropped.current === key; dropped.current = null; return was }, [])
  return [onDropped, wasDropped]
}

/** A grouped list's selected row (`group:id`, saved views and Filter) kept below the sticky header, back to the very top on the first row (issue 514). */
export function useRevealSelected(selected: string | null, wasDropped?: (key: string) => boolean): void {
  useEffect(() => {
    if (!selected || wasDropped?.(selected)) return
    const i = selected.lastIndexOf(':')
    const row = document.querySelector<HTMLElement>(`[data-group="${CSS.escape(selected.slice(0, i))}"] [data-task-id="${CSS.escape(selected.slice(i + 1))}"]`)
    if (row) revealRow(row, { first: isFirstRow(row) })
  }, [selected, wasDropped])
}
