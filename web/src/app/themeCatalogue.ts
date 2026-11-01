// The theme choice's data in Settings → Appearance (theme-engine D14, theme-catalogue
// D1, D6): the built-in catalogue, loaded lazily with Settings and kept for the
// session (never part of the first paint). Small: the Theme row with its cards, the
// families and the counterpart offer (ThemeRow.tsx) loads lazily.
import { useEffect, useState } from 'react'
import { BUILTIN_THEMES, type BuiltinTheme, type Side, type SideChoice } from '../lib/theme/choice'
import type { ThemeModePref } from '../lib/types'
import { resettable } from '../lib/moduleState'

export type CatalogueModule = typeof import('../lib/theme/builtin/index')
let loaded: CatalogueModule | null = null
resettable('themeCatalogue', () => { loaded = null })

/** The built-in catalogue, loaded on first use and kept for the session; null while it loads (or offline on a fresh version). */
export function useCatalogue(): CatalogueModule | null {
  const [mod, setMod] = useState<CatalogueModule | null>(loaded)
  useEffect(() => {
    if (mod) return
    let live = true
    import('../lib/theme/builtin/index').then((m) => { loaded = m; if (live) setMod(m) }, () => {})
    return () => { live = false }
  }, [mod])
  return mod
}

/** Every built-in theme this app has: the OpenTodo themes, then the catalogue once loaded. */
export function knownThemes(c: CatalogueModule | null): readonly BuiltinTheme[] | null {
  return c ? [...BUILTIN_THEMES, ...c.CATALOGUE] : null
}

/** What the lazy Theme row needs from Settings: the mode, both sides' choices and the catalogue. */
export interface ThemeSettingsProps {
  mode: ThemeModePref
  choices: Record<Side, SideChoice>
  catalogue: CatalogueModule | null
  /** The side shown has a theme other than OpenTodo's: the accent comes from it (theme-engine D7). */
  accentFromTheme?: boolean
}
