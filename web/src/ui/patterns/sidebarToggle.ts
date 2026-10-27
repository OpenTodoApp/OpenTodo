// The sidebar toggle in the page header (precision-shell D2, app-shell "Sidebar toggle
// in the header"): the shell registers the sidebar's state and its toggle here, and every
// PageHeader shows the toggle as its first control, so the design system stays free of
// app code. Nothing registered (the workbench, a page outside the shell): no toggle.
import { createStore } from '../../lib/store'

export interface SidebarToggleState {
  /** The sidebar is the icon rail. */
  collapsed: boolean
  toggle: () => void
  /** The key that toggles it, for the tooltip. */
  shortcut?: string
}

// Tests: no shell left registered by an earlier test (the store's reset).
const store = createStore<SidebarToggleState | null>('sidebarToggle', null)

export const setSidebarToggle = store.set
export const useSidebarToggle = store.use
