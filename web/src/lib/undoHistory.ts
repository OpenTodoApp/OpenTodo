// Multi-step undo and redo (OpenSpec change undo-redo-history, #1488): the device's local
// batch log (lib/undo.ts) read as two stacks, with no toast deadline. Undo reverses the
// most recent batch not yet undone; redo re-applies the one undone most recently. A new
// recorded action clears the redo stack (applyBatch, D3), so history stays linear — you
// cannot redo past a new edit. The batches are the last 20 the device kept, and go with
// the rest of the local data on sign-out (signOut `clearDeviceData`).
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type AssistantUndo } from './db'

/** One step of history, named for a control or the feedback ("Undo: complete 3 tasks"). */
export interface UndoStep {
  id: string
  /** What the action was ("3 tasks completed"), when the batch recorded one. */
  label?: string
  /** How many changes the batch made. */
  count: number
}

const stepOf = (e: AssistantUndo): UndoStep => ({ id: e.id, ...(e.label ? { label: e.label } : {}), count: e.count })

/** The batch the next Undo reverses: the most recent one not yet undone, or null. */
export function topUndo(entries: readonly AssistantUndo[]): UndoStep | null {
  let top: AssistantUndo | undefined
  for (const e of entries) if (!e.undone_at && (!top || e.created_at > top.created_at)) top = e
  return top ? stepOf(top) : null
}

/** The batch the next Redo re-applies: the one undone most recently, or null. */
export function topRedo(entries: readonly AssistantUndo[]): UndoStep | null {
  let top: AssistantUndo | undefined
  for (const e of entries) {
    // A batch undone before this feature shipped has no redo payload and cannot be redone.
    if (e.undone_at == null || !e.redo) continue
    if (!top || e.undone_at > top.undone_at!) top = e
  }
  return top ? stepOf(top) : null
}

/** The live tops of the undo and redo stacks for this device. */
export interface History {
  undo: UndoStep | null
  redo: UndoStep | null
}

const EMPTY: History = { undo: null, redo: null }

/** The undo and redo this device can do right now, updating as batches are recorded or reversed. */
export function useUndoHistory(): History {
  return useLiveQuery(async () => {
    const entries = await db.assistantUndo.toArray()
    return { undo: topUndo(entries), redo: topRedo(entries) }
  }, [], EMPTY) ?? EMPTY
}
