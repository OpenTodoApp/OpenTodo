// The focus timer's state on this device (OpenSpec change focus-mode, design D2,
// D3): one row "current" in the device-local `focus` table. It is never an op,
// never in the outbox, the export or a backup, and clearLocalData() drops it at
// sign-out; two devices never share a session (the time entry is what syncs).
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { FocusState } from './timer'

export const FOCUS_ROW = 'current'

/** The stored state, or null when this device never ran a session. */
export async function readFocus(): Promise<FocusState | null> {
  return (await db.focus.get(FOCUS_ROW)) ?? null
}

/** Replaces the stored state. */
export async function writeFocus(state: FocusState): Promise<void> {
  await db.focus.put({ ...state, id: FOCUS_ROW })
}

/**
 * One transition of the run that started at `expectedStartedAt` (design D3): runs
 * in a transaction that re-reads the row and gives up when the row moved on (a
 * second tab already wrote the end, the user started another run) or when `fn`
 * returns null. Returns the written state, or null when nothing was written, so
 * the effects of a transition (the entry's stop, the notification) run once.
 */
export async function transitionFocus(expectedStartedAt: number, fn: (s: FocusState) => FocusState | null): Promise<FocusState | null> {
  return db.transaction('rw', db.focus, async () => {
    const row = await db.focus.get(FOCUS_ROW)
    if (!row || row.startedAt !== expectedStartedAt) return null
    const next = fn(row)
    if (!next || next === row) return null
    await db.focus.put({ ...next, id: FOCUS_ROW })
    return next
  })
}

/** The stored state, live: undefined while it loads, null without one. */
export function useFocusState(): FocusState | null | undefined {
  return useLiveQuery(readFocus, [], undefined)
}
