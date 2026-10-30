// A label page's or saved view's own manual order from the interface (OpenSpec
// change view-manual-order): a drop or a keyboard step becomes one undoable move
// of the page's stored order, shown with "Order changed" and Undo (design D6).
import type { Task } from '../lib/types'
import type { UndoableResult } from '../lib/undoActions'
import type { ViewPlacement, ViewStep } from '../lib/viewOrder'
import type { OrderHost } from '../lib/viewOrderMove'
import { showUndoToast } from './bulk/toastStore'
import { withListTransition } from './motion'

function offerUndo(r: UndoableResult | null): boolean {
  if (r?.entry) showUndoToast(r.label, r.entry.id)
  return !!r?.entry
}

/** Place `moved` before or after another task of the page; `tasks` are the tasks the page shows. */
// The write loads with the first move: the order's read is drawn with the list, the write is not (bundle budget).
const writer = () => import('../lib/viewOrderMove')

export function reorderInView(host: OrderHost, tasks: readonly Task[], moved: string, at: ViewPlacement): Promise<boolean> {
  return writer().then((w) => withListTransition(1, () => w.moveInViewOrder(host, tasks, moved, at))).then(offerUndo)
}

/** A keyboard step within the task's group; false at the group's edge. */
export function stepInView(host: OrderHost, tasks: readonly Task[], group: readonly Task[], id: string, step: ViewStep): Promise<boolean> {
  return writer().then((w) => withListTransition(1, () => w.stepInViewOrder(host, tasks, group, id, step))).then(offerUndo)
}
