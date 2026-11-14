// The day whose note is open (OpenSpec change habit-notes, design D2, D3): Note on a
// past day of the thread or the month grid, or an entry of Check-ins. The dialog is
// one host per screen; module state, so a row deep in a list can open it.
import { createStore } from '../../lib/store'

export interface DayNoteTarget { seriesId: string; date: string }

export const dayNote = createStore<DayNoteTarget | null>('dayNote', null)

export function openDayNote(seriesId: string, date: string): void {
  dayNote.set({ seriesId, date })
}
