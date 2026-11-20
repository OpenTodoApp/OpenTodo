// Multi-step undo and redo (OpenSpec change undo-redo-history, #1488): the device's local
// batch log (lib/undo.ts) read as two stacks, with no toast deadline. Undo reverses the
// most recent batch not yet undone; redo re-applies the one undone most recently. A new
// recorded action clears the redo stack (applyBatch, D3), so history stays linear — you
// cannot redo past a new edit. The batches are the last 20 the device kept, and go with
// the rest of the local data on sign-out (signOut `clearDeviceData`).
// The stack tops themselves (topUndo, topRedo) live in lib/undo.ts, next to the steps that
// re-read them when they run (a fast second press, StepOptions.latest).
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { topRedo, topUndo, type UndoStep } from './undo'

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
