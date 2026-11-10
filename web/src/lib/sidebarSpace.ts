// The sidebar's space (OpenSpec change notes-space, design D1 to D3): Tasks or Notes,
// kept on this device only (never synced, never an op). The route decides it where
// the screen clearly belongs to one; neutral screens keep the last one.
import { readString, writeString } from './deviceStorage'
import { resettable } from './moduleState'
import { useEffect, useSyncExternalStore } from 'react'

export type Space = 'tasks' | 'notes'

export const SPACE_KEY = 'ot.sidebar.space'

/** Screens that keep the space as it was: they hold neither tasks nor notes, or both (the Trash). */
const NEUTRAL = new Set(['settings', 'help', 'import', 'theme-editor', 'ask', 'trash', 'invite', 'project-invite', 'workspace-invite', 'reset', 'confirm-email', 'forgot', 'verify', 'public', 'share', 'display'])

/** The space a screen belongs to, or null for a neutral one (D3). */
export function spaceOfView(view: string): Space | null {
  return view === 'notes' ? 'notes' : NEUTRAL.has(view) ? null : 'tasks'
}

const listeners = new Set<() => void>()
let space: Space = readString(SPACE_KEY) === 'notes' ? 'notes' : 'tasks'
resettable('sidebarSpace', () => { space = readString(SPACE_KEY) === 'notes' ? 'notes' : 'tasks' })

/** The space shown now. */
export const currentSpace = (): Space => space

/** Shows `next`, remembered on the device; storage refused, it holds for the visit. */
export function setSpace(next: Space): void {
  if (next === space) return
  space = next
  writeString(SPACE_KEY, next)
  listeners.forEach((fn) => fn())
}

/** Follows a route: its space when it has one, else unchanged. */
export function followView(view: string): void {
  const s = spaceOfView(view)
  if (s) setSpace(s)
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export function useSpace(): Space {
  return useSyncExternalStore(subscribe, currentSpace, currentSpace)
}

/** The space shown with the screen `view`: its own, else the chosen one; the choice follows the screen. */
export function useShownSpace(view: string): Space {
  const chosen = useSpace()
  useEffect(() => followView(view), [view])
  return spaceOfView(view) ?? chosen
}
