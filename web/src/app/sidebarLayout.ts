// Per-device sidebar layout (OpenSpec change ux-overhaul, app-shell "Resizable
// sidebar"): its width between 15 and 22.5 rem, and whether it is collapsed to
// icons. Device state, never synced.
import { readString, removeItem, writeString } from '../lib/deviceStorage'
import { createStore } from '../lib/store'

export const SIDEBAR_MIN_REM = 15
export const SIDEBAR_MAX_REM = 22.5
export const SIDEBAR_DEFAULT_REM = 16
/** The icon rail while collapsed. */
export const SIDEBAR_COLLAPSED_REM = 3.5

const WIDTH_KEY = 'ot.sidebar.width'
const COLLAPSED_KEY = 'ot.sidebar.collapsed'

export interface SidebarLayout { width: number; collapsed: boolean }

const DEFAULT: SidebarLayout = { width: SIDEBAR_DEFAULT_REM, collapsed: false }

function read(): SidebarLayout {
  const w = Number(readString(WIDTH_KEY))
  return { width: clamp(Number.isFinite(w) && w > 0 ? w : SIDEBAR_DEFAULT_REM), collapsed: readString(COLLAPSED_KEY) === '1' }
}

export const clamp = (rem: number): number => Math.min(SIDEBAR_MAX_REM, Math.max(SIDEBAR_MIN_REM, Math.round(rem * 2) / 2))

// Two keys, so a plain store that writes both (blocked storage: the layout lasts for this page).
const layout = createStore<SidebarLayout>('sidebarLayout', read(), () => {
  removeItem(WIDTH_KEY)
  removeItem(COLLAPSED_KEY)
  return DEFAULT
})

function set(next: SidebarLayout): void {
  writeString(WIDTH_KEY, String(next.width))
  writeString(COLLAPSED_KEY, next.collapsed ? '1' : '0')
  layout.set(next)
}

export function setSidebarWidth(rem: number): void {
  const width = clamp(rem)
  if (width !== layout.get().width) set({ ...layout.get(), width })
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (collapsed !== layout.get().collapsed) set({ ...layout.get(), collapsed })
}

export const toggleSidebarCollapsed = (): void => setSidebarCollapsed(!layout.get().collapsed)

export const sidebarLayout = layout.get
export const useSidebarLayout = layout.use

/**
 * The list's room beside a docked panel (tablet-layouts D2): the app frame keeps at
 * least this many rem, about 22 rem of list and its gutters, or the sidebar folds to
 * its icon rail while the panel is docked.
 */
export const LIST_ROOM_REM = 25

/**
 * Whether the sidebar is folded to icons for room now: only while a panel is docked
 * and the sidebar is open at `widthRem`. It folds when the frame is under
 * LIST_ROOM_REM, and unfolds only when the frame would still keep that room with the
 * sidebar back at its width, so the two never alternate. Never stored.
 */
export function foldForRoom(folded: boolean, docked: boolean, frameRem: number, widthRem: number): boolean {
  if (!docked) return false
  if (!folded) return frameRem < LIST_ROOM_REM
  return frameRem - (widthRem - SIDEBAR_COLLAPSED_REM) < LIST_ROOM_REM
}

/** Tests: back to the defaults. */
export function resetSidebarLayout(): void {
  removeItem(WIDTH_KEY)
  removeItem(COLLAPSED_KEY)
  layout.set(DEFAULT)
}
