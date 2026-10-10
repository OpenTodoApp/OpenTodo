// Vim keybindings preference (OpenSpec `vim-keybindings`, design D1): one
// device-local flag in localStorage, never synced and never sent to the server.
// This module is in the main bundle (Shell and Settings read it); the Vim layer
// itself is loaded lazily only while the flag is on.
import { useSyncExternalStore } from 'react'

export const VIM_KEY = 'opentodo.vim'

const listeners = new Set<() => void>()

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Whether Vim keybindings are on for this device (off by default). */
export function isVimEnabled(): boolean {
  try {
    return storage()?.getItem(VIM_KEY) === '1'
  } catch {
    return false
  }
}

function notify(): void {
  listeners.forEach((fn) => fn())
}

/** Turn the layer on or off; takes effect at once, without a reload. */
export function setVimEnabled(on: boolean): void {
  try {
    if (on) storage()?.setItem(VIM_KEY, '1')
    else storage()?.removeItem(VIM_KEY)
  } catch {
    // Storage refused (private mode, quota): the preference just does not stick.
  }
  notify()
}

/** Sign-out wipes local data; the preference goes with it (App's logout calls this). */
export function clearVimPref(): void {
  setVimEnabled(false)
}

export function subscribeVim(fn: () => void): () => void {
  listeners.add(fn)
  // Another tab of the app toggled it.
  const onStorage = (e: StorageEvent) => {
    if (e.key === VIM_KEY || e.key === null) fn()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export function useVimEnabled(): boolean {
  return useSyncExternalStore(subscribeVim, isVimEnabled, () => false)
}
