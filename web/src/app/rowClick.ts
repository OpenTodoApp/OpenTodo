// "Click a task to" (OpenSpec change inline-task-editing, design D6): a device-local
// choice between editing the title in place (the default) and opening the task's
// details, as clicks did before. Habits are per device and per pointer, so it does
// not sync. Read through a store so every list follows a change at once.
import { createStoredValue } from '../lib/deviceStorage'

export type RowClick = 'edit' | 'open'
export const ROW_CLICK_KEY = 'opentodo.rowClick'

// Another tab's choice applies here too (the storage event). Storage refused:
// the choice just does not stick.
const choice = createStoredValue<RowClick>(ROW_CLICK_KEY, {
  parse: (raw) => (raw === 'open' ? 'open' : 'edit'),
  serialize: (v) => (v === 'open' ? 'open' : null),
}, { crossTab: true, server: 'edit' })

export const rowClick = choice.get
export const setRowClick = choice.set
export const useRowClick = choice.use
