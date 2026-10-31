// The Formatting toggle on a computer (OpenSpec change notes-toolbar-desktop):
// whether the formatting row is open is remembered on the device, separately for
// notes and for the comment composer (design D1). The synced setting that offers
// the toggle at all is lib/userPrefs (formattingButtonOn, D4); turning it off keeps this state.
import { useSyncExternalStore } from 'react'
import { readString, removeItem, writeString } from './deviceStorage'
import { resettable } from './moduleState'
import { createSignal } from './store'

export type FormattingSurface = 'notes' | 'comments'

const PREFIX = 'ot:formatting-row:'
/** The device key of a surface's remembered row. */
export const formattingRowKey = (surface: FormattingSurface) => `${PREFIX}${surface}`

// Kept in memory as well, so a press still works for this page when storage refuses it.
const memory = new Map<FormattingSurface, boolean>()
const changes = createSignal()
function get(surface: FormattingSurface): boolean {
  if (!memory.has(surface)) memory.set(surface, readString(formattingRowKey(surface)) === 'on')
  return memory.get(surface) as boolean
}

function subscribe(listener: () => void): () => void {
  const off = changes.subscribe(listener)
  // Another tab of the device changed it (or cleared the storage).
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && !e.key.startsWith(PREFIX)) return
    memory.clear()
    listener()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    off()
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

/** Remembers whether the surface's row is open on this device. */
export function setFormattingRow(surface: FormattingSurface, on: boolean): void {
  memory.set(surface, on)
  writeString(formattingRowKey(surface), on ? 'on' : null)
  changes.notify()
}

// Tests start as a fresh device: nothing remembered.
resettable('formattingRow', () => {
  memory.clear()
  removeItem(formattingRowKey('notes'))
  removeItem(formattingRowKey('comments'))
})

/**
 * Whether the surface's row is open on this device, and a way to change it; off
 * on a new device or when storage is unavailable. Every note (or composer) of the
 * device and its other tabs follow the change.
 */
export function useFormattingRow(surface: FormattingSurface): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => get(surface), () => false)
  return [on, (next) => setFormattingRow(surface, next)]
}
