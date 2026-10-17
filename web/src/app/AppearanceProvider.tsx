// Keeps <html> in step with the synced appearance (OpenSpec theming D7): mode and
// accent from the user_prefs row, applied on every change without remounting the
// app. The CSS follows the system preference by itself under "system"; only the
// bar colour metas are rewritten here.
import { useEffect, type ReactNode } from 'react'
import { applyAppearance, readAppearance } from '../lib/appearance'
import { useUserPrefsRow } from '../lib/localData'

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // undefined while loading (keep what appearance.js applied); null when there is no row (the defaults).
  const row = useUserPrefsRow()
  const a = row === undefined ? null : readAppearance(row)
  const mode = a?.mode
  const accent = a?.accent
  const density = a?.density
  useEffect(() => {
    if (mode && accent) applyAppearance({ mode, accent, density })
  }, [mode, accent, density])
  return <>{children}</>
}
