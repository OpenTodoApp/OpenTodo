// The check-in that may get a note (OpenSpec change habit-notes, design D2): set when
// a check-in is written on the Habits screen, the habit's page or the Today strip,
// cleared when its line is saved, dismissed or replaced by the next check-in. Module
// state, so the line opens under whichever row or chip made the check-in.
import { resettable } from '../../lib/moduleState'
import { createStore } from '../../lib/store'

export interface PendingNote {
  seriesId: string
  recordId: string
  /** Bumped per check-in, so a second check-in of the same habit opens a fresh line. */
  key: number
}

const store = createStore<PendingNote | null>('checkInNote', null)
let seq = 0
resettable('checkInNoteSeq', () => { seq = 0 })

export function offerNote(seriesId: string, recordId: string): void {
  store.set({ seriesId, recordId, key: ++seq })
}

export function closeNote(): void {
  store.set(null)
}

/** The check-in waiting for a note when it belongs to `seriesId`, else null. */
export function usePendingNote(seriesId: string): PendingNote | null {
  const p = store.use()
  return p?.seriesId === seriesId ? p : null
}
