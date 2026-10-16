// What the current page's header declares (OpenSpec change ux-overhaul, app-shell
// "No desktop top bar", design D3): below 768 px the shell's bar shows the title and
// the actions a view declared once in its PageHeader, so no view renders two headers.
import { type ReactNode, useSyncExternalStore } from 'react'

export interface PageBar {
  title: ReactNode
  /** A line under the title on phones (the board's current column). */
  subtitle?: ReactNode
  actions?: ReactNode
  overflow?: ReactNode
  /** A complete menu element in place of the default overflow (the project menu). */
  menu?: ReactNode
  help?: string
  back?: { label: string; href?: string; onClick: () => void }
}

let current: PageBar | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function setPageBar(bar: PageBar | null): void {
  current = bar
  emit()
}

export function pageBar(): PageBar | null {
  return current
}

export function usePageBar(): PageBar | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => current, () => null)
}
