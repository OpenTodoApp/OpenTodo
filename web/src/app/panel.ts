// The shell's panel slot (OpenSpec change ux-overhaul, `app-shell` "The panel slot
// has an address", design D1). One occupant at a time: a custom occupant such as
// project activity, or a docked task. Views call `openTaskPanel` to open a task:
// since task-full-page (design D3) that opens the task page, unless the page on
// screen asked to keep tasks beside it (`setTaskSplit`, the Inbox's triage split)
// on a screen of at least 1024 px; then the task docks here, its id in `?task=`.
// `PanelHost`, rendered once by the shell, draws whatever is open.
import { type ReactNode, useSyncExternalStore } from 'react'
import type { Task } from '../lib/types'
import { openTaskPage } from './taskTrail'

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

/**
 * The page a panel belongs to. The Calendar's Day, Week, Month and Plan, at any date,
 * are one page: the planning list stays open while the user moves through days and
 * switches range (time-blocking "Planning list and phone agenda", GitHub issue 350).
 */
export function panelPage(pathname: string): string {
  const first = pathname.split('/')[1]
  return first === 'day' || first === 'week' || first === 'month' || first === 'plan' ? '/calendar' : pathname
}

function currentPath(): string {
  return panelPage(typeof location === 'undefined' ? '/' : location.pathname)
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

/**
 * The page on screen docks tasks beside its list instead of opening them as pages (set
 * while it is mounted). `empty` draws the slot while no task is docked: the Inbox's
 * "No task selected" (inbox-split D2); without it the slot stays closed.
 */
let split = false
let splitEmpty: (() => ReactNode) | null = null
export function setTaskSplit(on: boolean, empty?: () => ReactNode): () => void {
  split = on
  splitEmpty = on ? empty ?? null : null
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-task-split', on)
  emit()
  return () => {
    split = false
    splitEmpty = null
    if (typeof document !== 'undefined') document.documentElement.removeAttribute('data-task-split')
    emit()
  }
}

export const SPLIT_QUERY = '(min-width: 64rem)'
function docks(): boolean {
  return split && typeof matchMedia !== 'undefined' && matchMedia(SPLIT_QUERY).matches
}

/** Whether a task opened now docks beside the list (a split page on a wide enough screen). */
export function taskSplitDocks(): boolean {
  return docks()
}

/** What the slot shows while a split page has no task docked, or null. */
export function splitEmptyPane(): (() => ReactNode) | null {
  return split ? splitEmpty : null
}

/** Open a task: as a page, or docked in the slot on a page that keeps a split. */
export function openTaskPanel(id: string): void {
  if (!docks()) { openTaskPage(id); return }
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
  if (occupant && occupant.path !== panelPage(pathname)) closePanel()
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

/** The split page's empty pane, following `setTaskSplit`. */
export function useSplitEmptyPane(): (() => ReactNode) | null {
  return useSyncExternalStore(subscribe, splitEmptyPane, () => null)
}

export function usePanelHandlers(): PanelHandlers {
  return useSyncExternalStore(subscribe, panelHandlers, () => handlers)
}

/** Tests: forget the occupant and the handlers between cases. */
export function resetPanel(): void {
  occupant = null
  handlers = {}
  split = false
  splitEmpty = null
  emit()
}

/** The key of the custom occupant in the slot, or null (a task or nothing). */
export function usePanelOccupantKey(): string | null {
  const o = usePanel()
  return o?.kind === 'custom' ? o.key : null
}
