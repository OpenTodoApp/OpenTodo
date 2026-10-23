// The Inbox as list | detail (OpenSpec change inbox-split, design D1 to D3). From
// 1024 px the Inbox keeps a permanent detail pane in the shell's panel slot: the
// task under the cursor shows there (j and k, a click), "No task selected" stands
// in while there is none, and Enter opens the task as its page. Narrower screens
// keep the plain list, and a task opens as its page as everywhere else.
import { useEffect, useMemo, useRef } from 'react'
import { t } from '../../lib/i18n'
import type { ListRow } from '../../lib/listGroups'
import { InboxEmptyPane } from '../InboxEmptyPane'
import { panelTaskId, setPanelTaskId, setTaskSplit, taskSplitDocks } from '../panel'

export function useInboxSplit({ on, rows, selectedId, setSelectedId, openId, ticking }: {
  on: boolean
  /** The Inbox's own rows (not its planned group). */
  rows: readonly ListRow[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  openId: string | null
  /** Rows are ticked: a bulk selection opens nothing (bulk-edit), so the pane stays empty meanwhile. */
  ticking: boolean
}): { meta: string | undefined } {
  const count = useMemo(() => rows.filter((r) => r.depth === 0).length, [rows])
  // With nothing to sort the list's own empty state says so, and the slot stays closed.
  useEffect(() => {
    if (!on) return
    return setTaskSplit(true, count > 0 ? () => <InboxEmptyPane count={count} /> : undefined)
  }, [on, count])

  // The detail follows the cursor (D1): a new cursor row docks its task, no cursor empties the
  // pane. While rows are ticked it stays empty, and the cursor's task comes back once they clear.
  const lastSelected = useRef<string | null>(null)
  useEffect(() => {
    const was = lastSelected.current
    lastSelected.current = selectedId
    if (!on || !taskSplitDocks()) return
    if (ticking) { if (panelTaskId()) setPanelTaskId(null); return }
    if (selectedId && selectedId !== panelTaskId()) setPanelTaskId(selectedId)
    else if (!selectedId && was && panelTaskId() === was) setPanelTaskId(null)
  }, [on, selectedId, ticking])

  // Closing the docked task (its Close, Esc inside it) clears the cursor too, so the pane and the list agree.
  const lastOpen = useRef<string | null>(null)
  useEffect(() => {
    const was = lastOpen.current
    lastOpen.current = openId
    if (on && !ticking && was && !openId && taskSplitDocks() && selectedId === was) setSelectedId(null)
  }, [on, openId, selectedId, setSelectedId, ticking])

  // The header says how much is left to sort (D3).
  return { meta: on && count > 0 ? t('{n} to sort', { n: count }) : undefined }
}
