// Whether the account has a live routine (routines-editor D10): the Inbox loads
// the card "Routines since your last visit" only then. Small on purpose: the
// Inbox reads it on first load.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

export function useHasRoutines(): boolean {
  return useLiveQuery(async () => (await db.rules.filter((r) => !r.deleted_at).count()) > 0, [], false)
}
