// Bulk selection for the lists built on useListKeys (the Filter view and saved
// views; bulk-edit tasks 1.2 and 2.4): the selection, the bar, the cursor menu and
// the row props, in one hook.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Task } from '../../lib/types'
import { useSelection, type SelectionApi } from '../selection'
import { BulkActionsMenu, SelectionBar } from './BulkActions'
import { RowScheduleHost } from '../task-list/RowSwipe'
import { fromTouch, nativeMenuWins } from '../task-list/useListBindings'
import { useRowMenu } from './useRowMenu'
import { t } from '../../lib/i18n'

export interface BulkList {
  selection: SelectionApi
  /** Ticked ids in list order. */
  ticked: string[]
  /** Task ids in list order (each once). */
  order: string[]
  /** `from`: the row's More button, where the menu then opens. */
  openActions: (picker?: string | null, from?: HTMLElement | null) => void
  /** The bar and, with nothing ticked, the cursor task's menu. */
  render: (cursor: string | null) => ReactNode
  rowProps: (task: Task) => {
    ticked: boolean
    showCheckbox: boolean
    onTick: (range: boolean) => void
    onContextMenu: (e: React.MouseEvent) => void
    onRowMenu: (x: number, y: number, row: HTMLElement) => void
  }
}

export function useBulkList(tasks: readonly Task[]): BulkList {
  const order = useMemo(() => [...new Set(tasks.map((task) => task.id))], [tasks])
  const selection = useSelection(order, () => false)
  const ticked = useMemo(() => order.filter((id) => selection.ticked.has(id)), [order, selection.ticked])
  const actions = useActionsOpen(ticked.length)
  const { picker, onOpenChange } = actions
  const from = useRef<HTMLElement | null>(null)
  // The row's menu at the pointer, owned once with the task lists (task-row-context-menu).
  const rowMenu = useRowMenu(selection.ticked, ticked)
  return {
    selection, ticked, order,
    openActions: (p = null, el = null) => { from.current = el; actions.open(p) },
    render: (cursor) => (
      <>
        <SelectionBar ids={ticked} onClear={selection.clear} menuOpen={actions.forTicked} onMenuOpenChange={onOpenChange} startPicker={picker} />
        <RowScheduleHost />
        {actions.forCursor && cursor && (
          <BulkActionsMenu ids={[cursor]} open onOpenChange={onOpenChange} startPicker={picker} anchor={from} trigger={<span className="sr-only">{t('Actions')}</span>} triggerClassName="sr-only" />
        )}
        {rowMenu.element}
      </>
    ),
    rowProps: (task) => ({
      ticked: selection.ticked.has(task.id), showCheckbox: selection.ticked.size > 0,
      onTick: (range) => { if (range) selection.extendTo(task.id); else selection.toggle(task.id) },
      // A right-click: the shared rule at the pointer. A link, a field or the row's
      // selected text keeps the browser's own menu; a touch long press is only
      // suppressed — the hold owns touch, so one gesture never both ticks and opens
      // (task-row-context-menu).
      onContextMenu: (e) => {
        if (nativeMenuWins(e)) return
        e.preventDefault()
        if (fromTouch(e)) return
        rowMenu.open(task, e.clientX, e.clientY, e.currentTarget instanceof Element ? e.currentTarget : null)
      },
      // A touch hold's release: the same menu at the finger, with no event to guard.
      onRowMenu: (x, y, row) => rowMenu.open(task, x, y, row),
    }),
  }
}

export interface ActionsOpen {
  /** The selection bar's menu is open, for the ticked tasks. */
  forTicked: boolean
  /** The cursor task's menu is open (`.` or a row's More with nothing ticked). */
  forCursor: boolean
  /** The picker the menu opened straight into. */
  picker: string | null
  open: (picker?: string | null) => void
  onOpenChange: (open: boolean) => void
}

/**
 * The Actions menu's open state, held for what it opened on: the ticked tasks or, with
 * nothing ticked, the cursor task. When the ticked set empties or fills while it is open
 * (a bulk action took every ticked row out of the list), the menu closes instead of
 * turning into the other one (issue 841).
 */
export function useActionsOpen(tickedCount: number): ActionsOpen {
  const [opened, setOpened] = useState<'ticked' | 'cursor' | null>(null)
  const [picker, setPicker] = useState<string | null>(null)
  const target: 'ticked' | 'cursor' = tickedCount > 0 ? 'ticked' : 'cursor'
  const latest = useRef(target)
  latest.current = target
  const onOpenChange = useCallback((v: boolean) => { setOpened(v ? latest.current : null); if (!v) setPicker(null) }, [])
  const open = useCallback((p: string | null = null) => { setPicker(p); setOpened(latest.current) }, [])
  useEffect(() => { if (opened && opened !== target) onOpenChange(false) }, [opened, target, onOpenChange])
  return { forTicked: opened === 'ticked' && target === 'ticked', forCursor: opened === 'cursor' && target === 'cursor', picker, open, onOpenChange }
}
