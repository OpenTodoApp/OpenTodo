// "Show shortcut hints" (OpenSpec change ux-overhaul, keyboard-shortcuts "Shortcut
// hints live in tooltips and menus"): a device-local switch in Settings → General →
// Keyboard. Off, no key badge is printed in the chrome (quick add, section headers,
// prompts); tooltips, menus, the palette and the cheat sheet show shortcuts always.
import { useSyncExternalStore } from 'react'

export const HINTS_KEY = 'opentodo.shortcutHints'
const listeners = new Set<() => void>()

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function shortcutHintsOn(): boolean {
  try { return storage()?.getItem(HINTS_KEY) === '1' } catch { return false }
}

export function setShortcutHints(on: boolean): void {
  try {
    if (on) storage()?.setItem(HINTS_KEY, '1')
    else storage()?.removeItem(HINTS_KEY)
  } catch {
    // Storage refused: the preference just does not stick.
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => { if (e.key === HINTS_KEY || e.key === null) fn() }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export function useShortcutHints(): boolean {
  return useSyncExternalStore(subscribe, shortcutHintsOn, () => false)
}
