// Keeps <html> in step with the synced appearance (OpenSpec theming D7): mode and
// accent from the user_prefs row, applied on every change without remounting the
// app. The CSS follows the system preference by itself under "system"; only the
// bar colour metas are rewritten here.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, type ReactNode } from 'react'
import { applyAppearance, readAppearance } from '../lib/appearance'
import { db } from '../lib/db'
import { USER_PREFS_ID } from '../lib/userPrefs'

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // undefined while loading (keep what appearance.js applied); null when there is no row (the defaults).
  const row = useLiveQuery(async () => (await db.userPrefs.get(USER_PREFS_ID)) ?? null, [])
  const a = row === undefined ? null : readAppearance(row)
  const mode = a?.mode
  const accent = a?.accent
  useEffect(() => {
    if (mode && accent) applyAppearance({ mode, accent })
  }, [mode, accent])
  return <>{children}</>
}
