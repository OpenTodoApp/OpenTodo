// The shell's panel slot (OpenSpec change ux-overhaul, `app-shell` "The panel slot
// has an address", design D1). One occupant at a time: the open task (its id kept
// in `?task=` so a reload or a shared link reopens it) or a custom occupant such
// as project activity. Views call `openTaskPanel` instead of mounting the panel
// themselves; `PanelHost`, rendered once by the shell, draws whatever is open.
import { type ReactNode, useSyncExternalStore } from 'react'
import type { Task } from '../lib/types'

export type PanelOccupant =
  | { kind: 'task'; id: string; path: string }
  | { kind: 'custom'; key: string; path: string; render: () => ReactNode }

/** Hooks a list registers while mounted, so the panel's actions keep the list's follow-ups (parent prompt, archive offer). */
export interface PanelHandlers {
  toggleComplete?: (task: Task) => void
}

let occupant: PanelOccupant | null = null
let handlers: PanelHandlers = {}
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

const QUERY = 'task'

function currentPath(): string {
  return typeof location === 'undefined' ? '/' : location.pathname
}

/** Keep `?task=<id>` in the address without touching the history stack or the other query parameters. */
function syncQuery(id: string | null): void {
  if (typeof history === 'undefined' || typeof location === 'undefined') return
  const params = new URLSearchParams(location.search)
  if (id) params.set(QUERY, id)
  else if (params.has(QUERY)) params.delete(QUERY)
  else return
  const q = params.toString()
  history.replaceState(history.state, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`)
}

export function openTaskPanel(id: string): void {
  if (occupant?.kind === 'task' && occupant.id === id) return
  occupant = { kind: 'task', id, path: currentPath() }
  syncQuery(id)
  emit()
}

/** Show something other than a task in the slot (project activity, history, the planning list). */
export function openPanel(key: string, render: () => ReactNode): void {
  occupant = { kind: 'custom', key, path: currentPath(), render }
  syncQuery(null)
  emit()
}

export function closePanel(): void {
  if (!occupant) return
  occupant = null
  syncQuery(null)
  emit()
}

/** Close a panel opened for another page (the shell calls this on every route change). */
export function closePanelIfStale(pathname: string): void {
  if (occupant && occupant.path !== pathname) closePanel()
}

export function panelOccupant(): PanelOccupant | null {
  return occupant
}

export function panelTaskId(): string | null {
  return occupant?.kind === 'task' ? occupant.id : null
}

/** The list-side setter: a task id opens it, null closes the slot. */
export function setPanelTaskId(id: string | null): void {
  if (id) openTaskPanel(id)
  else closePanel()
}

export function registerPanelHandlers(h: PanelHandlers): () => void {
  handlers = h
  emit()
  return () => {
    if (handlers === h) {
      handlers = {}
      emit()
    }
  }
}

export function panelHandlers(): PanelHandlers {
  return handlers
}

/** The task id in the address on launch, if any. */
export function taskIdFromAddress(): string | null {
  if (typeof location === 'undefined') return null
  return new URLSearchParams(location.search).get(QUERY)
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function usePanel(): PanelOccupant | null {
  return useSyncExternalStore(subscribe, panelOccupant, () => null)
}

export function usePanelTaskId(): string | null {
  return useSyncExternalStore(subscribe, panelTaskId, () => null)
}

export function usePanelHandlers(): PanelHandlers {
  return useSyncExternalStore(subscribe, panelHandlers, () => handlers)
}

/** Tests: forget the occupant and the handlers between cases. */
export function resetPanel(): void {
  occupant = null
  handlers = {}
  emit()
}
