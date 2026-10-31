// Keeps <html> in step with the synced appearance (OpenSpec theming D7): mode and
// accent from the user_prefs row, applied on every change without remounting the
// app. The CSS follows the system preference by itself under "system"; only the
// bar colour metas are rewritten here. A custom accent (accent-colour D3, D4) is
// applied at once from the values cached on this device, then from the lazily
// loaded derivation, which wins if the two differ (a newer app version).
import { useEffect, type ReactNode } from 'react'
import { applyAppearance, cachedCustom, deriveCustom, readAppearance } from '../lib/appearance'
import { useUserPrefsRow } from '../lib/localData'

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // undefined while loading (keep what appearance.js applied); null when there is no row (the defaults).
  const row = useUserPrefsRow()
  const a = row === undefined ? null : readAppearance(row)
  const mode = a?.mode
  const accent = a?.accent
  const custom = a?.custom
  const density = a?.density
  useEffect(() => {
    if (!mode || !accent) return
    const value = { mode, accent, custom, density }
    if (accent !== 'custom' || !custom) {
      applyAppearance(value)
      return
    }
    let live = true
    const cached = cachedCustom(custom)
    if (cached) applyAppearance(value, document, cached)
    deriveCustom(custom).then((derived) => {
      if (live && JSON.stringify(derived) !== JSON.stringify(cached)) applyAppearance(value, document, derived)
    }, () => {
      // The chunk could not load (offline on a fresh version): the mode still applies, with the default accent.
      if (live && !cached) applyAppearance(value)
    })
    return () => { live = false }
  }, [mode, accent, custom, density])
  return <>{children}</>
}
