// Bulk selection for the lists built on useListKeys (the Filter view and saved
// views; bulk-edit tasks 1.2 and 2.4): the selection, the bar, the cursor menu
// and the row props, in one hook.
import { useMemo, useState, type ReactNode } from 'react'
import type { Task } from '../../lib/types'
import { useSelection, type SelectionApi } from '../selection'
import { BulkActionsMenu, SelectionBar } from './BulkActions'

export interface BulkList {
  selection: SelectionApi
  /** Ticked ids in list order. */
  ticked: string[]
  /** Task ids in list order (each once). */
  order: string[]
  openActions: (picker?: string | null) => void
  /** The bar and, with nothing ticked, the cursor task's menu. */
  render: (cursor: string | null) => ReactNode
  rowProps: (id: string) => { ticked: boolean; showCheckbox: boolean; onTick: (range: boolean) => void }
}

export function useBulkList(tasks: readonly Task[]): BulkList {
  const order = useMemo(() => [...new Set(tasks.map((t) => t.id))], [tasks])
  const selection = useSelection(order, () => false)
  const ticked = useMemo(() => order.filter((id) => selection.ticked.has(id)), [order, selection.ticked])
  const [open, setOpen] = useState(false)
  const [picker, setPicker] = useState<string | null>(null)
  const onOpenChange = (v: boolean) => { setOpen(v); if (!v) setPicker(null) }
  return {
    selection, ticked, order,
    openActions: (p = null) => { setPicker(p); setOpen(true) },
    render: (cursor) => (
      <>
        <SelectionBar ids={ticked} onClear={selection.clear} menuOpen={open && ticked.length > 0} onMenuOpenChange={onOpenChange} startPicker={picker} />
        {open && ticked.length === 0 && cursor && (
          <BulkActionsMenu ids={[cursor]} open onOpenChange={onOpenChange} startPicker={picker} trigger={<span className="sr-only">Actions</span>} triggerClassName="sr-only" />
        )}
      </>
    ),
    rowProps: (id) => ({
      ticked: selection.ticked.has(id), showCheckbox: selection.ticked.size > 0,
      onTick: (range) => { if (range) selection.extendTo(id); else selection.toggle(id) },
    }),
  }
}
