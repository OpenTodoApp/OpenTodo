// Custom field definitions from the local store (OpenSpec custom-fields): live
// ones of every project, re-read on every change, so a definition added offline
// or synced from another device shows at once in panels, rows and filters.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { FieldDef } from '../lib/types'

const NONE: FieldDef[] = []

/** Every live field definition, in no particular order (use liveFields per project). */
export function useFieldDefs(): FieldDef[] {
  return useLiveQuery(() => db.fields.filter((d) => !d.deleted_at).toArray(), [], NONE)
}
