// The row's actions menu at the pointer, owned once for both lists that render one
// (task-row-context-menu): one state, one selection rule, one element and one focus
// restore, so `TaskListView` and `useBulkList` cannot drift apart — the duplicate
// `ctxMenu` state, menu element and inline rule now live only here.
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { Task } from '../../lib/types'
import { rowMenuIds } from '../task-list/useListBindings'
import { BulkActionsMenu } from './BulkActions'

interface OpenMenu {
  ids: string[]
  x: number
  y: number
  /** The row the menu was opened from: focus returns there when it closes. */
  row: Element | null
}

export interface RowMenu {
  /** The open menu, anchored at the pointer — render it once, or null. */
  element: ReactNode
  /** The shared rule: the ticked selection in list order when the row is ticked, else the row alone. */
  open: (task: Task, x: number, y: number, row?: Element | null) => void
  /** Open for ids the caller already knows. */
  openIds: (ids: string[], x: number, y: number, row?: Element | null) => void
  /** Close the menu, returning focus to its row if nothing else took it. */
  close: () => void
  /** Close it because something else took over (a drag lifted). */
  dismiss: () => void
}

export function useRowMenu(ticked: ReadonlySet<string>, order: readonly string[]): RowMenu {
  const [menu, setMenu] = useState<OpenMenu | null>(null)
  // The latest menu, read by the close handler without re-creating it every render.
  const latest = useRef<OpenMenu | null>(null)
  latest.current = menu
  // Set when the menu closes, consumed by the layout effect below (focus first runs
  // while the unmounting trigger still holds it, so this is where the row can claim it).
  const returnTo = useRef<Element | null>(null)

  const openIds = useCallback((ids: string[], x: number, y: number, row: Element | null = null) => {
    setMenu({ ids, x, y, row })
  }, [])
  const open = useCallback((task: Task, x: number, y: number, row: Element | null = null) => {
    openIds(rowMenuIds(task, ticked, order), x, y, row)
  }, [openIds, ticked, order])
  const dismiss = useCallback(() => { returnTo.current = null; setMenu(null) }, [])
  const close = useCallback(() => {
    returnTo.current = latest.current?.row ?? null
    setMenu(null)
  }, [])

  useLayoutEffect(() => {
    if (menu || !returnTo.current) return
    const row = returnTo.current
    returnTo.current = null
    if (!row.isConnected) return
    // Escape and the keyboard's own close leave the focus on <body> once the trigger
    // unmounts: hand it back to the row's open button. A click that closed the menu
    // has its own target — that focus runs as the event's default action, after this
    // effect, so the row never keeps it (review: focus is not lost to <body>).
    const active = document.activeElement
    if (active && active !== document.body) return
    row.querySelector<HTMLElement>('[data-row-open]')?.focus({ preventScroll: true })
  }, [menu])

  const element = menu ? (
    <BulkActionsMenu ids={menu.ids} open onOpenChange={(v) => { if (!v) close() }}
      trigger={<span className="sr-only" />} triggerClassName="sr-only"
      triggerProps={{ style: { position: 'fixed', left: menu.x, top: menu.y } }} />
  ) : null

  return { element, open, openIds, close, dismiss }
}
