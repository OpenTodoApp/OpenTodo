// Keeps <html> in step with the synced appearance (OpenSpec theming D7): mode and
// accent from the user_prefs row, applied on every change without remounting the
// app. The CSS follows the system preference by itself under "system"; only the
// bar colour metas are rewritten here. A custom accent (accent-colour D3, D4) is
// applied at once from the values cached on this device, then from the lazily
// loaded derivation, which wins if the two differ (a newer app version).
// The theme of each side (theme-engine D4 to D6): a side whose choice is a theme
// other than OpenTodo's applies the device's cached result at once, then the lazily
// loaded, freshly resolved one; under "system" the app follows the operating
// system's switch between the two sides.
import { useEffect, type ReactNode } from 'react'
import { applyAppearance, cachedCustom, deriveCustom, readAppearance, reapplyAppearance, setAppearanceThemes } from '../lib/appearance'
import { useUserPrefsRow } from '../lib/localData'
import { readThemeChoices } from '../lib/theme/choice'
import { readThemeCache, type AppliedTheme, type ThemeCache } from '../lib/theme/apply'

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // undefined while loading (keep what appearance.js applied); null when there is no row (the defaults).
  const row = useUserPrefsRow()
  const a = row === undefined ? null : readAppearance(row)
  const mode = a?.mode
  const accent = a?.accent
  const custom = a?.custom
  const density = a?.density
  const choices = row === undefined ? null : readThemeChoices(row)
  const lightId = choices?.light.status === 'theme' ? choices.light.id : null
  const darkId = choices?.dark.status === 'theme' ? choices.dark.id : null
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
  const loaded = row !== undefined
  useEffect(() => {
    if (!loaded) return
    const cache = readThemeCache()
    const keep = (side: 'light' | 'dark', id: string | null): AppliedTheme | undefined => (id && cache[side]?.id === id ? cache[side] : undefined)
    const now: ThemeCache = { ...(keep('light', lightId) ? { light: keep('light', lightId) } : {}), ...(keep('dark', darkId) ? { dark: keep('dark', darkId) } : {}) }
    setAppearanceThemes(now)
    if (!lightId && !darkId) return
    let live = true
    import('../lib/theme/load').then(async ({ loadAppliedTheme }) => {
      const [light, dark] = await Promise.all([lightId ? loadAppliedTheme(lightId, cache.light) : null, darkId ? loadAppliedTheme(darkId, cache.dark) : null])
      // An invalid or newer document reads as the side's default, without an op (themes "Format versions and migration").
      if (live) setAppearanceThemes({ ...(light ? { light } : {}), ...(dark ? { dark } : {}) })
    }, () => {
      // The chunk could not load (offline on a fresh version): the cached themes stay.
    })
    return () => { live = false }
  }, [loaded, lightId, darkId])
  // Under "system" with a theme on either side, follow the operating system's switch.
  useEffect(() => {
    if (mode !== 'system' || (!lightId && !darkId)) return
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const on = () => reapplyAppearance()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [mode, lightId, darkId])
  return <>{children}</>
}
