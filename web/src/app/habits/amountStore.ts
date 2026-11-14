// The open Set amount dialog (habit-targets D2): which habit's day.
import { createStore } from '../../lib/store'

export const amountTarget = createStore<{ seriesId: string; date: string } | null>('habitAmount', null)

export function openSetAmount(seriesId: string, date: string): void {
  amountTarget.set({ seriesId, date })
}
