// Which contextual help is open (OpenSpec change `user-documentation`, design D5).
// A tiny store so any screen, including a dialog, can open the help panel that the
// Shell renders on top, without unmounting what is underneath.
import { useSyncExternalStore } from 'react'

export interface HelpRequest { screen: string; trigger: HTMLElement | null }

let current: HelpRequest | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function openHelp(screen: string, trigger: HTMLElement | null = null): void {
  current = { screen, trigger }
  emit()
}

export function closeHelp(): void {
  if (!current) return
  current = null
  emit()
}

export function useHelpRequest(): HelpRequest | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => current, () => null)
}
