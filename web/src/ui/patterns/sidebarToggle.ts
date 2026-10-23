// The sidebar toggle in the page header (precision-shell D2, app-shell "Sidebar toggle
// in the header"): the shell registers the sidebar's state and its toggle here, and every
// PageHeader shows the toggle as its first control, so the design system stays free of
// app code. Nothing registered (the workbench, a page outside the shell): no toggle.
import { useSyncExternalStore } from 'react'

export interface SidebarToggleState {
  /** The sidebar is the icon rail. */
  collapsed: boolean
  toggle: () => void
  /** The key that toggles it, for the tooltip. */
  shortcut?: string
}

let current: SidebarToggleState | null = null
const listeners = new Set<() => void>()

export function setSidebarToggle(state: SidebarToggleState | null): void {
  current = state
  listeners.forEach((fn) => fn())
}

export function useSidebarToggle(): SidebarToggleState | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => current, () => null)
}
