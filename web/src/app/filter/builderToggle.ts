// Whether the filter builder is shown (OpenSpec change filter-builder, design D5):
// a per-device choice per screen, kept in local storage and never synced.
import { useState } from 'react'

export type BuilderScreen = 'filter' | 'view'

const KEY = (screen: BuilderScreen) => `opentodo.filterBuilder.${screen}`
const DEFAULT_OPEN: Record<BuilderScreen, boolean> = { filter: true, view: false }

export function builderOpen(screen: BuilderScreen): boolean {
  try {
    const v = localStorage.getItem(KEY(screen))
    return v === null ? DEFAULT_OPEN[screen] : v === 'open'
  } catch {
    return DEFAULT_OPEN[screen]
  }
}

export function useBuilderOpen(screen: BuilderScreen): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => builderOpen(screen))
  const set = (next: boolean) => {
    setOpen(next)
    try {
      localStorage.setItem(KEY(screen), next ? 'open' : 'closed')
    } catch { /* storage unavailable: the choice lasts until reload */ }
  }
  return [open, set]
}
