// Habit actions with the Undo toast (OpenSpec change habits-home): shared by the
// Habits screen, the Today strip and the habit's page. The planning loads on first
// use, so the Today strip adds almost nothing to the first load.
import type { DayChoice } from '../../lib/habitActions'
import { showUndoToast } from '../bulk/toastStore'
import { success } from '../motion'

/** Check in (or the tiny version) with the Undo toast and the haptic tick. */
export async function checkInWithUndo(seriesId: string, tiny: boolean): Promise<void> {
  const { checkIn } = await import('../../lib/habitActions')
  const r = await checkIn(seriesId, tiny)
  if (r?.entry) { success(); showUndoToast(r.label, r.entry.id) }
}

/** Set a past day with the Undo toast. */
export async function pickDay(seriesId: string, date: string, choice: DayChoice): Promise<void> {
  const { setPastDay } = await import('../../lib/habitActions')
  const r = await setPastDay(seriesId, date, choice)
  if (r?.entry) showUndoToast(r.label, r.entry.id)
}
