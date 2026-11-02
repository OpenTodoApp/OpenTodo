// The card actions written through lib/objectives: one undoable batch each,
// applied locally first, with the Undo toast (plan-objectives D4).
import { addObjective, dropObjective, moveObjective, placeObjective, renameObjective, setObjectiveDone, type ObjectiveResult } from '../../lib/objectives'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import type { ObjectiveActions } from './ObjectiveCards'

function toast(r: ObjectiveResult | null): void {
  if (r?.entry) showUndoToast(r.label, r.entry.id)
}

/** Toasts only for done and drop; renames, moves and adds speak for themselves on screen. */
export const objectiveActions: ObjectiveActions = {
  onToggle: (o, done) => act(setObjectiveDone(o.id, done).then(toast)),
  onRename: (o, title) => act(renameObjective(o.id, title).then(() => undefined)),
  onDrop: (o) => act(dropObjective(o.id).then(toast)),
  onMove: (o, by) => act(moveObjective(o.id, by).then(() => undefined)),
  onPlace: (id, to) => act(placeObjective(id, to).then(() => undefined)),
  onAdd: (period, title) => act(addObjective(title, period).then(() => undefined)),
}

export { toast as objectiveToast }
