// A stamp of the custom themes a device applies (OpenSpec change theme-editor,
// design D1): it changes when one of them is saved or deleted on any device, so
// the appearance re-resolves it. First-load code: one indexed read per change.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

/** A text that changes whenever one of the given custom themes changes; "" for none. */
export function useCustomThemeStamp(ids: readonly string[]): string {
  return useLiveQuery(async () => ids.length
    ? JSON.stringify((await db.themes.bulkGet([...ids])).map((r) => (r ? [r.deleted_at, r._clock?.doc?.ts, r._clock?.doc?.device] : null)))
    : '', [ids.join(' ')], '')
}
