// Per-device sidebar layout (OpenSpec change ux-overhaul, app-shell "Resizable
// sidebar"): its width between 15 and 22.5 rem, and whether it is collapsed to
// icons. Device state, never synced.
import { useSyncExternalStore } from 'react'
import { resettable } from '../lib/moduleState'

export const SIDEBAR_MIN_REM = 15
export const SIDEBAR_MAX_REM = 22.5
export const SIDEBAR_DEFAULT_REM = 16
/** The icon rail while collapsed. */
export const SIDEBAR_COLLAPSED_REM = 3.5

const WIDTH_KEY = 'ot.sidebar.width'
const COLLAPSED_KEY = 'ot.sidebar.collapsed'

export interface SidebarLayout { width: number; collapsed: boolean }

function read(): SidebarLayout {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY))
    return { width: clamp(Number.isFinite(w) && w > 0 ? w : SIDEBAR_DEFAULT_REM), collapsed: localStorage.getItem(COLLAPSED_KEY) === '1' }
  } catch {
    return { width: SIDEBAR_DEFAULT_REM, collapsed: false }
  }
}

export const clamp = (rem: number): number => Math.min(SIDEBAR_MAX_REM, Math.max(SIDEBAR_MIN_REM, Math.round(rem * 2) / 2))

let current: SidebarLayout = typeof localStorage === 'undefined' ? { width: SIDEBAR_DEFAULT_REM, collapsed: false } : read()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function write() {
  try {
    localStorage.setItem(WIDTH_KEY, String(current.width))
    localStorage.setItem(COLLAPSED_KEY, current.collapsed ? '1' : '0')
  } catch {
    // Private mode or blocked storage: the layout lasts for this page only.
  }
}

export function setSidebarWidth(rem: number): void {
  const width = clamp(rem)
  if (width === current.width) return
  current = { ...current, width }
  write()
  emit()
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (collapsed === current.collapsed) return
  current = { ...current, collapsed }
  write()
  emit()
}

export const toggleSidebarCollapsed = (): void => setSidebarCollapsed(!current.collapsed)

export function sidebarLayout(): SidebarLayout {
  return current
}

export function useSidebarLayout(): SidebarLayout {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => current, () => current)
}

/** Tests: back to the defaults. */
export function resetSidebarLayout(): void {
  current = { width: SIDEBAR_DEFAULT_REM, collapsed: false }
  try { localStorage.removeItem(WIDTH_KEY); localStorage.removeItem(COLLAPSED_KEY) } catch { /* ignore */ }
  emit()
}
resettable('sidebarLayout', resetSidebarLayout)
