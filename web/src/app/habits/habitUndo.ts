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
  // "How did it go?" opens under what made the check-in (habit-notes D2).
  if (r?.recordId && r.recordId !== seriesId) (await import('./checkInNoteStore')).offerNote(seriesId, r.recordId)
}

/** Set a past day with the Undo toast. */
export async function pickDay(seriesId: string, date: string, choice: DayChoice): Promise<void> {
  const { setPastDay } = await import('../../lib/habitActions')
  const r = await setPastDay(seriesId, date, choice)
  if (r?.entry) showUndoToast(r.label, r.entry.id)
}

/** Subtract a step from today's amount, or add one (habit-targets D2), with the Undo toast. */
export async function stepAmount(seriesId: string, step: number): Promise<void> {
  const { changeAmount } = await import('../../lib/habitActions')
  const r = await changeAmount(seriesId, { add: step })
  if (r?.entry) showUndoToast(r.label, r.entry.id)
}

/** Take back today's check-in (habits-complete D4) with the Undo toast. */
export async function uncheckWithUndo(seriesId: string): Promise<void> {
  const { uncheckToday } = await import('../../lib/habitActions')
  const r = await uncheckToday(seriesId)
  if (!r?.entry) return
  showUndoToast(r.label, r.entry.id)
  // The check-in it was offered for is gone: so is "How did it go?" (habit-notes D2).
  const notes = await import('./checkInNoteStore')
  if (notes.pendingFor(seriesId)) notes.closeNote()
}

/** Skip today (habits-complete D5) with the Undo toast. */
export async function skipWithUndo(seriesId: string): Promise<void> {
  const { skipToday } = await import('../../lib/habitActions')
  const r = await skipToday(seriesId)
  if (r?.entry) showUndoToast(r.label, r.entry.id)
}
