// Editing and opening a task from its row (OpenSpec change row-edit-action): the inline
// editor's state, the row menu's Edit, Show details and Open details, and the task kept
// beside the list while another row is edited.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Task } from '../../lib/types'
import { DESKTOP_HEADER_QUERY, useMediaQuery } from '../../ui'
import type { RowMenuItems } from '../bulk/BulkActions'
import { panelTaskId, setPanelTaskId, sidePanelDocks, taskSplitDocks, watchPanelTaskId } from '../panel'
import { openTaskPage } from '../taskTrail'

/**
 * D3: an edit or a row's More on another row than the task beside the list (the side panel,
 * the Inbox's split) keeps that task there while the row stays the cursor. `dockId` is what
 * the pane follows; `releaseDock` is a click on a row. Another task opened there ends the
 * hold, and a closed pane stays closed until the cursor moves.
 */
export function useDockHold(selectedId: string | null) {
  const [hold, setHold] = useState<{ id: string; keep: string | null } | null>(null)
  if (hold && hold.id !== selectedId) setHold(null)
  useEffect(() => {
    if (!hold?.keep) return
    const { id, keep } = hold
    return watchPanelTaskId((now) => { if (now !== keep) setHold(now ? null : { id, keep: null }) })
  }, [hold])
  const holdDock = useCallback((id: string) => {
    const keep = panelTaskId()
    setHold((held) => (keep && keep !== id && taskSplitDocks() ? { id, keep } : held?.id === id ? held : null))
  }, [])
  const releaseDock = useCallback(() => setHold(null), [])
  return { dockId: hold ? hold.keep : selectedId, holdDock, releaseDock }
}

/** The row edited in place (inline-task-editing) and the ways to start it. */
export function useInlineEdit(taskMap: Map<string, Task>, board: boolean, isReadOnly: (task: Task | undefined) => boolean, setSelectedId: (id: string | null) => void, holdDock: (id: string) => void) {
  const [inline, setInline] = useState<{ id: string; caret?: number; compact?: boolean } | null>(null)
  const startInline = useCallback((id: string, e?: React.MouseEvent, compact = false) => {
    const task = taskMap.get(id)
    if (!task || board || isReadOnly(task)) return
    holdDock(id)
    setSelectedId(id)
    setInline({ id, caret: e ? caretFromClick(e) : task.title.length, compact })
  }, [taskMap, board, isReadOnly, setSelectedId, holdDock])
  // Edit from the row's actions or its menu (D1, D2): the F2 editor with a fine pointer from
  // 768 px, else the compact one with Save and Cancel. Mounted within the activation so iOS
  // can show its keyboard.
  const editTitle = useCallback((id: string) => {
    const desk = !!window.matchMedia?.('(pointer: fine)').matches && !!window.matchMedia?.(DESKTOP_HEADER_QUERY).matches
    flushSync(() => startInline(id, undefined, !desk))
  }, [startInline])
  return { inline, setInline, startInline, editTitle }
}

/**
 * One task's items in the row menu (D2), in the list layout only (boards and the timeline get none), and the expanded row they toggle (row-expand D4: this
 * list's state only, never stored). Open details opens the task as Enter does, by Open tasks.
 * A phone's rows do not expand (phone-row-controls): its menu has Edit and Open details.
 */
export function useRowMenuItems(editable: boolean, editTitle: (id: string) => void, setSelectedId: (id: string | null) => void) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const wide = useMediaQuery(DESKTOP_HEADER_QUERY)
  const openDetails = useCallback((id: string) => {
    setSelectedId(id)
    if (taskSplitDocks() && (!sidePanelDocks() || panelTaskId() === id)) openTaskPage(id)
    else setPanelTaskId(id)
  }, [setSelectedId])
  const showDetails = useCallback((id: string) => {
    setSelectedId(id)
    setExpandedId((cur) => (cur === id ? null : id))
  }, [setSelectedId])
  const menuItems: RowMenuItems = useMemo(() => (editable ? { editTitle, openDetails, showDetails: wide ? showDetails : undefined } : {}), [editable, editTitle, openDetails, showDetails, wide])
  return { menuItems, expandedId, setExpandedId }
}

/** The caret offset in the row's title under a click, or undefined (the editor puts it at the end). */
function caretFromClick(e: React.MouseEvent): number | undefined {
  const title = (e.currentTarget as Element).querySelector?.('[data-row-title]')
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  const pos = doc.caretPositionFromPoint?.(e.clientX, e.clientY)
  const range = !pos && document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null
  const node = pos?.offsetNode ?? range?.startContainer
  const offset = pos?.offset ?? range?.startOffset
  if (!title || !node || offset === undefined || !title.contains(node)) return undefined
  // Characters before the clicked text node within the title, plus the offset in it.
  let before = 0
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n && n !== node; n = walker.nextNode()) before += n.textContent?.length ?? 0
  return before + offset
}
