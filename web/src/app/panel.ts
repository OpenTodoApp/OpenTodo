// The shell's panel slot (OpenSpec change ux-overhaul, `app-shell` "The panel slot
// has an address", design D1). One occupant at a time: a custom occupant such as
// project activity, or a docked task. Views call `openTaskPanel` to open a task:
// since task-full-page (design D3) that opens the task page, unless the page on
// screen asked to keep tasks beside it (`setTaskSplit`, the Inbox's triage split)
// on a screen of at least 1024 px; then the task docks here, its id in `?task=`.
// `PanelHost`, rendered once by the shell, draws whatever is open. With the "Open tasks:
// In a side panel" preference (task-side-panel) every list keeps such a split too, of the
// kind `panel`: it is open or closed per device, and only an explicit open reopens it.
import { type ReactNode, useSyncExternalStore } from 'react'
import type { Task } from '../lib/types'
import { openTaskPage } from './taskTrail'
import { resettable } from '../lib/moduleState'

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
/** `split`: the Inbox's and the triage's own split; `panel`: a list with the side panel (task-side-panel D2). */
export type SplitKind = 'split' | 'panel'
let splitKind: SplitKind = 'split'
export function setTaskSplit(on: boolean, empty?: () => ReactNode, kind: SplitKind = 'split'): () => void {
  split = on
  splitEmpty = on ? empty ?? null : null
  splitKind = on ? kind : 'split'
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-task-split', on)
  if (on) applyPanelWidth()
  emit()
  return () => {
    split = false
    splitEmpty = null
    splitKind = 'split'
    if (typeof document !== 'undefined') document.documentElement.removeAttribute('data-task-split')
    emit()
  }
}

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/**
 * The side panel's open state (task-side-panel D4): kept on this device, open at first.
 * Only its Close (or Escape inside it) closes it; only an explicit open reopens it.
 */
export const SIDE_PANEL_CLOSED_KEY = 'opentodo.taskPanel.closed'
let sideOpen: boolean | null = null
export function sidePanelOpen(): boolean {
  if (sideOpen === null) {
    try { sideOpen = storage()?.getItem(SIDE_PANEL_CLOSED_KEY) !== '1' } catch { sideOpen = true }
  }
  return sideOpen
}
function setSidePanelOpen(open: boolean): void {
  if (sidePanelOpen() === open) return
  sideOpen = open
  try {
    if (open) storage()?.removeItem(SIDE_PANEL_CLOSED_KEY)
    else storage()?.setItem(SIDE_PANEL_CLOSED_KEY, '1')
  } catch {
    // Storage refused: the state holds for this session only.
  }
  emit()
}

/**
 * The docked task's width (task-side-panel D3): CSS pixels on this device, never synced,
 * read by `:root[data-task-split]` as `--task-panel-w` and bounded there.
 */
export const PANEL_WIDTH_KEY = 'opentodo.taskPanel.width'
export function storedPanelWidth(): number | null {
  try {
    const n = Number(storage()?.getItem(PANEL_WIDTH_KEY))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch { return null }
}
function applyPanelWidth(): void {
  setPanelWidth(storedPanelWidth(), false)
}
/** Sets (a number) or forgets (null: the default width) the docked task's width; `persist` keeps it on the device. */
export function setPanelWidth(px: number | null, persist = true): void {
  if (typeof document === 'undefined') return
  if (px) document.documentElement.style.setProperty('--task-panel-w', `${Math.round(px)}px`)
  else document.documentElement.style.removeProperty('--task-panel-w')
  if (!persist) return
  try {
    if (px) storage()?.setItem(PANEL_WIDTH_KEY, String(Math.round(px)))
    else storage()?.removeItem(PANEL_WIDTH_KEY)
  } catch {
    // Storage refused: the width holds until the next split.
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

/** Whether the page on screen keeps the side panel (task-side-panel) and the screen is wide enough. */
export function sidePanelDocks(): boolean {
  return docks() && splitKind === 'panel'
}

/** The kind of split the page on screen keeps, or null. */
export function splitKindNow(): SplitKind | null {
  return split ? splitKind : null
}

/** What the slot shows while a split page has no task docked, or null (also while the side panel is closed). */
export function splitEmptyPane(): (() => ReactNode) | null {
  if (!split || (splitKind === 'panel' && !sidePanelOpen())) return null
  return splitEmpty
}

function dock(id: string): void {
  if (occupant?.kind === 'task' && occupant.id === id) return
  occupant = { kind: 'task', id, path: currentPath() }
  syncQuery(id)
  emit()
}

/** Open a task: as a page, or docked in the slot on a page that keeps a split (an explicit open reopens a closed side panel). */
export function openTaskPanel(id: string): void {
  if (!docks()) { openTaskPage(id); return }
  if (splitKind === 'panel') setSidePanelOpen(true)
  dock(id)
}

/** The cursor moved (task-side-panel D4): the open side panel shows its task; a closed one stays closed. */
export function followTask(id: string): void {
  if (!sidePanelDocks() || !sidePanelOpen()) return
  dock(id)
}

/** The panel's Close (task-side-panel D4): on a side-panel page it also closes the panel until a task is opened again. */
export function closeTaskPanel(): void {
  if (sidePanelDocks()) setSidePanelOpen(false)
  closePanel()
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
  splitKind = 'split'
  sideOpen = null
  emit()
}
resettable('panel', resetPanel)

/** The page's split kind, following `setTaskSplit`. */
export function useSplitKind(): SplitKind | null {
  return useSyncExternalStore(subscribe, splitKindNow, () => null)
}

/** Whether the side panel is open on this device (task-side-panel D4). */
export function useSidePanelOpen(): boolean {
  return useSyncExternalStore(subscribe, sidePanelOpen, () => true)
}

/** The key of the custom occupant in the slot, or null (a task or nothing). */
export function usePanelOccupantKey(): string | null {
  const o = usePanel()
  return o?.kind === 'custom' ? o.key : null
}
