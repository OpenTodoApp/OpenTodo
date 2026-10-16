// Custom field definitions from the local store (OpenSpec custom-fields): live
// ones of every project, re-read on every change, so a definition added offline
// or synced from another device shows at once in panels, rows and filters. One
// shared live query serves every row (like the comment counts); it also keeps
// the names of deleted definitions for history wording.
import { liveQuery, type Subscription } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from '../lib/db'
import { rememberFieldNames } from '../lib/fieldNames'
import type { FieldDef } from '../lib/types'

const NONE: FieldDef[] = []
let live: FieldDef[] = NONE
let sub: Subscription | null = null
const listeners = new Set<() => void>()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (!sub) {
    sub = liveQuery(() => db.fields.toArray()).subscribe({
      next: (all) => {
        rememberFieldNames(all)
        live = all.filter((d) => !d.deleted_at)
        for (const l of listeners) l()
      },
      error: () => undefined,
    })
  }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0 && sub) {
      sub.unsubscribe()
      sub = null
      live = NONE
    }
  }
}

/** Every live field definition, in no particular order (use liveFields per project). */
export function useFieldDefs(): FieldDef[] {
  return useSyncExternalStore(subscribe, () => live, () => NONE)
}
