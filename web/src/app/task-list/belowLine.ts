// Where a list draws its "Add task below" line (OpenSpec change add-below, GitHub
// issue 1036): after the row and its visible subtasks, then after each task the line
// added, at the row's own indent, so the line sits where the next task will appear.
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { ListRow } from '../../lib/listGroups'
import type { Task } from '../../lib/types'

/** The open line: the row the new tasks follow as siblings, and the last task it added. */
export interface AddingBelow {
  anchor: string
  last: string
}

export interface BelowLine {
  anchor: Task
  /** The last task the line added (the anchor at first): the next one goes right after it. */
  after: string
  depth: number
  /** The row the line is drawn after: the last added task (or the anchor) with its visible subtasks. */
  at: string
}

/** The line for `state` in `rows`; `at` is null while the last added task is not listed yet. */
export function belowLine(rows: readonly ListRow[], state: AddingBelow | null): (Omit<BelowLine, 'at'> & { at: string | null }) | null {
  if (!state) return null
  const a = rows.findIndex((r) => r.task.id === state.anchor)
  if (a < 0) return null
  const line = { anchor: rows[a].task, after: state.last, depth: rows[a].depth }
  const i = rows.findIndex((r) => r.task.id === state.last)
  if (i < 0) return { ...line, at: null }
  let j = i
  while (j + 1 < rows.length && rows[j + 1].depth > rows[i].depth) j++
  return { ...line, at: rows[j].task.id }
}

/**
 * The open line. Until a task it added is listed, the line stays where it was (with
 * the new `after`), so it never jumps back.
 */
export function useBelowLine(rows: readonly ListRow[], state: AddingBelow | null): BelowLine | null {
  const shown = useRef<BelowLine | null>(null)
  const found = belowLine(rows, state)
  const prev = shown.current
  const line = !found ? null : found.at ? { ...found, at: found.at } : prev && prev.anchor.id === found.anchor.id ? { ...found, at: prev.at } : null
  shown.current = line
  return line
}

/**
 * The list's inline add lines for its rows: "Add subtask" (`a`) under a row and "Add
 * task below" after it, both closed by one call.
 */
export function useAddLines(rows: readonly ListRow[], ui: { addingUnder: string | null; setAddingUnder: Dispatch<SetStateAction<string | null>>; addingBelow: AddingBelow | null; setAddingBelow: Dispatch<SetStateAction<AddingBelow | null>> }) {
  const { addingUnder, setAddingUnder, setAddingBelow } = ui
  const addingBelow = useBelowLine(rows, ui.addingBelow)
  /** The parent whose list "Add a subtask" line is open (quick-subtask-add): one at a time, and it follows the parent's last visible subtask. */
  const [subtaskAddOpen, setSubtaskAddOpen] = useState<string | null>(null)
  const openSubtaskAdd = useCallback((id: string) => { setSubtaskAddOpen(id); setAddingUnder(null); setAddingBelow(null) }, [setAddingUnder, setAddingBelow])
  // `a` and the row menu set addingUnder/addingBelow through `ui` directly: one inline add input at a time.
  useEffect(() => { if (addingUnder || ui.addingBelow) setSubtaskAddOpen(null) }, [addingUnder, ui.addingBelow])
  const onCloseSubtask = useCallback(() => { setAddingUnder(null); setAddingBelow(null); setSubtaskAddOpen(null) }, [setAddingUnder, setAddingBelow])
  const onAddedBelow = useCallback((anchor: string, id: string) => setAddingBelow((s) => (s && s.anchor === anchor ? { ...s, last: id } : s)), [setAddingBelow])
  return { addingUnder, addingBelow, onAddedBelow, onCloseSubtask, subtaskAddOpen, openSubtaskAdd }
}
